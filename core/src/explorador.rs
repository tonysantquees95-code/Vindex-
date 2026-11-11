//! Explorador de arquivos (estilo gerenciador): armazenamentos, listar pasta, recentes, coleções, busca,
//! nova pasta, renomear e mandar para a lixeira do Vindex (a quarentena, que dá para desfazer).
use crate::categorias::{categoria_do_arquivo, Categoria};
use crate::organizador::{self, Movimento, QUARENTENA};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use sysinfo::Disks;
use walkdir::WalkDir;

#[derive(Debug, Serialize, PartialEq)]
pub struct Armazenamento {
    pub rotulo: String,
    pub caminho: PathBuf,
    pub total: u64,
    pub livre: u64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Item {
    pub nome: String,
    pub caminho: PathBuf,
    pub pasta: bool,
    pub bytes: u64,
    pub modificado: u64,
    pub categoria: String,
    /// só para pastas: quantos itens há dentro
    pub itens: u64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Listagem {
    pub caminho: PathBuf,
    pub pai: Option<PathBuf>,
    pub itens: Vec<Item>,
    pub truncado: bool,
}

pub const LIMITE_LISTA: usize = 5000;

fn segundos(m: &fs::Metadata) -> u64 {
    m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0)
}
fn categoria_nome(c: Categoria) -> String {
    serde_json::to_value(c).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_else(|| "outros".into())
}
fn oculto(n: &str) -> bool {
    n.starts_with('.')
}

/// Discos do computador (Windows: C:, D:…; Linux: pontos de montagem reais).
pub fn armazenamentos() -> Vec<Armazenamento> {
    let mut v: Vec<Armazenamento> = Disks::new_with_refreshed_list()
        .iter()
        .filter(|d| d.total_space() > 0 && !d.is_removable() || d.total_space() > 0)
        .map(|d| {
            let ponto = d.mount_point().to_path_buf();
            let nome = d.name().to_string_lossy().to_string();
            let rotulo = if cfg!(windows) {
                let letra = ponto.to_string_lossy().trim_end_matches('\\').to_string();
                if nome.is_empty() { format!("Disco local ({letra})") } else { format!("{nome} ({letra})") }
            } else if nome.is_empty() { ponto.to_string_lossy().to_string() } else { nome }
            ;
            Armazenamento { rotulo, caminho: ponto, total: d.total_space(), livre: d.available_space() }
        })
        .filter(|a| cfg!(windows) || !["/boot", "/proc", "/sys", "/dev", "/run", "/snap"].iter().any(|p| a.caminho.starts_with(p)))
        .collect();
    v.sort_by(|a, b| a.caminho.cmp(&b.caminho));
    v.dedup_by(|a, b| a.caminho == b.caminho);
    v
}

/// Lista o conteúdo de uma pasta: pastas primeiro, depois arquivos, por nome.
pub fn listar(caminho: &Path, ocultos: bool) -> Result<Listagem, String> {
    if !caminho.is_dir() {
        return Err("A pasta não existe.".into());
    }
    let rd = fs::read_dir(caminho).map_err(|e| format!("Sem permissão para abrir essa pasta ({e})."))?;
    let mut itens = Vec::new();
    let mut truncado = false;
    for e in rd.filter_map(Result::ok) {
        let nome = e.file_name().to_string_lossy().to_string();
        if (!ocultos && oculto(&nome)) || nome == QUARENTENA && !ocultos {
            continue;
        }
        if itens.len() >= LIMITE_LISTA {
            truncado = true;
            break;
        }
        let Ok(meta) = e.metadata() else { continue };
        let pasta = meta.is_dir();
        let c = e.path();
        itens.push(Item {
            categoria: if pasta { "pasta".into() } else { categoria_nome(categoria_do_arquivo(&c)) },
            itens: if pasta { fs::read_dir(&c).map(|r| r.count() as u64).unwrap_or(0) } else { 0 },
            nome,
            caminho: c,
            pasta,
            bytes: if pasta { 0 } else { meta.len() },
            modificado: segundos(&meta),
        });
    }
    itens.sort_by(|a, b| b.pasta.cmp(&a.pasta).then_with(|| a.nome.to_lowercase().cmp(&b.nome.to_lowercase())));
    Ok(Listagem { caminho: caminho.to_path_buf(), pai: caminho.parent().map(Path::to_path_buf), itens, truncado })
}

fn arquivos_de(raizes: &[PathBuf], profundidade: usize) -> Vec<Item> {
    organizador::varrer(raizes, profundidade)
        .into_iter()
        .map(|a| Item { categoria: categoria_nome(a.categoria), nome: a.nome, caminho: a.caminho, pasta: false, bytes: a.bytes, modificado: a.modificado, itens: 0 })
        .collect()
}

/// Arquivos mais recentes (downloads, fotos novas…), do mais novo para o mais antigo.
pub fn recentes(raizes: &[PathBuf], limite: usize) -> Vec<Item> {
    let mut v = arquivos_de(raizes, 5);
    v.sort_by(|a, b| b.modificado.cmp(&a.modificado));
    v.truncate(limite.clamp(1, 500));
    v
}

/// Coleção por tipo: "imagens", "videos", "audios", "documentos"… (ou "instaladores" para apps/APKs).
pub fn colecao(raizes: &[PathBuf], categoria: &str, limite: usize) -> Vec<Item> {
    let mut v: Vec<Item> = arquivos_de(raizes, 6).into_iter().filter(|i| i.categoria == categoria || (categoria == "documentos" && matches!(i.categoria.as_str(), "planilhas" | "apresentacoes"))).collect();
    v.sort_by(|a, b| b.modificado.cmp(&a.modificado));
    v.truncate(limite.clamp(1, 1000));
    v
}

/// Busca por parte do nome, dentro de uma pasta (até 6 níveis).
pub fn buscar(raiz: &Path, texto: &str, limite: usize) -> Vec<Item> {
    let t = texto.trim().to_lowercase();
    if t.is_empty() || !raiz.is_dir() {
        return Vec::new();
    }
    let mut v = Vec::new();
    let it = WalkDir::new(raiz).follow_links(false).max_depth(6).into_iter().filter_entry(|e| e.depth() == 0 || (!oculto(&e.file_name().to_string_lossy()) && e.file_name().to_string_lossy() != QUARENTENA));
    for e in it.filter_map(Result::ok) {
        if e.depth() == 0 || !e.file_name().to_string_lossy().to_lowercase().contains(&t) {
            continue;
        }
        let Ok(meta) = e.metadata() else { continue };
        let pasta = meta.is_dir();
        v.push(Item {
            nome: e.file_name().to_string_lossy().to_string(),
            caminho: e.path().to_path_buf(),
            pasta,
            bytes: if pasta { 0 } else { meta.len() },
            modificado: segundos(&meta),
            categoria: if pasta { "pasta".into() } else { categoria_nome(categoria_do_arquivo(e.path())) },
            itens: 0,
        });
        if v.len() >= limite.clamp(1, 500) {
            break;
        }
    }
    v
}

fn nome_valido(nome: &str) -> Result<&str, String> {
    let n = nome.trim();
    if n.is_empty() || n.len() > 200 || n == "." || n == ".." || n.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0')) {
        return Err("Nome inválido: não use / \\ : * ? \" < > |".into());
    }
    Ok(n)
}

