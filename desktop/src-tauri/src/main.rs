#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;

/// Ponte única entre a interface e o motor: a tela manda o nome do comando e os argumentos em JSON.
/// Roda em outra thread para a janela não travar durante varreduras e diagnósticos.
#[tauri::command]
async fn motor(comando: String, args: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || vindex_core::api::executar(&comando, &args))
        .await
        .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![motor])
        .run(tauri::generate_context!())
        .expect("não foi possível iniciar o Vindex");
}
