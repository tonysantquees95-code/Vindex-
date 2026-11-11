//! Pastas conhecidas do usuário e descompactação de arquivos (ZIP, TAR, TAR.GZ/TGZ e GZ).
//! Segurança: nenhum item sai da pasta de destino (caminhos com ".." ou absolutos são pulados),
//! nada é sobrescrito (nome repetido ganha " (1)"), e há limites contra "bombas de compactação".
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

pub const LIMITE_ITENS: usize = 200_000;
pub const LIMITE_BYTES: u64 = 40 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PastaConhecida {
    pub id: String,
    pub rotulo: String,
    pub caminho: PathBuf,
}

/// Downloads, Documentos, Imagens… do usuário (só as que existem).
pub fn pastas_conhecidas() -> Vec<PastaConhecida> {
    let base = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).filter(|v| !v.is_empty()).map(PathBuf::from);
    let Some(base) = base else { return Vec::new() };
    let lista = [
        ("downloads", "Downloads", "Downloads"),
        ("documentos", "Documentos", "Documents"),
        ("imagens", "Imagens", "Pictures"),
        ("videos", "Vídeos", "Videos"),
        ("musicas", "Músicas", "Music"),
        ("desktop", "Área de trabalho", "Desktop"),
    ];
    lista.iter().map(|(id, rotulo, pasta)| PastaConhecida { id: (*id).into(), rotulo: (*rotulo).into(), caminho: base.join(pasta) }).filter(|p| p.caminho.is_dir()).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Formato {
    Zip,
    Tar,
    TarGz,
    Gz,
}

pub fn formato_de(caminho: &Path) -> Option<Formato> {
    let nome = caminho.file_name()?.to_string_lossy().to_lowercase();
    if nome.ends_with(".tar.gz") || nome.ends_with(".tgz") {
        Some(Formato::TarGz)
    } else if nome.ends_with(".zip") {
        Some(Formato::Zip)
    } else if nome.ends_with(".tar") {
        Some(Formato::Tar)
    } else if nome.ends_with(".gz") {
        Some(Formato::Gz)
    } else {
        None
    }
}