pub fn nova_pasta(dentro: &Path, nome: &str) -> Result<PathBuf, String> {
    let n = nome_valido(nome)?;
    if !dentro.is_dir() {
        return Err("A pasta não existe.".into());
    }
    let destino = dentro.join(n);
    if destino.exists() {
        return Err("Já existe algo com esse nome.".into());
    }
    fs::create_dir(&destino).map_err(|e| format!("Não consegui criar a pasta ({e})."))?;
    Ok(destino)
}

pub fn renomear(caminho: &Path, novo: &str) -> Result<PathBuf, String> {
    let n = nome_valido(novo)?;
    let pai = caminho.parent().filter(|p| p.parent().is_some() || p.is_dir()).ok_or("Não dá para renomear isso.")?;
    if !caminho.exists() || caminho.parent().is_none() {
        return Err("Não existe mais.".into());
    }
    let destino = pai.join(n);
    if destino.exists() {
        return Err("Já existe algo com esse nome.".into());
    }
    fs::rename(caminho, &destino).map_err(|e| format!("Não consegui renomear ({e})."))?;
    Ok(destino)
}

/// Manda arquivos e pastas para a lixeira do Vindex (pasta “Vindex-Quarentena” ao lado), sem apagar de vez. Devolve os movimentos para desfazer.
pub fn para_lixeira(caminhos: &[PathBuf]) -> organizador::ResultadoDeMovimento {
    let movs: Vec<Movimento> = caminhos
        .iter()
        .filter(|c| (c.is_file() || c.is_dir()) && c.parent().is_some() && c.file_name().is_some_and(|n| n != QUARENTENA))
        .filter_map(|c| {
            let pasta = c.parent()?.join(QUARENTENA);
            Some(Movimento { de: c.clone(), para: pasta.join(c.file_name()?), motivo: "lixeira do Vindex".into() })
        })
        .collect();
    organizador::aplicar(&movs, false)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn lista_pastas_primeiro_e_esconde_ocultos() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("b.pdf"), b"x").unwrap();
        fs::write(t.path().join(".segredo"), b"x").unwrap();
        fs::create_dir(t.path().join("Zeta")).unwrap();
        fs::write(t.path().join("Zeta/a.txt"), b"x").unwrap();
        let l = listar(t.path(), false).unwrap();
        assert_eq!(l.itens.iter().map(|i| i.nome.as_str()).collect::<Vec<_>>(), vec!["Zeta", "b.pdf"]);
        assert_eq!(l.itens[0].itens, 1);
        assert_eq!(l.itens[1].categoria, "documentos");
        assert_eq!(listar(t.path(), true).unwrap().itens.len(), 3);
        assert!(listar(&t.path().join("nada"), false).is_err());
    }

    #[test]
    fn recentes_colecao_e_busca() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("foto.jpg"), b"1").unwrap();
        fs::write(t.path().join("musica.mp3"), b"2").unwrap();
        fs::create_dir(t.path().join("sub")).unwrap();
        fs::write(t.path().join("sub/foto2.png"), b"3").unwrap();
        let r = vec![t.path().to_path_buf()];
        assert_eq!(recentes(&r, 10).len(), 3);
        assert_eq!(colecao(&r, "imagens", 10).len(), 2);
        assert_eq!(colecao(&r, "audios", 10).len(), 1);
        let b = buscar(t.path(), "FOTO", 10);
        assert_eq!(b.len(), 2);
        assert!(buscar(t.path(), "  ", 10).is_empty());
    }

    #[test]
    fn nova_pasta_renomear_e_lixeira() {
        let t = tempfile::tempdir().unwrap();
        let p = nova_pasta(t.path(), "Fotos").unwrap();
        assert!(p.is_dir());
        assert!(nova_pasta(t.path(), "Fotos").unwrap_err().contains("Já existe"));
        assert!(nova_pasta(t.path(), "a/b").unwrap_err().contains("inválido"));
        assert!(nova_pasta(t.path(), "..").is_err());
        let q = renomear(&p, "Viagem").unwrap();
        assert!(q.is_dir() && !p.exists());
        let f = q.join("a.txt");
        fs::write(&f, b"oi").unwrap();
        let r = para_lixeira(&[f.clone()]);
        assert_eq!(r.movidos.len(), 1);
        assert!(!f.exists() && q.join(QUARENTENA).join("a.txt").exists());
        assert!(organizador::desfazer(&r.movidos).falhas.is_empty());
        assert!(f.exists());
        // pasta inteira também vai para a lixeira (e volta com tudo dentro)
        let r2 = para_lixeira(&[q.clone()]);
        assert_eq!(r2.movidos.len(), 1);
        assert!(!q.exists() && t.path().join(QUARENTENA).join("Viagem/a.txt").exists());
        assert!(organizador::desfazer(&r2.movidos).falhas.is_empty());
        assert!(f.exists());
        // a própria lixeira não vai para a lixeira
        assert!(para_lixeira(&[t.path().join(QUARENTENA)]).movidos.is_empty());
    }
}
