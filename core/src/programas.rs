//! Desinstalador (Windows): lista os programas instalados, chama o desinstalador de cada um e, depois,
//! procura os restos que ele costuma deixar (pastas em AppData/ProgramData/Arquivos de Programas e a chave do próprio programa).
//! O cliente só manda o `id` do programa. Nenhum comando nem caminho vem de fora: tudo é refeito aqui a partir do registro.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
fn sem_janela(c: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000) // CREATE_NO_WINDOW
}
#[cfg(not(windows))]
fn sem_janela(c: &mut Command) -> &mut Command {
    c
}

/// O que a interface vê (sem nenhum comando).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Programa {
    pub id: String,
    pub nome: String,
    pub editora: String,
    pub versao: String,
    pub bytes: u64,
    #[serde(rename = "instaladoEm")]
    pub instalado_em: String,
    pub local: String,
    pub sistema: bool,
    pub silencioso: bool,
}

#[derive(Debug, Clone, PartialEq)]
struct Registro {
    programa: Programa,
    desinstalar: String,
    quieto: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Resto {
    pub caminho: String,
    pub bytes: u64,
    pub tipo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResultadoDesinstalar {
    pub removido: bool,
    pub codigo: Option<i32>,
    pub restos: Vec<Resto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResultadoRestos {
    pub apagados: u32,
    pub bytes: u64,
    pub falhas: Vec<String>,
}

fn memoria() -> &'static Mutex<Vec<Registro>> {
    static M: OnceLock<Mutex<Vec<Registro>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(Vec::new()))
}

fn texto(v: &Value, campo: &str) -> String {
    match v.get(campo) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn numero(v: &Value, campo: &str) -> u64 {
    match v.get(campo) {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0),
        Some(Value::String(s)) => s.trim().parse().unwrap_or(0),
        _ => 0,
    }
}

/// "20240315" → "2024-03-15" (o registro guarda a data assim; qualquer outra coisa vira vazio).
fn data_bonita(d: &str) -> String {
    if d.len() == 8 && d.chars().all(|c| c.is_ascii_digit()) {
        format!("{}-{}-{}", &d[..4], &d[4..6], &d[6..])
    } else {
        String::new()
    }
}

/// Entende o JSON que o PowerShell devolve (uma lista, ou um objeto só quando há apenas um programa).
pub fn interpretar(json: &str) -> Vec<Registro2> {
    let bruto: Value = match serde_json::from_str(json.trim().trim_start_matches('\u{feff}')) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let itens: Vec<Value> = match bruto {
        Value::Array(a) => a,
        Value::Object(_) => vec![bruto],
        _ => Vec::new(),
    };
    let mut vistos: HashSet<(String, String)> = HashSet::new();
    let mut r = Vec::new();
    for v in itens {
        let nome = texto(&v, "nome");
        let id = texto(&v, "id");
        let un = texto(&v, "un");
        let quieto = texto(&v, "quieto");
        if nome.is_empty() || id.is_empty() || (un.is_empty() && quieto.is_empty()) {
            continue;
        }
        // componentes do sistema, atualizações (KB…) e itens que o Windows não deixa remover ficam de fora
        if numero(&v, "sistema") == 1 || !texto(&v, "pai").is_empty() || numero(&v, "nao_remover") == 1 {
            continue;
        }
        let baixo = nome.to_lowercase();
        if baixo.starts_with("update for ") || baixo.starts_with("security update") || baixo.starts_with("hotfix") || (baixo.starts_with("kb") && baixo.len() < 12) {
            continue;
        }
        let versao = texto(&v, "versao");
        if !vistos.insert((baixo, versao.clone())) {
            continue;
        }
        r.push(Registro2 {
            id: id.clone(),
            nome,
            editora: texto(&v, "editora"),
            versao,
            bytes: numero(&v, "kb") * 1024,
            instalado_em: data_bonita(&texto(&v, "data")),
            local: texto(&v, "local").trim_matches('"').to_string(),
            desinstalar: un,
            quieto,
        });
    }
    r.sort_by(|a, b| a.nome.to_lowercase().cmp(&b.nome.to_lowercase()));
    r
}

/// Registro já interpretado, antes de virar `Registro`.
#[derive(Debug, Clone, PartialEq)]
pub struct Registro2 {
    pub id: String,
    pub nome: String,
    pub editora: String,
    pub versao: String,
    pub bytes: u64,
    pub instalado_em: String,
    pub local: String,
    pub desinstalar: String,
    pub quieto: String,
}

impl From<Registro2> for Registro {
    fn from(r: Registro2) -> Registro {
        Registro {
            programa: Programa {
                id: r.id,
                nome: r.nome,
                editora: r.editora,
                versao: r.versao,
                bytes: r.bytes,
                instalado_em: r.instalado_em,
                local: r.local,
                sistema: false,
                silencioso: !r.quieto.is_empty(),
            },
            desinstalar: r.desinstalar,
            quieto: r.quieto,
        }
    }
}

const SCRIPT_LISTAR: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8
$r=@()
foreach($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'){
 $r += Get-ItemProperty -Path $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
  [pscustomobject]@{ id=($_.PSPath -replace '^.*::',''); nome=$_.DisplayName; editora=$_.Publisher; versao=$_.DisplayVersion; kb=$_.EstimatedSize; data=$_.InstallDate; local=$_.InstallLocation; un=$_.UninstallString; quieto=$_.QuietUninstallString; sistema=$_.SystemComponent; pai=$_.ParentKeyName; nao_remover=$_.NoRemove } } }
