#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
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

/// Abre um endereço https no navegador padrão (só https, sem espaços nem aspas).
#[tauri::command]
fn abrir_link(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c == '"' || c == '\'' || c == '<' || c == '>' || c == '^' || c == '&' || c == '|') {
        return Err("Endereço não permitido.".into());
    }
    abrir_com_o_sistema(&url)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![motor, argumento_inicial, abrir_pasta, abrir_link])
        .run(tauri::generate_context!())
        .expect("não foi possível iniciar o Vindex");
}
