//! FileOrganizerEngine: varredura, categorias, duplicados por hash, arquivos gigantes parados e movimentação reversível.
use crate::categorias::{categoria_do_arquivo, extensao, Categoria};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Arquivo {
    pub caminho: PathBuf,
    pub nome: String,
    pub extensao: String,
    pub categoria: Categoria,
    pub bytes: u64,
    /// última modificação, em segundos desde 1970
    pub modificado: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GrupoDuplicado {
    pub sha256: String,
    pub bytes: u64,
    pub caminhos: Vec<PathBuf>,
    /// espaço que sobraria ao manter só uma cópia
    pub desperdicio: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Movimento {
    pub de: PathBuf,
    pub para: PathBuf,
    pub motivo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ResultadoDeMovimento {
    pub movidos: Vec<Movimento>,
    pub falhas: Vec<String>,
    pub simulacao: bool,
}

pub fn agora_s() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn oculto(nome: &str) -> bool {
    nome.starts_with('.') || nome.starts_with("~$")
}

/// Varre as pastas escolhidas (sem seguir links e sem entrar em pastas ocultas ou na quarentena do Vindex).
pub fn varrer(raizes: &[PathBuf], profundidade: usize) -> Vec<Arquivo> {
    let mut v = Vec::new();
    for r in raizes {
        let it = WalkDir::new(r).follow_links(false).max_depth(profundidade.max(1)).into_iter().filter_entry(|e| {
            let n = e.file_name().to_string_lossy();
            e.depth() == 0 || (!oculto(&n) && n != QUARENTENA)
        });
        for e in it.filter_map(Result::ok) {
            if !e.file_type().is_file() {
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            let modificado = meta.modified().ok().and_then(|m| m.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
            v.push(Arquivo {
                caminho: e.path().to_path_buf(),
                nome: e.file_name().to_string_lossy().to_string(),
                extensao: extensao(e.path()),
                categoria: categoria_do_arquivo(e.path()),
                bytes: meta.len(),
                modificado,
            });
        }
    }
    v
}

pub fn sha256_arquivo(caminho: &Path, limite: Option<u64>) -> std::io::Result<String> {
    let mut f = File::open(caminho)?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut lido = 0u64;
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        lido += n as u64;
        if limite.map_or(false, |l| lido >= l) {
            break;
        }
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Duplicados exatos: agrupa por tamanho, filtra pelo início do arquivo e só então calcula o SHA-256 completo.
pub fn duplicados(arquivos: &[Arquivo], min_bytes: u64) -> Vec<GrupoDuplicado> {
    let mut por_tamanho: HashMap<u64, Vec<&Arquivo>> = HashMap::new();
    for a in arquivos.iter().filter(|a| a.bytes >= min_bytes.max(1)) {
        por_tamanho.entry(a.bytes).or_default().push(a);
    }
    let mut grupos = Vec::new();
    for (bytes, lista) in por_tamanho.into_iter().filter(|(_, l)| l.len() > 1) {
        let mut por_inicio: HashMap<String, Vec<&Arquivo>> = HashMap::new();
        for a in lista {
            if let Ok(h) = sha256_arquivo(&a.caminho, Some(64 * 1024)) {
                por_inicio.entry(h).or_default().push(a);
            }
        }
        for (_, candidatos) in por_inicio.into_iter().filter(|(_, l)| l.len() > 1) {
            let mut por_hash: HashMap<String, Vec<PathBuf>> = HashMap::new();
            for a in candidatos {
                if let Ok(h) = sha256_arquivo(&a.caminho, None) {
                    por_hash.entry(h).or_default().push(a.caminho.clone());
                }
            }
            for (sha256, mut caminhos) in por_hash.into_iter().filter(|(_, l)| l.len() > 1) {
                caminhos.sort();
                let desperdicio = bytes * (caminhos.len() as u64 - 1);
                grupos.push(GrupoDuplicado { sha256, bytes, caminhos, desperdicio });
            }
        }
    }
    grupos.sort_by(|a, b| b.desperdicio.cmp(&a.desperdicio).then(a.sha256.cmp(&b.sha256)));
    grupos
}

/// Arquivos grandes sem uso há muito tempo (pela data de modificação).
pub fn gigantes_parados(arquivos: &[Arquivo], min_bytes: u64, parado_dias: u64, agora: u64) -> Vec<Arquivo> {
    let mut v: Vec<Arquivo> = arquivos.iter().filter(|a| a.bytes >= min_bytes && agora.saturating_sub(a.modificado) >= parado_dias * 86_400).cloned().collect();
    v.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    v
}

pub const QUARENTENA: &str = "Vindex-Quarentena";

/// Nome livre no destino: "foto.jpg", "foto (1).jpg", "foto (2).jpg"…
pub fn nome_livre(pasta: &Path, nome: &str) -> PathBuf {
    let alvo = pasta.join(nome);
    if !alvo.exists() {
        return alvo;
    }
    let p = Path::new(nome);
    let base = p.file_stem().and_then(|s| s.to_str()).unwrap_or(nome);
    let ext = p.extension().and_then(|s| s.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    (1..10_000).map(|n| pasta.join(format!("{base} ({n}){ext}"))).find(|c| !c.exists()).unwrap_or(alvo)
}

/// Plano de organização por categoria: cada arquivo vai para `<destino>/<Categoria>/`.
pub fn plano_por_categoria(arquivos: &[Arquivo], destino: &Path) -> Vec<Movimento> {
    let mut v = Vec::new();
    for a in arquivos {
        let pasta = destino.join(a.categoria.pasta());
        if a.caminho.parent() == Some(pasta.as_path()) {
            continue;
        }
        v.push(Movimento { de: a.caminho.clone(), para: pasta.join(&a.nome), motivo: format!("categoria {}", a.categoria.pasta()) });
    }
    v
}

/// Move com segurança: nunca sobrescreve (renomeia se já existir) e cria as pastas. Aceita simulação.
pub fn aplicar(movimentos: &[Movimento], simulacao: bool) -> ResultadoDeMovimento {
    let mut r = ResultadoDeMovimento { simulacao, ..Default::default() };
    for m in movimentos {
        let Some(pasta) = m.para.parent() else {
            r.falhas.push(format!("{}: destino inválido", m.de.display()));
            continue;
        };
        if !m.de.is_file() {
            r.falhas.push(format!("{}: não existe mais", m.de.display()));
            continue;
        }
        let nome = m.para.file_name().and_then(|n| n.to_str()).unwrap_or("arquivo");
        let final_ = nome_livre(pasta, nome);
        if simulacao {
            r.movidos.push(Movimento { de: m.de.clone(), para: final_, motivo: m.motivo.clone() });
            continue;
        }
        let feito = fs::create_dir_all(pasta).and_then(|_| fs::rename(&m.de, &final_).or_else(|_| fs::copy(&m.de, &final_).and_then(|_| fs::remove_file(&m.de))));
        match feito {
            Ok(()) => r.movidos.push(Movimento { de: m.de.clone(), para: final_, motivo: m.motivo.clone() }),
            Err(e) => r.falhas.push(format!("{}: {}", m.de.display(), e)),
        }
    }
    r
}

/// Desfaz uma organização (devolve cada arquivo ao lugar original, sem sobrescrever).
pub fn desfazer(movidos: &[Movimento]) -> ResultadoDeMovimento {
    let volta: Vec<Movimento> = movidos.iter().rev().map(|m| Movimento { de: m.para.clone(), para: m.de.clone(), motivo: "desfazer".into() }).collect();
    aplicar(&volta, false)
}

/// Duplicados vão para a quarentena (dentro da pasta do arquivo mantido), nunca direto para o lixo.
pub fn quarentena_de_duplicados(grupo: &GrupoDuplicado, manter: &Path) -> Vec<Movimento> {
    let pasta = manter.parent().unwrap_or(Path::new(".")).join(QUARENTENA);
    grupo
        .caminhos
        .iter()
        .filter(|c| c.as_path() != manter)
        .map(|c| Movimento { de: c.clone(), para: pasta.join(c.file_name().unwrap_or_default()), motivo: "duplicado".into() })
        .collect()
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::io::Write;

    fn grava(p: &Path, conteudo: &[u8]) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        File::create(p).unwrap().write_all(conteudo).unwrap();
    }

    #[test]
    fn acha_duplicados_exatos_e_ignora_parecidos() {
        let t = tempfile::tempdir().unwrap();
        grava(&t.path().join("a/foto.jpg"), b"conteudo-igual-123");
        grava(&t.path().join("b/foto copia.jpg"), b"conteudo-igual-123");
        grava(&t.path().join("c/outra.jpg"), b"conteudo-igual-124"); // mesmo tamanho, outro conteúdo
        grava(&t.path().join("d/unica.txt"), b"x");
        let arqs = varrer(&[t.path().to_path_buf()], 10);
        assert_eq!(arqs.len(), 4);
        let g = duplicados(&arqs, 1);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].caminhos.len(), 2);
        assert_eq!(g[0].desperdicio, 18);
    }

    #[test]
    fn gigantes_so_os_grandes_e_parados() {
        let mk = |n: &str, b: u64, m: u64| Arquivo { caminho: n.into(), nome: n.into(), extensao: "".into(), categoria: Categoria::Outros, bytes: b, modificado: m };
        let agora = 1_000_000_000;
        let l = vec![mk("velho-grande", 5_000, agora - 200 * 86_400), mk("novo-grande", 5_000, agora - 86_400), mk("velho-pequeno", 10, agora - 400 * 86_400)];
        let g = gigantes_parados(&l, 1_000, 90, agora);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].nome, "velho-grande");
    }

    #[test]
    fn organiza_por_categoria_sem_sobrescrever_e_desfaz() {
        let t = tempfile::tempdir().unwrap();
        grava(&t.path().join("foto.png"), b"1");
        grava(&t.path().join("Imagens/foto.png"), b"ja-existe");
        grava(&t.path().join("nota.txt"), b"2");
        let arqs: Vec<Arquivo> = varrer(&[t.path().to_path_buf()], 1);
        let plano = plano_por_categoria(&arqs, t.path());
        assert_eq!(plano.len(), 2); // o que já está em Imagens/ não se mexe (profundidade 1 nem enxerga)
        let sim = aplicar(&plano, true);
        assert!(sim.simulacao && t.path().join("foto.png").exists());
        let r = aplicar(&plano, false);
        assert_eq!(r.movidos.len(), 2);
        assert_eq!(fs::read(t.path().join("Imagens/foto.png")).unwrap(), b"ja-existe");
        assert_eq!(fs::read(t.path().join("Imagens/foto (1).png")).unwrap(), b"1");
        assert!(t.path().join("Documentos/nota.txt").exists());
        let d = desfazer(&r.movidos);
        assert!(d.falhas.is_empty());
        assert!(t.path().join("foto.png").exists() && t.path().join("nota.txt").exists());
    }

    #[test]
    fn quarentena_nao_apaga_nada() {
        let t = tempfile::tempdir().unwrap();
        grava(&t.path().join("a.bin"), b"zzzz");
        grava(&t.path().join("b.bin"), b"zzzz");
        let g = duplicados(&varrer(&[t.path().to_path_buf()], 3), 1).remove(0);
        let manter = t.path().join("a.bin");
        let movs = quarentena_de_duplicados(&g, &manter);
        assert_eq!(movs.len(), 1);
        let r = aplicar(&movs, false);
        assert_eq!(r.movidos.len(), 1);
        assert!(manter.exists() && t.path().join(QUARENTENA).join("b.bin").exists());
        // a quarentena não aparece em novas varreduras
        assert_eq!(varrer(&[t.path().to_path_buf()], 3).len(), 1);
    }
}