if($r.Count -eq 0){ '[]' } else { ConvertTo-Json -InputObject @($r) -Compress -Depth 3 }"#;

fn powershell(script: &str) -> Result<String, String> {
    let mut c = Command::new("powershell");
    c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    let o = sem_janela(&mut c).output().map_err(|e| format!("Não consegui chamar o PowerShell: {e}"))?;
    if !o.status.success() {
        return Err(String::from_utf8_lossy(&o.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&o.stdout).to_string())
}

fn ler_registros() -> Result<Vec<Registro>, String> {
    if !cfg!(windows) {
        return Ok(Vec::new());
    }
    let saida = powershell(SCRIPT_LISTAR)?;
    Ok(interpretar(&saida).into_iter().map(Registro::from).collect())
}

/// Lista os programas e guarda os comandos só aqui dentro.
pub fn listar() -> Result<Vec<Programa>, String> {
    let regs = ler_registros()?;
    let lista = regs.iter().map(|r| r.programa.clone()).collect();
    if let Ok(mut m) = memoria().lock() {
        *m = regs;
    }
    Ok(lista)
}

fn achar(id: &str) -> Result<Registro, String> {
    let guardado = memoria().lock().ok().and_then(|m| m.iter().find(|r| r.programa.id == id).cloned());
    guardado.ok_or_else(|| "Esse programa não está na lista. Atualize a lista e tente de novo.".to_string())
}

/// O instalador do Windows às vezes registra "/I" (instalar/reparar) em vez de "/X" (remover).
pub fn comando_final(r: &str, silencioso: bool, quieto: &str) -> String {
    if silencioso && !quieto.is_empty() {
        return quieto.to_string();
    }
    let baixo = r.to_lowercase();
    if baixo.contains("msiexec") {
        if let Some(i) = baixo.find("/i{").or_else(|| baixo.find("/i {")) {
            let mut s = r.to_string();
            s.replace_range(i + 1..i + 2, "X");
            return s;
        }
    }
    r.to_string()
}

#[cfg(windows)]
fn executar_comando(cmd: &str) -> Result<Option<i32>, String> {
    use std::os::windows::process::CommandExt;
    let mut c = Command::new("cmd");
    c.raw_arg("/C").raw_arg(format!("\"{cmd}\""));
    let st = c.status().map_err(|e| format!("Não consegui abrir o desinstalador: {e}"))?;
    Ok(st.code())
}
#[cfg(not(windows))]
fn executar_comando(_cmd: &str) -> Result<Option<i32>, String> {
    Err("O desinstalador de programas é só para Windows.".into())
}

fn ainda_instalado(id: &str) -> bool {
    ler_registros().map(|v| v.iter().any(|r| r.programa.id == id)).unwrap_or(true)
}

/// Roda o desinstalador do próprio programa e espera até ele sumir da lista (alguns se copiam e fecham na hora).
pub fn desinstalar(id: &str, silencioso: bool) -> Result<ResultadoDesinstalar, String> {
    let r = achar(id)?;
    let cmd = comando_final(&r.desinstalar, silencioso, &r.quieto);
    if cmd.trim().is_empty() {
        return Err("Este programa não informou como se desinstala.".into());
    }
    let codigo = executar_comando(&cmd)?;
    let mut removido = false;
    for _ in 0..8 {
        if !ainda_instalado(id) {
            removido = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
    let restos = if removido { procurar_restos(&r.programa) } else { Vec::new() };
    Ok(ResultadoDesinstalar { removido, codigo, restos })
}

// ------------------------------------------------------------------ restos

const PROTEGIDAS: [&str; 14] = [
    "common files", "windowsapps", "microsoft", "windows", "system32", "internet explorer", "windows nt", "programs", "packages",
    "microsoft shared", "windows defender", "temp", "desktop", "downloads",
];

/// "Meu App 2.1.0" → "Meu App": tira da ponta as partes que parecem versão.
pub fn nome_base(nome: &str) -> String {
    let mut partes: Vec<&str> = nome.split_whitespace().collect();
    while partes.len() > 1 {
        let p = partes[partes.len() - 1];
        let versao = p.trim_start_matches(['v', 'V']).chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false);
        if versao || p.starts_with('(') || p == "-" {
            partes.pop();
        } else {
            break;
        }
    }
    partes.join(" ")
}

fn nome_seguro_de_pasta(n: &str) -> bool {
    let n = n.trim();
    n.len() >= 3
        && !n.chars().any(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\'' | '`' | '$' | '%' | '[' | ']'))
        && !PROTEGIDAS.contains(&n.to_lowercase().as_str())
}

fn pasta_do_ambiente(v: &str) -> Option<PathBuf> {
    std::env::var_os(v).map(PathBuf::from).filter(|p| p.is_absolute())
}

fn raizes_permitidas() -> Vec<PathBuf> {
    let mut r = Vec::new();
    for v in ["APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(p) = pasta_do_ambiente(v) {
            r.push(p);
        }
    }
    if let Some(l) = pasta_do_ambiente("LOCALAPPDATA") {
        r.push(l.join("Programs"));
    }
    r
}

