//! Motor do Vindex. Tudo que toca o sistema de arquivos ou o hardware mora aqui,
//! com a mesma interface JSON para o app de Windows (Tauri) e para testes.
pub mod api;
pub mod arquivos;
pub mod desempenho;
pub mod categorias;
pub mod explorador;
pub mod hardware;
pub mod limpeza;
pub mod organizador;
pub mod programas;
pub mod regras;
pub mod seguranca;
