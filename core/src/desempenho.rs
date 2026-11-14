//! Desempenho do Windows: tempo de inicialização e programas que iniciam junto, otimização inteligente de disco
//! (desfragmenta HDD, faz TRIM em SSD) e estado da memória. Tudo que mexe no sistema é reversível e só age sobre
//! itens que o próprio motor listou (o cliente nunca manda comandos nem caminhos).
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

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
    let completo = format!("[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; {script}");
    let mut c = Command::new("powershell");
    c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &completo]);
    let o = sem_janela(&mut c).output().map_err(|e| format!("Não consegui chamar o PowerShell: {e}"))?;
    let saida = String::from_utf8_lossy(&o.stdout).to_string();
    if !o.status.success() {
        let erro = String::from_utf8_lossy(&o.stderr).trim().to_string();
        return Err(traduzir_erro(if erro.is_empty() { &saida } else { &erro }));
    }
    Ok(saida)
}

/// Mensagem em português para o erro mais comum (falta de permissão de administrador).
pub fn traduzir_erro(texto: &str) -> String {
    let t = texto.to_lowercase();
    if ["administrador", "administrator", "acesso negado", "access is denied", "elevad", "privilég", "privileg"].iter().any(|p| t.contains(p)) {
        "O Windows pediu permissão de administrador. Feche o Vindex e abra de novo com botão direito → Executar como administrador.".into()
    } else {
        let limpo: String = texto.trim().chars().take(300).collect();
        if limpo.is_empty() { "O Windows não respondeu.".into() } else { limpo }
    }
}

/// Aceita tanto um array quanto um objeto solto (o PowerShell serializa lista de um item só como objeto).
fn lista(v: &Value) -> Vec<Value> {
    match v {
        Value::Array(a) => a.clone(),
        Value::Null => Vec::new(),
        outro => vec![outro.clone()],
    }
}
fn texto(v: &Value, k: &str) -> String {
    v.get(k).map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).unwrap_or_default()
}
fn numero(v: &Value, k: &str) -> u64 {
    v.get(k).and_then(|x| x.as_u64().or_else(|| x.as_f64().map(|f| f.max(0.0) as u64)).or_else(|| x.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0)
}

// ------------------------------------------------------------------ inicialização

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ItemInicio {
    pub id: String,
    pub nome: String,
    pub comando: String,
    pub origem: String,
    pub local: String,
    pub ligado: bool,
    /// "alto" | "medio" | "baixo" | "nao_medido"
    pub impacto: String,
    pub atraso_ms: Option<u64>,
    /// segurança, drivers e itens do próprio Windows: o Vindex não sugere desligar
    pub protegido: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Inicializacao {
    pub suportado: bool,
    pub boot_ms: Option<u64>,
    pub boot_quando: Option<String>,
    pub historico_ms: Vec<u64>,
    pub itens: Vec<ItemInicio>,
    /// quanto o Windows deve ganhar se os itens lentos e não protegidos forem desligados
    pub economia_possivel_ms: u64,
    pub nota: String,
}

const LOCAIS: &[(&str, &str)] = &[
    ("hkcu_run", "usuário"),
    ("hklm_run", "todos os usuários"),
    ("hklm_run32", "todos os usuários (32 bits)"),
    ("pasta_usuario", "pasta Iniciar do usuário"),
    ("pasta_comum", "pasta Iniciar de todos"),
];

fn origem_de(local: &str) -> &'static str {
    LOCAIS.iter().find(|(l, _)| *l == local).map(|(_, o)| *o).unwrap_or("outro")
}

/// Alto ≥ 2 s de atraso no boot, médio ≥ 0,5 s.
pub fn classificar(atraso_ms: Option<u64>) -> &'static str {
    match atraso_ms {
        None => "nao_medido",
        Some(a) if a >= 2000 => "alto",
        Some(a) if a >= 500 => "medio",
        Some(_) => "baixo",
    }
}

/// Nome do executável em minúsculas, sem aspas, caminho nem extensão: `"C:\A\Teams.exe" --x` → `teams`.
pub fn exe_de(comando: &str) -> String {
    let c = comando.trim();
    let base = if let Some(resto) = c.strip_prefix('"') { resto.split('"').next().unwrap_or("") } else { c.split(" -").next().unwrap_or(c).split(" /").next().unwrap_or(c) };
    let arq = base.rsplit(['\\', '/']).next().unwrap_or(base).trim();
    let sem_ext = arq.rsplit_once('.').map(|(a, _)| a).unwrap_or(arq);
    sem_ext.to_lowercase()
}

