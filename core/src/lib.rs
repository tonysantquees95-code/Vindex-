//! Motor do Vindex. Tudo que toca o sistema de arquivos ou o hardware mora aqui,
//! com a mesma interface JSON para o app de Windows (Tauri) e para testes.
pub mod api;
pub mod arquivos;
pub mod categorias;
pub mod hardware;
pub mod limpeza;
pub mod organizador;
pub mod regras;
pub mod seguranca;
