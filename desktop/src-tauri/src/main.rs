#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::Manager;
use serde_json::Value;
use std::path::Path;
use std::process::Command;

/// Ponte única entre a interface e o motor: a tela manda o nome do comando e os argumentos em JSON.
/// Roda em outra thread para a janela não travar durante varreduras e diagnósticos.
#[tauri::command]
async fn motor(comando: String, args: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || vindex_core::api::executar(&comando, &args))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
struct Inicial {
    /// "escolher" = abrir a tela de descompactar para escolher o destino; "aqui" = extrair ao lado do arquivo
    modo: String,
    arquivo: String,
}

/// Quando o Vindex é aberto pelo menu do botão direito: `Vindex.exe --extrair "C:\\x.zip"` ou `--extrair-aqui "C:\\x.zip"`.
#[tauri::command]
fn argumento_inicial() -> Option<Inicial> {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let i = a.iter().position(|x| x == "--extrair" || x == "--extrair-aqui")?;
    let arquivo = a.get(i + 1)?.clone();
    if !Path::new(&arquivo).is_file() {
        return None;
    }
    Some(Inicial { modo: if a[i] == "--extrair-aqui" { "aqui".into() } else { "escolher".into() }, arquivo })
}

fn abrir_com_o_sistema(alvo: &str) -> Result<(), String> {
    let mut c = if cfg!(windows) { Command::new("explorer") } else if cfg!(target_os = "macos") { Command::new("open") } else { Command::new("xdg-open") };
    c.arg(alvo).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Abre uma pasta no Explorador de Arquivos (só pastas que existem).
#[tauri::command]
fn abrir_pasta(caminho: String) -> Result<(), String> {
    if !Path::new(&caminho).is_dir() {
        return Err("A pasta não existe.".into());
    }
    abrir_com_o_sistema(&caminho)
}

/// Abre um arquivo com o programa padrão. Programas e scripts não abrem por aqui (só pelo próprio sistema).
#[tauri::command]
fn abrir_arquivo(caminho: String) -> Result<(), String> {
    let p = Path::new(&caminho);
    if !p.is_file() {
        return Err("O arquivo não existe.".into());
    }
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "vbe", "js", "jse", "wsf", "hta", "lnk", "pif", "reg", "jar", "dll", "sh", "appimage"].contains(&ext.as_str()) {
        return Err("Por segurança o Vindex não executa programas. Abra pelo Explorador do Windows se for confiável.".into());
    }
    abrir_com_o_sistema(&caminho)
}

/// Atualização do próprio Vindex no Windows: baixa o instalador (só do GitHub), confere o SHA-256, instala em silêncio e reabre.
#[tauri::command]
fn instalar_atualizacao(url: String, sha256: String) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("A atualização automática é só para Windows.".into());
    }
    let host_ok = url.strip_prefix("https://").and_then(|r| r.split('/').next()).map(|h| h == "github.com" || h.ends_with(".github.com") || h.ends_with(".githubusercontent.com")).unwrap_or(false);
    if !host_ok || url.chars().any(|c| c.is_whitespace() || c == '"' || c == '\'' || c == '`' || c == '$') {
        return Err("Endereço de atualização não permitido.".into());
    }
    if !sha256.is_empty() && !(sha256.len() == 64 && sha256.chars().all(|c| c.is_ascii_hexdigit())) {
        return Err("Assinatura da atualização inválida.".into());
    }
    let destino = std::env::temp_dir().join("VindexSetup-atualizacao.exe");
    let atual = std::env::current_exe().map_err(|e| e.to_string())?;
    // Tudo roda num PowerShell separado, para continuar depois que este app fechar. Os valores vão por variáveis de ambiente (sem montar texto de comando com eles).
    let roteiro = "$ErrorActionPreference='Stop'; \
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; \
        Invoke-WebRequest -Uri $env:V_URL -OutFile $env:V_SAIDA -UseBasicParsing; \
        if ($env:V_SHA -ne '' -and (Get-FileHash -Algorithm SHA256 $env:V_SAIDA).Hash -ne $env:V_SHA) { Remove-Item $env:V_SAIDA -Force; exit 3 }; \
        Start-Process -FilePath $env:V_SAIDA -ArgumentList '/S' -Wait; \
        Remove-Item $env:V_SAIDA -Force -ErrorAction SilentlyContinue; \
        Start-Process -FilePath $env:V_APP";
    Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-Command", roteiro])
        .env("V_URL", &url)
        .env("V_SAIDA", &destino)
        .env("V_SHA", sha256.to_uppercase())
        .env("V_APP", &atual)
        .spawn()
        .map_err(|e| format!("Não consegui iniciar a atualização: {e}"))?;
    // dá um respiro para o PowerShell começar e fecha o Vindex (o instalador também fecharia, mas assim não trava)
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(20));
        std::process::exit(0);
    });
    Ok(())
}

/// Abre um endereço https no navegador padrão (só https, sem espaços nem aspas).
#[tauri::command]
fn abrir_link(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c == '"' || c == '\'' || c == '<' || c == '>' || c == '^' || c == '&' || c == '|') {
        return Err("Endereço não permitido.".into());
    }
    abrir_com_o_sistema(&url)
}

/// Janelinha de desempenho (sempre por cima, sem barra do Windows e fora da barra de tarefas). Devolve se ficou aberta.
#[tauri::command]
fn widget_alternar(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(j) = app.get_webview_window("widget") {
        j.close().map_err(|e| e.to_string())?;
        return Ok(false);
    }
    let mut b = tauri::WebviewWindowBuilder::new(&app, "widget", tauri::WebviewUrl::App("index.html#widget".into()))
        .title("Vindex · Desempenho")
        .inner_size(250.0, 190.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true);
    if let Ok(Some(m)) = app.primary_monitor() {
        let esc = m.scale_factor();
        let x = (m.size().width as f64 / esc) - 250.0 - 24.0;
        b = b.position(x.max(0.0), 24.0);
    }
    b.build().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn widget_aberto(app: tauri::AppHandle) -> bool {
    use tauri::Manager;
    app.get_webview_window("widget").is_some()
}

fn main() {
    tauri::Builder::default()
        .on_window_event(|janela, evento| {
            // fechar a janela principal encerra o Vindex inteiro (o widget não fica sozinho rodando)
            if janela.label() == "main" && matches!(evento, tauri::WindowEvent::CloseRequested { .. }) {
                janela.app_handle().exit(0);
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![motor, argumento_inicial, abrir_pasta, abrir_arquivo, abrir_link, instalar_atualizacao, widget_alternar, widget_aberto])
        .run(tauri::generate_context!())
        .expect("não foi possível iniciar o Vindex");
}