/// Nome da pasta sugerida para extrair: o nome do arquivo sem a extensão de compactação.
pub fn pasta_sugerida(origem: &Path) -> PathBuf {
    let nome = origem.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "extraido".into());
    let baixo = nome.to_lowercase();
    let corte = [".tar.gz", ".tgz", ".zip", ".tar", ".gz"].iter().find(|e| baixo.ends_with(*e)).map(|e| nome.len() - e.len()).unwrap_or(nome.len());
    let limpo = nome[..corte].trim().to_string();
    let limpo = if limpo.is_empty() { "extraido".to_string() } else { limpo };
    origem.parent().unwrap_or_else(|| Path::new(".")).join(limpo)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Conteudo {
    pub itens: usize,
    pub bytes: u64,
    pub nomes: Vec<String>,
    pub formato: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ResultadoExtracao {
    pub destino: PathBuf,
    pub arquivos: usize,
    pub bytes: u64,
    pub pulados: Vec<String>,
}

/// Caminho relativo seguro: sem raiz, sem "..", sem letra de unidade.
fn seguro(nome: &str) -> Option<PathBuf> {
    let p = PathBuf::from(nome.replace('\\', "/"));
    let mut saida = PathBuf::new();
    for c in p.components() {
        match c {
            Component::Normal(x) => saida.push(x),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if saida.as_os_str().is_empty() {
        None
    } else {
        Some(saida)
    }
}

fn livre(alvo: PathBuf) -> PathBuf {
    if !alvo.exists() {
        return alvo;
    }
    let pasta = alvo.parent().map(Path::to_path_buf).unwrap_or_default();
    let nome = alvo.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = alvo.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..10_000).map(|n| pasta.join(format!("{nome} ({n}){ext}"))).find(|p| !p.exists()).unwrap_or(alvo)
}

fn explicar(e: impl std::fmt::Display) -> String {
    let t = e.to_string();
    let b = t.to_lowercase();
    if b.contains("password") || b.contains("encrypted") {
        "O arquivo é protegido por senha; o Vindex ainda não abre arquivos com senha.".into()
    } else {
        format!("Não consegui ler o arquivo compactado: {t}")
    }
}

pub fn listar(origem: &Path) -> Result<Conteudo, String> {
    let formato = formato_de(origem).ok_or("Formato não suportado ainda. Funciona com ZIP, TAR, TAR.GZ, TGZ e GZ.")?;
    let mut c = Conteudo { formato: format!("{formato:?}").to_lowercase(), ..Default::default() };
    match formato {
        Formato::Zip => {
            let mut z = zip::ZipArchive::new(File::open(origem).map_err(|e| e.to_string())?).map_err(explicar)?;
            for i in 0..z.len() {
                let f = z.by_index_raw(i).map_err(explicar)?;
                if f.is_dir() {
                    continue;
                }
                c.itens += 1;
                c.bytes += f.size();
                if c.nomes.len() < 200 {
                    c.nomes.push(f.name().to_string());
                }
            }
        }
        Formato::Tar | Formato::TarGz => {
            let leitor: Box<dyn Read> = if formato == Formato::TarGz { Box::new(flate2::read::GzDecoder::new(File::open(origem).map_err(|e| e.to_string())?)) } else { Box::new(File::open(origem).map_err(|e| e.to_string())?) };
            let mut t = tar::Archive::new(leitor);
            for e in t.entries().map_err(explicar)? {
                let e = e.map_err(explicar)?;
                if e.header().entry_type().is_dir() {
                    continue;
                }
                c.itens += 1;
                c.bytes += e.size();
                if c.nomes.len() < 200 {
                    c.nomes.push(e.path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default());
                }
            }
        }
        Formato::Gz => {
            c.itens = 1;
            c.nomes.push(pasta_sugerida(origem).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
        }
    }
    Ok(c)
}

struct Contador {
    arquivos: usize,
    bytes: u64,
}

fn gravar(destino: &Path, relativo: &Path, leitor: &mut dyn Read, r: &mut ResultadoExtracao, c: &mut Contador) -> Result<(), String> {
    if c.arquivos >= LIMITE_ITENS {
        return Err("Arquivo com itens demais; parei por segurança.".into());
    }
    let alvo = livre(destino.join(relativo));
    if let Some(pai) = alvo.parent() {
        fs::create_dir_all(pai).map_err(|e| e.to_string())?;
    }
    let mut f = File::create(&alvo).map_err(|e| format!("{}: {e}", alvo.display()))?;
    let restante = LIMITE_BYTES.saturating_sub(c.bytes);
    let n = io::copy(&mut leitor.take(restante + 1), &mut f).map_err(|e| format!("{}: {e}", alvo.display()))?;
    if n > restante {
        let _ = fs::remove_file(&alvo);
        return Err("O conteúdo é grande demais (mais de 40 GB); parei por segurança.".into());
    }
    c.arquivos += 1;
    c.bytes += n;
    r.arquivos = c.arquivos;
    r.bytes = c.bytes;
    Ok(())
}

pub fn extrair(origem: &Path, destino: &Path) -> Result<ResultadoExtracao, String> {
    if !origem.is_file() {
        return Err("Escolha um arquivo compactado que exista.".into());
    }
    let formato = formato_de(origem).ok_or("Formato não suportado ainda. Funciona com ZIP, TAR, TAR.GZ, TGZ e GZ.")?;
    if destino.parent().is_none() {
        return Err("Escolha uma pasta de destino, não a raiz do disco.".into());
    }
    fs::create_dir_all(destino).map_err(|e| format!("Não consegui criar a pasta de destino: {e}"))?;
    let mut r = ResultadoExtracao { destino: destino.to_path_buf(), ..Default::default() };
    let mut c = Contador { arquivos: 0, bytes: 0 };
    match formato {
        Formato::Zip => {
            let mut z = zip::ZipArchive::new(File::open(origem).map_err(|e| e.to_string())?).map_err(explicar)?;
            for i in 0..z.len() {
                let mut f = z.by_index(i).map_err(explicar)?;
                let nome = f.name().to_string();
                let Some(rel) = seguro(&nome) else {
                    r.pulados.push(format!("{nome} (caminho inseguro)"));
                    continue;
                };
                if f.is_dir() {
                    fs::create_dir_all(destino.join(&rel)).map_err(|e| e.to_string())?;
                    continue;
                }
                gravar(destino, &rel, &mut f, &mut r, &mut c)?;
            }
        }
        Formato::Tar | Formato::TarGz => {
            let leitor: Box<dyn Read> = if formato == Formato::TarGz { Box::new(flate2::read::GzDecoder::new(File::open(origem).map_err(|e| e.to_string())?)) } else { Box::new(File::open(origem).map_err(|e| e.to_string())?) };
            let mut t = tar::Archive::new(leitor);
            for e in t.entries().map_err(explicar)? {
                let mut e = e.map_err(explicar)?;
                let tipo = e.header().entry_type();
                let nome = e.path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
                let Some(rel) = seguro(&nome) else {
                    r.pulados.push(format!("{nome} (caminho inseguro)"));
                    continue;
                };
                if tipo.is_dir() {
                    fs::create_dir_all(destino.join(&rel)).map_err(|e| e.to_string())?;
                } else if tipo.is_file() {
                    gravar(destino, &rel, &mut e, &mut r, &mut c)?;
                } else {
                    r.pulados.push(format!("{nome} (atalho ou item especial)"));
                }
            }
        }
        Formato::Gz => {
            let nome = pasta_sugerida(origem).file_name().map(|n| PathBuf::from(n)).unwrap_or_else(|| PathBuf::from("extraido"));
            let mut d = flate2::read::GzDecoder::new(File::open(origem).map_err(|e| e.to_string())?);
            gravar(destino, &nome, &mut d, &mut r, &mut c).map_err(|e| explicar(e))?;
        }
    }
    Ok(r)
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::io::Write;

    fn zip_de_teste(caminho: &Path, itens: &[(&str, &[u8])]) {
        let mut z = zip::ZipWriter::new(File::create(caminho).unwrap());
        for (nome, dados) in itens {
            z.start_file(*nome, zip::write::SimpleFileOptions::default()).unwrap();
            z.write_all(dados).unwrap();
        }
        z.finish().unwrap();
    }

    #[test]
    fn caminhos_seguros() {
        assert_eq!(seguro("a/b.txt"), Some(PathBuf::from("a/b.txt")));
        assert_eq!(seguro("a\\b.txt"), Some(PathBuf::from("a/b.txt")));
        assert_eq!(seguro("../fora.txt"), None);
        assert_eq!(seguro("/etc/passwd"), None);
        assert_eq!(seguro("a/../../x"), None);
    }

    #[test]
    fn sugere_pasta_pelo_nome() {
        assert_eq!(pasta_sugerida(Path::new("/d/projeto.zip")), PathBuf::from("/d/projeto"));
        assert_eq!(pasta_sugerida(Path::new("/d/dados.tar.gz")), PathBuf::from("/d/dados"));
        assert_eq!(formato_de(Path::new("x.TGZ")), Some(Formato::TarGz));
        assert_eq!(formato_de(Path::new("x.rar")), None);
    }

    #[test]
    fn extrai_zip_sem_sobrescrever_e_sem_sair_da_pasta() {
        let t = tempfile::tempdir().unwrap();
        let z = t.path().join("a.zip");
        zip_de_teste(&z, &[("pasta/um.txt", b"1"), ("../fora.txt", b"x"), ("dois.txt", b"2")]);
        let c = listar(&z).unwrap();
        assert_eq!(c.itens, 3);
        let dest = t.path().join("saida");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("dois.txt"), b"ja existia").unwrap();
        let r = extrair(&z, &dest).unwrap();
        assert_eq!(r.arquivos, 2);
        assert_eq!(r.pulados.len(), 1);
        assert_eq!(fs::read(dest.join("pasta/um.txt")).unwrap(), b"1");
        assert_eq!(fs::read(dest.join("dois.txt")).unwrap(), b"ja existia");
        assert_eq!(fs::read(dest.join("dois (1).txt")).unwrap(), b"2");
        assert!(!t.path().join("fora.txt").exists());
    }

    #[test]
    fn extrai_tar_gz_e_gz() {
        let t = tempfile::tempdir().unwrap();
        let tgz = t.path().join("b.tar.gz");
        {
            let gz = flate2::write::GzEncoder::new(File::create(&tgz).unwrap(), flate2::Compression::default());
            let mut b = tar::Builder::new(gz);
            let mut h = tar::Header::new_gnu();
            h.set_size(3);
            h.set_mode(0o644);
            h.set_cksum();
            b.append_data(&mut h, "dir/x.txt", &b"abc"[..]).unwrap();
            b.into_inner().unwrap().finish().unwrap();
        }
        let r = extrair(&tgz, &t.path().join("o")).unwrap();
        assert_eq!(r.arquivos, 1);
        assert_eq!(fs::read(t.path().join("o/dir/x.txt")).unwrap(), b"abc");

        let g = t.path().join("nota.txt.gz");
        {
            let mut e = flate2::write::GzEncoder::new(File::create(&g).unwrap(), flate2::Compression::default());
            e.write_all(b"texto").unwrap();
            e.finish().unwrap();
        }
        let r = extrair(&g, &t.path().join("o2")).unwrap();
        assert_eq!(r.arquivos, 1);
        assert_eq!(fs::read(t.path().join("o2/nota.txt")).unwrap(), b"texto");
    }

    #[test]
    fn formato_desconhecido_e_arquivo_inexistente() {
        assert!(extrair(Path::new("/nao/existe.zip"), Path::new("/tmp/x")).unwrap_err().contains("exista"));
        let t = tempfile::tempdir().unwrap();
        let rar = t.path().join("a.rar");
        fs::write(&rar, b"x").unwrap();
        assert!(extrair(&rar, &t.path().join("o")).unwrap_err().contains("não suportado"));
    }
}