/// Itens que o Vindex nunca sugere desligar: antivírus/segurança, drivers de áudio/vídeo/toque e coisas do Windows.
pub fn protegido(nome: &str, comando: &str) -> bool {
    let t = format!("{} {}", nome, comando).to_lowercase();
    ["defender", "security", "antivirus", "antivírus", "kaspersky", "avast", "avg", "bitdefender", "norton", "mcafee", "windows\\system32", "windows\\syswow64", "realtek", "nahimic", "synaptics", "touchpad", "elan", "intel(r)", "igfx", "nvidia", "radeon", "amd", "wacom", "ctfmon", "securityhealth", "onedrive"]
        .iter()
        .any(|p| t.contains(p))
        // OneDrive é sincronização que a pessoa pode querer ligada: fica protegido só para não ser marcado sozinho
}

/// Junta o que o PowerShell leu (itens, boots e atrasos medidos pelo Windows) no formato da interface.
pub fn montar(bruto: &Value) -> Inicializacao {
    let boots = lista(bruto.get("boot").unwrap_or(&Value::Null));
    let historico: Vec<u64> = boots.iter().map(|b| numero(b, "ms")).filter(|m| *m > 0).collect();
    let ultimo = boots.iter().find(|b| numero(b, "ms") > 0);
    // atraso medido pelo Windows por programa: guarda o maior
    let mut atrasos: Vec<(String, String, u64)> = Vec::new(); // (nome do exe, nome amigável, atraso)
    for a in lista(bruto.get("apps").unwrap_or(&Value::Null)) {
        let nome = texto(&a, "nome").to_lowercase();
        let amigavel = texto(&a, "amigavel").to_lowercase();
        let atraso = numero(&a, "atraso");
        if nome.is_empty() && amigavel.is_empty() {
            continue;
        }
        match atrasos.iter_mut().find(|(n, f, _)| *n == nome && *f == amigavel) {
            Some(x) => x.2 = x.2.max(atraso),
            None => atrasos.push((nome, amigavel, atraso)),
        }
    }
    let mut itens: Vec<ItemInicio> = lista(bruto.get("itens").unwrap_or(&Value::Null))
        .iter()
        .filter_map(|i| {
            let local = texto(i, "local");
            let nome = texto(i, "nome");
            let comando = texto(i, "comando");
            if nome.is_empty() || !LOCAIS.iter().any(|(l, _)| *l == local) {
                return None;
            }
            let exe = exe_de(&comando);
            let nome_baixo = nome.to_lowercase();
            let atraso = atrasos
                .iter()
                .filter(|(n, f, _)| {
                    let n = n.trim_end_matches(".exe");
                    (!exe.is_empty() && n == exe) || (!f.is_empty() && (nome_baixo.contains(f.as_str()) || f.contains(&nome_baixo))) || (!n.is_empty() && !exe.is_empty() && exe.contains(n) && n.len() > 3)
                })
                .map(|(_, _, a)| *a)
                .max();
            let ligado = !i.get("desativado").and_then(|d| d.as_bool()).unwrap_or(false);
            Some(ItemInicio {
                id: format!("{local}|{nome}"),
                protegido: protegido(&nome, &comando),
                impacto: classificar(atraso).into(),
                atraso_ms: atraso,
                origem: origem_de(&local).into(),
                nome,
                comando,
                local,
                ligado,
            })
        })
        .collect();
    // mais lentos primeiro; sem medição por último
    itens.sort_by(|a, b| b.atraso_ms.unwrap_or(0).cmp(&a.atraso_ms.unwrap_or(0)).then_with(|| a.nome.to_lowercase().cmp(&b.nome.to_lowercase())));
    let economia = itens.iter().filter(|i| i.ligado && !i.protegido && i.impacto != "baixo").map(|i| i.atraso_ms.unwrap_or(0)).sum();
    let nota = if historico.is_empty() {
        "O Windows não guardou o tempo de inicialização (o registro de desempenho pode estar desligado ou precisar de administrador). A lista abaixo continua valendo.".into()
    } else if itens.iter().all(|i| i.atraso_ms.is_none()) {
        "O tempo de cada programa só aparece depois que o Windows mede alguns boots; por enquanto o impacto aparece como “não medido”.".into()
    } else {
        String::new()
    };
    Inicializacao { suportado: true, boot_ms: ultimo.map(|b| numero(b, "ms")), boot_quando: ultimo.map(|b| texto(b, "quando")).filter(|q| !q.is_empty()), historico_ms: historico, itens, economia_possivel_ms: economia, nota }
}

