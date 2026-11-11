use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Categoria {
    Imagens,
    Videos,
    Audios,
    Documentos,
    Planilhas,
    Apresentacoes,
    Compactados,
    Instaladores,
    Codigo,
    Outros,
}

impl Categoria {
    pub fn pasta(self) -> &'static str {
        match self {
            Categoria::Imagens => "Imagens",
            Categoria::Videos => "Vídeos",
            Categoria::Audios => "Áudios",
            Categoria::Documentos => "Documentos",
            Categoria::Planilhas => "Planilhas",
            Categoria::Apresentacoes => "Apresentações",
            Categoria::Compactados => "Compactados",
            Categoria::Instaladores => "Instaladores",
            Categoria::Codigo => "Código",
            Categoria::Outros => "Outros",
        }
    }
}

pub fn extensao(caminho: &Path) -> String {
    caminho.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
}

pub fn categoria_da_extensao(ext: &str) -> Categoria {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" | "svg" | "tif" | "tiff" | "raw" => Categoria::Imagens,
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "webm" | "flv" | "3gp" => Categoria::Videos,
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "opus" | "wma" => Categoria::Audios,
        "pdf" | "doc" | "docx" | "txt" | "rtf" | "odt" | "md" | "epub" => Categoria::Documentos,
        "xls" | "xlsx" | "csv" | "ods" => Categoria::Planilhas,
        "ppt" | "pptx" | "odp" | "key" => Categoria::Apresentacoes,
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" => Categoria::Compactados,
        "exe" | "msi" | "apk" | "dmg" | "deb" | "iso" => Categoria::Instaladores,
        "rs" | "js" | "ts" | "py" | "kt" | "java" | "c" | "cpp" | "h" | "json" | "html" | "css" | "sql" => Categoria::Codigo,
        _ => Categoria::Outros,
    }
}

pub fn categoria_do_arquivo(caminho: &Path) -> Categoria {
    categoria_da_extensao(&extensao(caminho))
}

#[cfg(test)]
mod testes {
    use super::*;
    #[test]
    fn classifica_por_extensao() {
        assert_eq!(categoria_do_arquivo(Path::new("a/Foto.JPG")), Categoria::Imagens);
        assert_eq!(categoria_do_arquivo(Path::new("setup.exe")), Categoria::Instaladores);
        assert_eq!(categoria_do_arquivo(Path::new("sem_extensao")), Categoria::Outros);
        assert_eq!(Categoria::Videos.pasta(), "Vídeos");
    }
}
