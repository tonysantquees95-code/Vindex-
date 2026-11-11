//! Segurança: estado do antivírus e do firewall do Windows, varredura pelo Microsoft Defender,
//! verificação de arquivos suspeitos (heurística própria), programas que iniciam com o Windows e arquivo "hosts".
//! O Vindex NÃO substitui um antivírus: ele usa o Defender e acrescenta verificações simples e explicáveis.
use crate::categorias::extensao;
use crate::organizador::QUARENTENA;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;

#[cfg(windows)]
fn sem_janela(c: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000) // CREATE_NO_WINDOW
}
#[cfg(not(windows))]
fn sem_janela(c: &mut Command) -> &mut Command {
    c
}

fn powershell(script: &str) -> Result<String, String> {
    let mut c = Command::new("powershell");
    c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    let o = sem_janela(&mut c).output().map_err(|e| format!("Não consegui chamar o PowerShell: {e}"))?;
    if !o.status.success() {
        return Err(String::from_utf8_lossy(&o.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&o.stdout).to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct EstadoProtecao {
    pub suportado: bool,
    pub antivirus_ligado: Option<bool>,
    pub tempo_real_ligado: Option<bool>,
    pub assinaturas_dias: Option<u64>,
    pub firewall: Vec<(String, bool)>,
    pub nota: String,
}

/// Lê o resultado JSON do PowerShell (objeto ou lista) e extrai o estado. Separado para poder ser testado.
pub fn interpretar_protecao(defender: &Value, firewall: &Value) -> EstadoProtecao {
    let b = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_bool());
    let fw = |v: &Value| -> Vec<(String, bool)> {
        let itens: Vec<&Value> = match v {
            Value::Array(a) => a.iter().collect(),
            Value::Object(_) => vec![v],
            _ => vec![],
        };
        itens.iter().filter_map(|p| Some((p.get("Name")?.as_str()?.to_string(), p.get("Enabled").map(|e| e.as_bool().unwrap_or_else(|| e.as_i64() == Some(1) || e.as_str() == Some("True")))?))).collect()
    };
    EstadoProtecao {
        suportado: true,
        antivirus_ligado: b(defender, "AntivirusEnabled"),
        tempo_real_ligado: b(defender, "RealTimeProtectionEnabled"),
        assinaturas_dias: defender.get("AntivirusSignatureAge").and_then(|x| x.as_u64()),
        firewall: fw(firewall),
        nota: String::new(),
    }
}

pub fn estado_protecao() -> EstadoProtecao {
    if !cfg!(windows) {
        return EstadoProtecao { suportado: false, nota: "A leitura do antivírus e do firewall funciona no Windows.".into(), ..Default::default() };
    }
    let defender = powershell("Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureAge | ConvertTo-Json -Compress");
    let firewall = powershell("Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress");
    match (defender, firewall) {
        (Ok(d), f) => {
            let d: Value = serde_json::from_str(d.trim()).unwrap_or(Value::Null);
            let f: Value = f.ok().and_then(|t| serde_json::from_str(t.trim()).ok()).unwrap_or(Value::Null);
            let mut e = interpretar_protecao(&d, &f);
            if e.antivirus_ligado.is_none() {
                e.nota = "Não consegui ler o estado do Microsoft Defender (pode haver outro antivírus instalado).".into();
            }
            e
        }
        (Err(m), _) => EstadoProtecao { suportado: true, nota: format!("Não consegui ler o estado do Defender: {m}"), ..Default::default() },
    }
}

/// Pede ao Microsoft Defender uma varredura rápida (sem pasta) ou de uma pasta. Pode demorar vários minutos.
pub fn defender_varrer(pasta: Option<&Path>) -> Result<String, String> {
    if !cfg!(windows) {
        return Err("A varredura pelo Microsoft Defender só existe no Windows.".into());
    }
    let script = match pasta {
        None => "Start-MpScan -ScanType QuickScan".to_string(),
        Some(p) => {
            if !p.is_dir() {
                return Err("A pasta não existe.".into());
            }
            let t = p.to_string_lossy().replace('\'', "''");
            format!("Start-MpScan -ScanType CustomScan -ScanPath '{t}'")
        }
    };
    powershell(&format!("{script}; $a = @(Get-MpThreatDetection | Where-Object {{ $_.InitialDetectionTime -gt (Get-Date).AddHours(-1) }}).Count; Write-Output $a"))
        .map(|s| {
            let n: u64 = s.trim().parse().unwrap_or(0);
            if n == 0 { "Varredura concluída: nenhuma ameaça encontrada.".to_string() } else { format!("Varredura concluída: o Defender detectou {n} ameaça(s). Abra a Segurança do Windows para ver e remover.") }
        })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Achado {
    pub caminho: PathBuf,
    /// "alto", "medio" ou "baixo"
    pub nivel: String,
    pub motivo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ResultadoVerificacao {
    pub analisados: usize,
    pub achados: Vec<Achado>,
}

const EXEC: &[&str] = &["exe", "scr", "com", "pif", "bat", "cmd", "msi", "js", "jse", "vbs", "vbe", "wsf", "ps1", "jar", "lnk", "hta", "cpl"];
const SCRIPT: &[&str] = &["bat", "cmd", "js", "jse", "vbs", "vbe", "wsf", "ps1", "hta", "cpl"];
const ISCA: &[&str] = &["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "gif", "txt", "mp3", "mp4", "zip", "rar"];
const EICAR: &[u8] = b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE";

/// Avalia um único arquivo. Só olha nome, extensão, tamanho e o começo do conteúdo (sem executar nada).
pub fn avaliar_arquivo(caminho: &Path, bytes: u64) -> Option<Achado> {
    let nome = caminho.file_name()?.to_string_lossy().to_string();
    let baixo = nome.to_lowercase();
    let ext = extensao(caminho);
    let mk = |nivel: &str, motivo: &str| Some(Achado { caminho: caminho.to_path_buf(), nivel: nivel.into(), motivo: motivo.into() });

    if bytes > 0 && bytes <= 2048 {
        let mut buf = Vec::new();
        if File::open(caminho).and_then(|f| f.take(2048).read_to_end(&mut buf)).is_ok() && buf.windows(EICAR.len()).any(|j| j == EICAR) {
            return mk("alto", "É o arquivo de teste de antivírus EICAR (inofensivo, mas todo antivírus deve acusar).");
        }
    }
    if nome.contains('\u{202E}') {
        return mk("alto", "O nome usa um caractere invisível que inverte o texto para disfarçar a extensão real.");
    }
    // "fatura.pdf.exe": parece um documento, mas é um programa
    if EXEC.contains(&ext.as_str()) {
        let sem_ext = baixo.trim_end_matches(&format!(".{ext}")).to_string();
        if let Some(anterior) = sem_ext.rsplit('.').next().filter(|a| sem_ext.contains('.') && ISCA.contains(a)) {
            return mk("alto", &format!("Parece um arquivo .{anterior}, mas na verdade é um programa .{ext} (extensão dupla)."));
        }
    }
    if ext == "scr" || ext == "pif" || ext == "hta" {
        return mk("alto", "Tipo de arquivo quase só usado por golpes e programas maliciosos.");
    }
    if SCRIPT.contains(&ext.as_str()) {
        return mk("medio", "Script que executa comandos no computador. Só abra se você mesmo o criou ou confia na origem.");
    }
    if ext == "lnk" {
        return mk("medio", "Atalho baixado: pode apontar para um comando escondido.");
    }
    if (ext == "exe" || ext == "msi") && bytes < 30_000 {
        return mk("medio", "Programa minúsculo: instaladores de verdade costumam ser maiores.");
    }
    if ext == "exe" || ext == "msi" || ext == "jar" {
        return mk("baixo", "Programa baixado: confirme que veio do site oficial antes de instalar.");
    }
    None
}

pub fn verificar_arquivos(raizes: &[PathBuf], profundidade: usize) -> ResultadoVerificacao {
    let mut r = ResultadoVerificacao::default();
    for raiz in raizes {
        for e in WalkDir::new(raiz).max_depth(profundidade).follow_links(false).into_iter().filter_entry(|d| d.file_name() != QUARENTENA).filter_map(Result::ok) {
            if !e.file_type().is_file() {
                continue;
            }
            r.analisados += 1;
            let bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
            if let Some(a) = avaliar_arquivo(e.path(), bytes) {
                r.achados.push(a);
            }
        }
    }
    let peso = |n: &str| match n { "alto" => 0, "medio" => 1, _ => 2 };
    r.achados.sort_by(|a, b| peso(&a.nivel).cmp(&peso(&b.nivel)).then_with(|| a.caminho.cmp(&b.caminho)));
    r.achados.truncate(500);
    r
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProgramaInicial {
    pub nome: String,
    pub comando: String,
    pub origem: String,
}

/// Lê linhas do `reg query`: "    Nome    REG_SZ    comando".
pub fn interpretar_reg(saida: &str, origem: &str) -> Vec<ProgramaInicial> {
    saida
        .lines()
        .filter_map(|l| {
            let l = l.trim_end();
            if !l.starts_with("    ") {
                return None;
            }
            let t = l.trim_start();
            let i = t.find("    REG_")?;
            let nome = t[..i].trim().to_string();
            let resto = t[i..].trim_start();
            let comando = resto.splitn(2, char::is_whitespace).nth(1)?.trim().to_string();
            if nome.is_empty() { None } else { Some(ProgramaInicial { nome, comando, origem: origem.into() }) }
        })
        .collect()
}

pub fn programas_iniciais() -> Vec<ProgramaInicial> {
    if !cfg!(windows) {
        return Vec::new();
    }
    let mut v = Vec::new();
    for (chave, origem) in [
        (r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "usuário"),
        (r"HKLM\Software\Microsoft\Windows\CurrentVersion\Run", "todos os usuários"),
    ] {
        let mut c = Command::new("reg");
        c.args(["query", chave]);
        if let Ok(o) = sem_janela(&mut c).output() {
            v.extend(interpretar_reg(&String::from_utf8_lossy(&o.stdout), origem));
        }
    }
    v
}

/// Linhas do arquivo "hosts" que redirecionam endereços (fora o localhost). Golpes costumam mexer nele.
pub fn interpretar_hosts(texto: &str) -> Vec<String> {
    texto
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter(|l| {
            let mut p = l.split_whitespace();
            let (Some(ip), Some(host)) = (p.next(), p.next()) else { return false };
            !(["127.0.0.1", "::1", "0.0.0.0"].contains(&ip) && ["localhost", "localhost.localdomain", "broadcasthost", "ip6-localhost"].contains(&host))
        })
        .map(String::from)
        .collect()
}

pub fn verificar_hosts() -> Vec<String> {
    let caminho = if cfg!(windows) {
        std::env::var_os("WINDIR").map(|w| PathBuf::from(w).join("System32/drivers/etc/hosts"))
    } else {
        Some(PathBuf::from("/etc/hosts"))
    };
    caminho.and_then(|c| std::fs::read_to_string(c).ok()).map(|t| interpretar_hosts(&t)).unwrap_or_default()
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn acha_eicar_extensao_dupla_e_scripts() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("teste.txt"), br"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*").unwrap();
        fs::write(t.path().join("fatura.pdf.exe"), vec![0u8; 50_000]).unwrap();
        fs::write(t.path().join("limpa.pdf"), b"%PDF").unwrap();
        fs::write(t.path().join("rodar.ps1"), b"echo oi").unwrap();
        fs::write(t.path().join("setup.exe"), vec![0u8; 5_000_000]).unwrap();
        fs::create_dir(t.path().join(QUARENTENA)).unwrap();
        fs::write(t.path().join(QUARENTENA).join("velho.scr"), b"x").unwrap();
        let r = verificar_arquivos(&[t.path().to_path_buf()], 3);
        assert_eq!(r.analisados, 5);
        let n = |nome: &str| r.achados.iter().find(|a| a.caminho.ends_with(nome)).map(|a| a.nivel.clone());
        assert_eq!(n("teste.txt").as_deref(), Some("alto"));
        assert_eq!(n("fatura.pdf.exe").as_deref(), Some("alto"));
        assert_eq!(n("rodar.ps1").as_deref(), Some("medio"));
        assert_eq!(n("setup.exe").as_deref(), Some("baixo"));
        assert_eq!(n("limpa.pdf"), None);
        assert!(r.achados[0].nivel == "alto");
    }

    #[test]
    fn interpreta_defender_e_firewall() {
        let e = interpretar_protecao(&json!({"AntivirusEnabled": true, "RealTimeProtectionEnabled": false, "AntivirusSignatureAge": 2}), &json!([{"Name":"Domain","Enabled":true},{"Name":"Public","Enabled":false}]));
        assert_eq!(e.antivirus_ligado, Some(true));
        assert_eq!(e.tempo_real_ligado, Some(false));
        assert_eq!(e.assinaturas_dias, Some(2));
        assert_eq!(e.firewall, vec![("Domain".to_string(), true), ("Public".to_string(), false)]);
    }

    #[test]
    fn interpreta_inicializacao_e_hosts() {
        let saida = "\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\n    Discord    REG_SZ    \"C:\\Users\\a\\Discord\\Update.exe\" --processStart Discord.exe\n    OneDrive    REG_SZ    \"C:\\OneDrive.exe\" /background\n";
        let p = interpretar_reg(saida, "usuário");
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].nome, "Discord");
        assert!(p[0].comando.contains("Update.exe"));
        let h = interpretar_hosts("# comentário\n127.0.0.1 localhost\n::1 localhost\n1.2.3.4 banco.com.br\n\n");
        assert_eq!(h, vec!["1.2.3.4 banco.com.br".to_string()]);
    }
}