#[cfg_attr(not(windows), allow(dead_code))]
const SCRIPT_INICIO: &str = r#"
$ErrorActionPreference='SilentlyContinue'
$base='\Software\Microsoft\Windows\CurrentVersion'
function Desat($chave,$nome){ $v=(Get-ItemProperty -Path $chave -Name $nome).$nome; if($v -and $v.Length -gt 0){ return (([int]$v[0] -band 1) -eq 1) } return $false }
$itens=New-Object System.Collections.ArrayList
$reg=@(
 @{l='hkcu_run';k="HKCU:$base\Run";a="HKCU:$base\Explorer\StartupApproved\Run"},
 @{l='hklm_run';k="HKLM:$base\Run";a="HKLM:$base\Explorer\StartupApproved\Run"},
 @{l='hklm_run32';k="HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";a="HKLM:$base\Explorer\StartupApproved\Run32"})
foreach($d in $reg){ $p=Get-Item -Path $d.k; if($p){ foreach($n in $p.GetValueNames()){ if($n){ [void]$itens.Add([pscustomobject]@{local=$d.l;nome=$n;comando=[string]$p.GetValue($n);desativado=(Desat $d.a $n)}) } } } }
$pastas=@(
 @{l='pasta_usuario';p=[Environment]::GetFolderPath('Startup');a="HKCU:$base\Explorer\StartupApproved\StartupFolder"},
 @{l='pasta_comum';p=[Environment]::GetFolderPath('CommonStartup');a="HKLM:$base\Explorer\StartupApproved\StartupFolder"})
foreach($d in $pastas){ if($d.p -and (Test-Path $d.p)){ Get-ChildItem -Path $d.p -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { [void]$itens.Add([pscustomobject]@{local=$d.l;nome=$_.Name;comando=$_.FullName;desativado=(Desat $d.a $_.Name)}) } } }
$log='Microsoft-Windows-Diagnostics-Performance/Operational'
$boot=@(); $apps=@()
Get-WinEvent -FilterHashtable @{LogName=$log;Id=100} -MaxEvents 10 | ForEach-Object { $m=@{}; foreach($x in ([xml]$_.ToXml()).Event.EventData.Data){ $m[$x.Name]=$x.'#text' }; $boot+=[pscustomobject]@{quando=$_.TimeCreated.ToString('o');ms=[int64]$m['BootTime']} }
Get-WinEvent -FilterHashtable @{LogName=$log;Id=101} -MaxEvents 300 | ForEach-Object { $m=@{}; foreach($x in ([xml]$_.ToXml()).Event.EventData.Data){ $m[$x.Name]=$x.'#text' }; $apps+=[pscustomobject]@{nome=[string]$m['Name'];amigavel=[string]$m['FriendlyName'];atraso=[int64]$m['DegradationTime']} }
[pscustomobject]@{itens=@($itens);boot=@($boot);apps=@($apps)} | ConvertTo-Json -Depth 5 -Compress
"#;

#[cfg(windows)]
pub fn inicializacao() -> Result<Inicializacao, String> {
    let saida = powershell(SCRIPT_INICIO)?;
    let bruto: Value = serde_json::from_str(saida.trim()).map_err(|e| format!("Não entendi a resposta do Windows: {e}"))?;
    Ok(montar(&bruto))
}
#[cfg(not(windows))]
pub fn inicializacao() -> Result<Inicializacao, String> {
    Ok(Inicializacao { suportado: false, nota: "A análise de inicialização existe no Windows.".into(), ..Default::default() })
}

/// Chave de aprovação do Windows (a mesma que o Gerenciador de Tarefas usa) e o byte que liga/desliga.
pub fn chave_aprovacao(local: &str) -> Option<(&'static str, &'static str)> {
    Some(match local {
        "hkcu_run" => ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"),
        "hklm_run" => ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"),
        "hklm_run32" => ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32"),
        "pasta_usuario" => ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"),
        "pasta_comum" => ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"),
        _ => return None,
    })
}