fn tamanho_da_pasta(p: &Path) -> u64 {
    walkdir::WalkDir::new(p).into_iter().filter_map(|e| e.ok()).filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()
}

/// Uma pasta só é candidata se estiver direto dentro de uma das raízes permitidas e não for uma pasta do sistema.
pub fn pasta_candidata(p: &Path, raizes: &[PathBuf]) -> bool {
    let Some(nome) = p.file_name().and_then(|n| n.to_str()) else { return false };
    if !nome_seguro_de_pasta(nome) {
        return false;
    }
    let Some(pai) = p.parent() else { return false };
    raizes.iter().any(|r| pai.eq(r.as_path()) || pai.to_string_lossy().eq_ignore_ascii_case(&r.to_string_lossy()))
}

fn candidatas(p: &Programa, raizes: &[PathBuf]) -> Vec<PathBuf> {
    let mut nomes = vec![nome_base(&p.nome)];
    if !p.local.is_empty() {
        if let Some(n) = Path::new(&p.local).file_name().and_then(|n| n.to_str()) {
            nomes.push(n.to_string());
        }
    }
    let mut v: Vec<PathBuf> = Vec::new();
    if !p.local.is_empty() {
        v.push(PathBuf::from(p.local.trim_end_matches(['\\', '/'])));
    }
    for r in raizes {
        for n in &nomes {
            if nome_seguro_de_pasta(n) {
                v.push(r.join(n));
            }
        }
    }
    let mut vistos = HashSet::new();
    v.into_iter().filter(|c| pasta_candidata(c, raizes) && c.is_dir() && vistos.insert(c.to_string_lossy().to_lowercase())).collect()
}

fn chave_do_programa(p: &Programa) -> Option<String> {
    let n = nome_base(&p.nome);
    if nome_seguro_de_pasta(&n) && n.chars().all(|c| c.is_alphanumeric() || matches!(c, ' ' | '.' | '-' | '_')) {
        Some(format!(r"HKCU:\Software\{n}"))
    } else {
        None
    }
}

fn chave_existe(chave: &str) -> bool {
    powershell(&format!("if(Test-Path -LiteralPath '{}'){{'sim'}}", chave.replace('\'', "''"))).map(|s| s.trim() == "sim").unwrap_or(false)
}

pub fn procurar_restos(p: &Programa) -> Vec<Resto> {
    if !cfg!(windows) {
        return Vec::new();
    }
    let raizes = raizes_permitidas();
    let mut r: Vec<Resto> = candidatas(p, &raizes)
        .into_iter()
        .map(|c| Resto { bytes: tamanho_da_pasta(&c), caminho: c.to_string_lossy().to_string(), tipo: "pasta".into() })
        .collect();
    if let Some(k) = chave_do_programa(p) {
        if chave_existe(&k) {
            r.push(Resto { caminho: k, bytes: 0, tipo: "registro".into() });
        }
    }
    r
}