/// Argumentos do `reg add` que liga (02…) ou desliga (03…) o item. Nada é apagado: dá para religar a qualquer hora.
pub fn argumentos_reg(local: &str, nome: &str, ligado: bool) -> Option<Vec<String>> {
    let (raiz, caminho) = chave_aprovacao(local)?;
    if nome.trim().is_empty() || nome.contains('\0') {
        return None;
    }
    let dado = if ligado { "020000000000000000000000" } else { "030000000000000000000000" };
    Some(vec!["add".into(), format!("{raiz}\\{caminho}"), "/v".into(), nome.into(), "/t".into(), "REG_BINARY".into(), "/d".into(), dado.into(), "/f".into()])
}

/// Liga ou desliga um item da lista atual. O item precisa existir na leitura mais recente (nada vindo de fora vira comando).
pub fn definir_inicio(local: &str, nome: &str, ligado: bool) -> Result<String, String> {
    if !cfg!(windows) {
        return Err("Isto funciona no Windows.".into());
    }
    let atual = inicializacao()?;
    let item = atual.itens.iter().find(|i| i.local == local && i.nome == nome).ok_or("Esse programa não está mais na lista de inicialização.")?;
    let args = argumentos_reg(&item.local, &item.nome, ligado).ok_or("Item inválido.")?;
    let mut c = Command::new("reg");
    c.args(&args);
    let o = sem_janela(&mut c).output().map_err(|e| format!("Não consegui chamar o reg: {e}"))?;
    if !o.status.success() {
        let e = String::from_utf8_lossy(&o.stderr).to_string();
        return Err(traduzir_erro(&e));
    }
    Ok(format!("{} {} no início do Windows.", item.nome, if ligado { "volta a iniciar" } else { "não inicia mais" }))
}

// ------------------------------------------------------------------ disco

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Volume {
    pub letra: String,
    pub rotulo: String,
    pub sistema_arquivos: String,
    pub total: u64,
    pub livre: u64,
    /// "HDD" | "SSD" | "Desconhecido"
    pub tipo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AnaliseDisco {
    pub letra: String,
    pub tipo: String,
    pub fragmentado_pct: Option<u32>,
    /// "desfragmentar" | "trim" | "nada" | "automatico"
    pub acao: String,
    pub motivo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResultadoDisco {
    pub letra: String,
    pub acao: String,
    pub resumo: String,
}

pub fn montar_volumes(bruto: &Value) -> Vec<Volume> {
    let fisicos = lista(bruto.get("pd").unwrap_or(&Value::Null));
    let particoes = lista(bruto.get("part").unwrap_or(&Value::Null));
    lista(bruto.get("vol").unwrap_or(&Value::Null))
        .iter()
        .filter_map(|v| {
            let letra = texto(v, "letra").to_uppercase();
            if letra.len() != 1 || !letra.chars().all(|c| c.is_ascii_alphabetic()) {
                return None;
            }
            let disco = particoes.iter().find(|p| texto(p, "letra").eq_ignore_ascii_case(&letra)).map(|p| texto(p, "disco"));
            let tipo_bruto = disco.and_then(|d| fisicos.iter().find(|f| texto(f, "id") == d)).map(|f| texto(f, "tipo").to_uppercase()).unwrap_or_default();
            let tipo = match tipo_bruto.as_str() {
                "HDD" => "HDD",
                "SSD" | "SCM" => "SSD",
                _ => "Desconhecido",
            };
            Some(Volume { letra, rotulo: texto(v, "rotulo"), sistema_arquivos: texto(v, "fs"), total: numero(v, "total"), livre: numero(v, "livre"), tipo: tipo.into() })
        })
        .collect()
}

#[cfg_attr(not(windows), allow(dead_code))]
const SCRIPT_VOLUMES: &str = r#"
$ErrorActionPreference='SilentlyContinue'
$pd=@(Get-PhysicalDisk | ForEach-Object { [pscustomobject]@{id=[string]$_.DeviceId;tipo=[string]$_.MediaType} })
$part=@(Get-Partition | Where-Object { $_.DriveLetter } | ForEach-Object { [pscustomobject]@{letra=[string]$_.DriveLetter;disco=[string]$_.DiskNumber} })
$vol=@(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | ForEach-Object { [pscustomobject]@{letra=[string]$_.DriveLetter;rotulo=[string]$_.FileSystemLabel;fs=[string]$_.FileSystem;total=[int64]$_.Size;livre=[int64]$_.SizeRemaining} })
[pscustomobject]@{pd=$pd;part=$part;vol=$vol} | ConvertTo-Json -Depth 5 -Compress
"#;

#[cfg(windows)]
pub fn volumes() -> Result<Vec<Volume>, String> {
    let saida = powershell(SCRIPT_VOLUMES)?;
    let bruto: Value = serde_json::from_str(saida.trim()).map_err(|e| format!("Não entendi a resposta do Windows: {e}"))?;
    Ok(montar_volumes(&bruto))
}
#[cfg(not(windows))]
pub fn volumes() -> Result<Vec<Volume>, String> {
    Ok(Vec::new())
}

/// Procura a porcentagem de fragmentação no texto do `Optimize-Volume -Analyze -Verbose` (em português ou inglês).
pub fn fragmentacao(saida: &str) -> Option<u32> {
    let mut candidato: Option<u32> = None;
    for linha in saida.lines() {
        let l = linha.to_lowercase();
        if !l.contains("fragment") {
            continue;
        }
        let Some(pos) = l.find('%') else { continue };
        let digitos: String = l[..pos].chars().rev().skip_while(|c| c.is_whitespace()).take_while(|c| c.is_ascii_digit()).collect::<Vec<_>>().into_iter().rev().collect();
        let Ok(n) = digitos.parse::<u32>() else { continue };
        if l.contains("total") || l.contains("fragmentação") || l.contains("fragmentation") {
            return Some(n.min(100));
        }
        candidato.get_or_insert(n.min(100));
    }
    candidato
}

/// A decisão "inteligente": HDD desfragmenta só se precisa; SSD nunca desfragmenta (faz TRIM); resto o Windows escolhe.
pub fn decidir(tipo: &str, fragmentado: Option<u32>) -> (&'static str, String) {
    match tipo {
        "SSD" => ("trim", "SSD não se desfragmenta (só gasta o disco). O TRIM avisa o SSD o que está livre e mantém a velocidade.".into()),
        "HDD" => match fragmentado {
            Some(p) if p >= 10 => ("desfragmentar", format!("{p}% dos arquivos estão fragmentados: desfragmentar deixa o disco mais rápido.")),
            Some(p) => ("nada", format!("Só {p}% fragmentado: não precisa desfragmentar agora.")),
            None => ("desfragmentar", "Não consegui medir a fragmentação; desfragmentar é seguro em HDD.".into()),
        },
        _ => ("automatico", "Não deu para saber se é HDD ou SSD: deixo o Windows escolher o jeito certo.".into()),
    }
}

fn letra_valida(letra: &str) -> Result<String, String> {
    let l = letra.trim().trim_end_matches(':').to_uppercase();
    if l.len() == 1 && l.chars().all(|c| c.is_ascii_alphabetic()) {
        Ok(l)
    } else {
        Err("Escolha uma unidade (por exemplo C).".into())
    }
}

/// Só age em volumes fixos que o motor listou.
fn volume_listado(letra: &str) -> Result<Volume, String> {
    let l = letra_valida(letra)?;
    volumes()?.into_iter().find(|v| v.letra == l).ok_or_else(|| format!("A unidade {l}: não está na lista de discos do computador."))
}

pub fn analisar_disco(letra: &str) -> Result<AnaliseDisco, String> {
    if !cfg!(windows) {
        return Err("Isto funciona no Windows.".into());
    }
    let v = volume_listado(letra)?;
    let frag = if v.tipo == "SSD" { None } else { fragmentacao(&powershell(&format!("Optimize-Volume -DriveLetter {} -Analyze -Verbose 4>&1 | Out-String", v.letra))?) };
    let (acao, motivo) = decidir(&v.tipo, frag);
    Ok(AnaliseDisco { letra: v.letra, tipo: v.tipo, fragmentado_pct: frag, acao: acao.into(), motivo })
}

pub fn otimizar_disco(letra: &str) -> Result<ResultadoDisco, String> {
    let a = analisar_disco(letra)?;
    let opcao = match a.acao.as_str() {
        "desfragmentar" => "-Defrag",
        "trim" => "-ReTrim",
        "automatico" => "",
        _ => return Ok(ResultadoDisco { letra: a.letra, acao: "nada".into(), resumo: a.motivo }),
    };
    powershell(&format!("Optimize-Volume -DriveLetter {} {opcao} -Verbose 4>&1 | Out-String", a.letra))?;
    let resumo = match a.acao.as_str() {
        "desfragmentar" => "Disco desfragmentado.",
        "trim" => "TRIM concluído: o SSD ficou em dia.",
        _ => "Otimização feita do jeito que o Windows escolheu para este disco.",
    };
    Ok(ResultadoDisco { letra: a.letra, acao: a.acao, resumo: resumo.into() })
}

// ------------------------------------------------------------------ memória

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProcessoRam {
    pub pid: u32,
    pub nome: String,
    pub memoria: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EstadoRam {
    pub total: u64,
    pub disponivel: u64,
    pub percentual: f32,
    pub maiores: Vec<ProcessoRam>,
}

/// Memória agora e os programas que mais usam (agrupados pelo nome: um navegador com 30 processos aparece como um item).
pub fn ram(quantos: usize) -> EstadoRam {
    use sysinfo::{ProcessesToUpdate, System};
    let mut s = System::new();
    s.refresh_memory();
    s.refresh_processes(ProcessesToUpdate::All, true);
    let mut por_nome: std::collections::HashMap<String, (u32, u64)> = std::collections::HashMap::new();
    for (pid, p) in s.processes() {
        let e = por_nome.entry(p.name().to_string_lossy().to_string()).or_insert((pid.as_u32(), 0));
        e.1 += p.memory();
    }
    let mut maiores: Vec<ProcessoRam> = por_nome.into_iter().map(|(nome, (pid, memoria))| ProcessoRam { pid, nome, memoria }).collect();
    maiores.sort_by(|a, b| b.memoria.cmp(&a.memoria));
    maiores.truncate(quantos.clamp(1, 30));
    let total = s.total_memory();
    let disponivel = s.available_memory();
    EstadoRam { total, disponivel, percentual: if total == 0 { 0.0 } else { (total - disponivel.min(total)) as f32 * 100.0 / total as f32 }, maiores }
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn exe_sem_aspas_caminho_e_extensao() {
        assert_eq!(exe_de(r#""C:\Users\a\AppData\Local\Teams\Teams.exe" --processStart"#), "teams");
        assert_eq!(exe_de(r"C:\Program Files\Spotify\Spotify.exe -minimized"), "spotify");
        assert_eq!(exe_de(r"C:\x\Discord.exe"), "discord");
    }

    #[test]
    fn classifica_o_atraso() {
        assert_eq!(classificar(None), "nao_medido");
        assert_eq!(classificar(Some(100)), "baixo");
        assert_eq!(classificar(Some(500)), "medio");
        assert_eq!(classificar(Some(2000)), "alto");
    }

    #[test]
    fn monta_boot_itens_e_impacto() {
        let bruto = json!({
            "itens": [
                {"local": "hkcu_run", "nome": "Spotify", "comando": r#""C:\S\Spotify.exe" /min"#, "desativado": false},
                {"local": "hklm_run", "nome": "RtkAudUService", "comando": r"C:\Windows\System32\RtkAudUService64.exe", "desativado": false},
                {"local": "pasta_usuario", "nome": "Discord.lnk", "comando": r"C:\U\Startup\Discord.lnk", "desativado": true},
                {"local": "invalido", "nome": "x", "comando": "y", "desativado": false}
            ],
            "boot": [{"quando": "2026-11-14T08:00:00Z", "ms": 48000}, {"quando": "2026-11-13T08:00:00Z", "ms": 52000}],
            "apps": [{"nome": "Spotify.exe", "amigavel": "Spotify", "atraso": 3500}, {"nome": "Spotify.exe", "amigavel": "Spotify", "atraso": 1000}, {"nome": "Outro.exe", "amigavel": "Outro", "atraso": 9000}]
        });
        let r = montar(&bruto);
        assert_eq!(r.boot_ms, Some(48000));
        assert_eq!(r.historico_ms, vec![48000, 52000]);
        assert_eq!(r.itens.len(), 3, "item de local desconhecido é ignorado");
        let spot = r.itens.iter().find(|i| i.nome == "Spotify").unwrap();
        assert_eq!((spot.impacto.as_str(), spot.atraso_ms, spot.ligado, spot.protegido), ("alto", Some(3500), true, false));
        let som = r.itens.iter().find(|i| i.nome == "RtkAudUService").unwrap();
        assert!(som.protegido && som.impacto == "nao_medido");
        let dis = r.itens.iter().find(|i| i.nome == "Discord.lnk").unwrap();
        assert!(!dis.ligado);
        assert_eq!(r.itens[0].nome, "Spotify", "o mais lento vem primeiro");
        assert_eq!(r.economia_possivel_ms, 3500);
    }

    #[test]
    fn um_item_so_vira_objeto_e_ainda_funciona() {
        let bruto = json!({"itens": {"local": "hkcu_run", "nome": "A", "comando": "a.exe", "desativado": false}, "boot": null, "apps": null});
        let r = montar(&bruto);
        assert_eq!(r.itens.len(), 1);
        assert!(r.boot_ms.is_none() && r.nota.contains("não guardou"));
    }

    #[test]
    fn desligar_e_religar_escrevem_o_byte_certo() {
        let off = argumentos_reg("hkcu_run", "Spotify", false).unwrap();
        assert_eq!(off[1], r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run");
        assert!(off.contains(&"030000000000000000000000".to_string()) && off.contains(&"Spotify".to_string()));
        assert!(argumentos_reg("hklm_run32", "X", true).unwrap()[1].ends_with(r"StartupApproved\Run32"));
        assert!(argumentos_reg("pasta_comum", "X.lnk", true).unwrap()[1].starts_with("HKLM"));
        assert!(argumentos_reg("qualquer_coisa", "X", true).is_none());
        assert!(argumentos_reg("hkcu_run", "  ", true).is_none());
    }

    #[test]
    fn mede_a_fragmentacao_em_portugues_e_ingles() {
        assert_eq!(fragmentacao("Resumo pós-desfragmentação:\n  Espaço total fragmentado = 14%\n"), Some(14));
        assert_eq!(fragmentacao("Total fragmented space = 3 %\nOutra linha"), Some(3));
        assert_eq!(fragmentacao("nada aqui"), None);
    }

    #[test]
    fn decide_por_tipo_de_disco() {
        assert_eq!(decidir("SSD", Some(50)).0, "trim");
        assert_eq!(decidir("HDD", Some(25)).0, "desfragmentar");
        assert_eq!(decidir("HDD", Some(4)).0, "nada");
        assert_eq!(decidir("HDD", None).0, "desfragmentar");
        assert_eq!(decidir("Desconhecido", None).0, "automatico");
    }

    #[test]
    fn junta_volume_particao_e_disco_fisico() {
        let bruto = json!({
            "pd": [{"id": "0", "tipo": "SSD"}, {"id": "1", "tipo": "HDD"}],
            "part": [{"letra": "C", "disco": "0"}, {"letra": "D", "disco": "1"}],
            "vol": [
                {"letra": "C", "rotulo": "Windows", "fs": "NTFS", "total": 500, "livre": 100},
                {"letra": "D", "rotulo": "", "fs": "NTFS", "total": 1000, "livre": 900},
                {"letra": "Z:", "rotulo": "", "fs": "", "total": 1, "livre": 1}
            ]
        });
        let v = montar_volumes(&bruto);
        assert_eq!(v.len(), 2, "letra inválida é ignorada");
        assert_eq!((v[0].tipo.as_str(), v[1].tipo.as_str()), ("SSD", "HDD"));
    }

    #[test]
    fn letra_so_aceita_uma_unidade() {
        assert_eq!(letra_valida("c:").unwrap(), "C");
        assert!(letra_valida("C:\\Windows").is_err());
        assert!(letra_valida("1").is_err());
        assert!(letra_valida("").is_err());
    }

    #[test]
    fn erro_de_permissao_vira_orientacao() {
        assert!(traduzir_erro("Acesso negado.").contains("administrador"));
        assert!(traduzir_erro("Access is denied").contains("administrador"));
        assert_eq!(traduzir_erro("outro erro"), "outro erro");
    }

    #[test]
    fn ram_lista_os_maiores() {
        let r = ram(5);
        assert!(r.total > 0 && r.maiores.len() <= 5 && r.percentual <= 100.0);
        assert!(r.maiores.windows(2).all(|p| p[0].memoria >= p[1].memoria));
    }
}