/// Apaga só o que `procurar_restos` achar de novo para esse programa (nada que venha do cliente).
pub fn limpar_restos(id: &str) -> Result<ResultadoRestos, String> {
    let p = achar(id)?.programa;
    if !cfg!(windows) {
        return Err("A limpeza de restos é só para Windows.".into());
    }
    if ainda_instalado(id) {
        return Err("O programa ainda está instalado. Desinstale primeiro.".into());
    }
    let mut res = ResultadoRestos { apagados: 0, bytes: 0, falhas: Vec::new() };
    for r in procurar_restos(&p) {
        if r.tipo == "pasta" {
            match std::fs::remove_dir_all(&r.caminho) {
                Ok(()) => { res.apagados += 1; res.bytes += r.bytes; }
                Err(e) => res.falhas.push(format!("{}: {e}", r.caminho)),
            }
        } else {
            match powershell(&format!("Remove-Item -LiteralPath '{}' -Recurse -Force -ErrorAction Stop", r.caminho.replace('\'', "''"))) {
                Ok(_) => res.apagados += 1,
                Err(e) => res.falhas.push(format!("{}: {e}", r.caminho)),
            }
        }
    }
    if let Ok(mut m) = memoria().lock() {
        m.retain(|x| x.programa.id != id);
    }
    Ok(res)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn interpreta_lista_filtra_sistema_e_atualizacoes() {
        let j = r#"[
          {"id":"HKEY_LOCAL_MACHINE\\SOFTWARE\\X\\Uninstall\\A","nome":"Meu App","editora":"Eu","versao":"2.1.0","kb":2048,"data":"20240315","local":"\"C:\\Program Files\\Meu App\\\"","un":"\"C:\\x\\unins000.exe\"","quieto":"\"C:\\x\\unins000.exe\" /SILENT"},
          {"id":"B","nome":"Componente","un":"x","sistema":1},
          {"id":"C","nome":"Update for Windows (KB123)","un":"x"},
          {"id":"D","nome":"Filho","un":"x","pai":"A"},
          {"id":"E","nome":"Sem desinstalador"},
          {"id":"F","nome":"Meu App","versao":"2.1.0","un":"y"},
          {"id":"G","nome":"Abc","un":"z","nao_remover":1}
        ]"#;
        let r = interpretar(j);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].nome, "Meu App");
        assert_eq!(r[0].bytes, 2048 * 1024);
        assert_eq!(r[0].instalado_em, "2024-03-15");
        assert_eq!(r[0].local, r"C:\Program Files\Meu App\");
        let p: Registro = r[0].clone().into();
        assert!(p.programa.silencioso);
    }

    #[test]
    fn um_objeto_so_tambem_vale_e_lixo_nao_quebra() {
        assert_eq!(interpretar(r#"{"id":"A","nome":"Unico","un":"u"}"#).len(), 1);
        assert!(interpretar("não é json").is_empty());
        assert!(interpretar("[]").is_empty());
    }

    #[test]
    fn comando_do_msi_vira_remover_e_silencioso_so_quando_existe() {
        assert_eq!(comando_final("MsiExec.exe /I{ABC-123}", false, ""), "MsiExec.exe /X{ABC-123}");
        assert_eq!(comando_final("MsiExec.exe /X{ABC-123}", false, ""), "MsiExec.exe /X{ABC-123}");
        assert_eq!(comando_final("\"a.exe\"", true, "\"a.exe\" /S"), "\"a.exe\" /S");
        assert_eq!(comando_final("\"a.exe\"", true, ""), "\"a.exe\"");
    }

    #[test]
    fn nome_base_tira_versao_e_protege_pastas_do_sistema() {
        assert_eq!(nome_base("Meu App 2.1.0"), "Meu App");
        assert_eq!(nome_base("Jogo v3 (64-bit)"), "Jogo");
        assert_eq!(nome_base("Simples"), "Simples");
        assert!(!nome_seguro_de_pasta("Microsoft"));
        assert!(!nome_seguro_de_pasta("Windows"));
        assert!(!nome_seguro_de_pasta("a/b"));
        assert!(!nome_seguro_de_pasta("ab"));
        assert!(nome_seguro_de_pasta("Meu App"));
    }

    #[test]
    fn so_pasta_direta_de_raiz_permitida_vira_candidata() {
        let raizes = vec![PathBuf::from("/dados/AppData"), PathBuf::from("/dados/ProgramFiles")];
        assert!(pasta_candidata(Path::new("/dados/AppData/Meu App"), &raizes));
        assert!(pasta_candidata(Path::new("/dados/ProgramFiles/Jogo"), &raizes));
        assert!(!pasta_candidata(Path::new("/dados/AppData/Meu App/dentro"), &raizes), "só direto dentro da raiz");
        assert!(!pasta_candidata(Path::new("/outro/Meu App"), &raizes));
        assert!(!pasta_candidata(Path::new("/dados/ProgramFiles/Common Files"), &raizes));
        assert!(!pasta_candidata(Path::new("/dados"), &raizes));
    }

    #[test]
    fn candidatas_acham_so_pastas_que_existem() {
        let t = tempfile::tempdir().unwrap();
        let raiz = t.path().join("AppData");
        std::fs::create_dir_all(raiz.join("Meu App/dados")).unwrap();
        std::fs::create_dir_all(raiz.join("Outro")).unwrap();
        let p = Programa { id: "x".into(), nome: "Meu App 1.0".into(), editora: "Eu".into(), versao: "1.0".into(), bytes: 0, instalado_em: String::new(), local: String::new(), sistema: false, silencioso: false };
        let c = candidatas(&p, &[raiz.clone()]);
        assert_eq!(c, vec![raiz.join("Meu App")]);
    }
}
