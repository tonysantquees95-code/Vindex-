//! SystemCleanerModule: limpeza segura de temporários, caches e resíduos + compactação da memória.
//! Regras de segurança: só apaga ARQUIVOS (nunca pastas-raiz), nunca segue atalhos/links simbólicos,
//! só dentro das pastas-alvo, só o que está parado há mais de `idade_min_horas` e sempre pode ser simulado antes.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Alvo {
    pub id: String,
    pub rotulo: String,
    pub pasta: PathBuf,
    pub idade_min_horas: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ItemLimpeza {
    pub caminho: PathBuf,
    pub bytes: u64,
    pub alvo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct PlanoDeLimpeza {
    pub itens: Vec<ItemLimpeza>,
    pub total_bytes: u64,
    /// bytes por alvo, para a tela mostrar de onde vem o espaço
    pub por_alvo: Vec<(String, u64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ResultadoDeLimpeza {
    pub apagados: usize,
    pub liberado_bytes: u64,
    pub falhas: Vec<String>,
    pub simulacao: bool,
}

fn variavel(nome: &str) -> Option<PathBuf> {
    std::env::var_os(nome).filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn alvo(id: &str, rotulo: &str, pasta: PathBuf, horas: u64) -> Alvo {
    Alvo { id: id.into(), rotulo: rotulo.into(), pasta, idade_min_horas: horas }
}

/// Pastas padrão de cada sistema (as que não existem ficam de fora).
pub fn alvos_padrao() -> Vec<Alvo> {
    let mut v = Vec::new();
    v.push(alvo("temp_usuario", "Temporários do usuário", std::env::temp_dir(), 24));
    if cfg!(windows) {
        if let Some(l) = variavel("LOCALAPPDATA") {
            v.push(alvo("cache_internet", "Cache da internet do Windows", l.join("Microsoft/Windows/INetCache"), 48));
            v.push(alvo("miniaturas", "Cache de miniaturas", l.join("Microsoft/Windows/Explorer"), 72));
            v.push(alvo("despejos", "Relatórios de erro e despejos", l.join("CrashDumps"), 72));
            v.push(alvo("cache_chrome", "Cache do Chrome", l.join("Google/Chrome/User Data/Default/Cache"), 72));
            v.push(alvo("shaders", "Cache de shaders de jogos (DirectX)", l.join("D3DSCache"), 72));
            v.push(alvo("relatorios_erro", "Relatórios de erro do Windows", l.join("Microsoft/Windows/WER"), 72));
            v.push(alvo("cache_edge", "Cache do Edge", l.join("Microsoft/Edge/User Data/Default/Cache"), 72));
        }
        if let Some(w) = variavel("WINDIR") {
            v.push(alvo("temp_windows", "Temporários do Windows", w.join("Temp"), 72));
        }
    } else if let Some(h) = variavel("HOME") {
        v.push(alvo("cache_usuario", "Cache de aplicativos", h.join(".cache"), 72));
        v.push(alvo("lixeira", "Lixeira", h.join(".local/share/Trash/files"), 24 * 30));
    }
    v.retain(|a| a.pasta.is_dir());
    v.dedup_by(|a, b| a.pasta == b.pasta);
    v
}

fn parado_ha(caminho: &Path, horas: u64, agora: SystemTime) -> bool {
    let Ok(meta) = fs::symlink_metadata(caminho) else { return false };
    let Ok(mod_) = meta.modified() else { return false };
    agora.duration_since(mod_).map(|d| d >= Duration::from_secs(horas * 3600)).unwrap_or(false)
}

/// Passo 1: só lê e soma. Nada é apagado aqui.
pub fn planejar(alvos: &[Alvo], agora: SystemTime) -> PlanoDeLimpeza {
    let mut plano = PlanoDeLimpeza::default();
    for a in alvos {
        let mut soma = 0u64;
        for e in WalkDir::new(&a.pasta).follow_links(false).into_iter().filter_map(Result::ok) {
            if !e.file_type().is_file() || !parado_ha(e.path(), a.idade_min_horas, agora) {
                continue;
            }
            let bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
            soma += bytes;
            plano.itens.push(ItemLimpeza { caminho: e.path().to_path_buf(), bytes, alvo: a.id.clone() });
        }
        plano.por_alvo.push((a.id.clone(), soma));
        plano.total_bytes += soma;
    }
    plano
}

fn dentro_do_alvo(caminho: &Path, alvos: &[Alvo]) -> bool {
    let Ok(real) = fs::canonicalize(caminho) else { return false };
    alvos.iter().any(|a| fs::canonicalize(&a.pasta).map(|raiz| real.starts_with(&raiz) && real != raiz).unwrap_or(false))
}

/// Passo 2: executa (ou simula) o plano, conferindo de novo cada caminho antes de apagar.
pub fn executar(plano: &PlanoDeLimpeza, alvos: &[Alvo], simulacao: bool) -> ResultadoDeLimpeza {
    let mut r = ResultadoDeLimpeza { simulacao, ..Default::default() };
    for item in &plano.itens {
        let Ok(meta) = fs::symlink_metadata(&item.caminho) else { continue };
        if !meta.is_file() || meta.file_type().is_symlink() || !dentro_do_alvo(&item.caminho, alvos) {
            r.falhas.push(format!("{}: fora das pastas permitidas", item.caminho.display()));
            continue;
        }
        if simulacao {
            r.apagados += 1;
            r.liberado_bytes += meta.len();
            continue;
        }
        match fs::remove_file(&item.caminho) {
            Ok(()) => {
                r.apagados += 1;
                r.liberado_bytes += meta.len();
            }
            Err(e) => r.falhas.push(format!("{}: {}", item.caminho.display(), e)),
        }
    }
    if !simulacao {
        for a in alvos {
            remover_pastas_vazias(&a.pasta);
        }
    }
    r
}

fn remover_pastas_vazias(raiz: &Path) {
    let pastas: Vec<PathBuf> = WalkDir::new(raiz).follow_links(false).contents_first(true).into_iter().filter_map(Result::ok).filter(|e| e.file_type().is_dir() && e.path() != raiz).map(|e| e.into_path()).collect();
    for p in pastas {
        let _ = fs::remove_dir(&p); // só funciona se estiver vazia
    }
}

// ------------------------------------------------------------------ memória
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ResultadoDeMemoria {
    pub suportado: bool,
    pub processos_ajustados: usize,
    pub liberado_bytes: u64,
    pub nota: String,
}

/// Devolve ao sistema a memória "parada" dos processos (reduz o conjunto de trabalho). Não fecha nada.
#[cfg(windows)]
pub fn otimizar_memoria() -> ResultadoDeMemoria {
    use sysinfo::{ProcessesToUpdate, System};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::ProcessStatus::K32EmptyWorkingSet;
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA};
    let mut sys = System::new();
    sys.refresh_memory();
    let antes = sys.available_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let mut ajustados = 0usize;
    for pid in sys.processes().keys() {
        // SAFETY: chamadas diretas da API do Windows; o identificador é fechado logo em seguida.
        unsafe {
            let h = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, 0, pid.as_u32());
            if !h.is_null() {
                if K32EmptyWorkingSet(h) != 0 {
                    ajustados += 1;
                }
                CloseHandle(h);
            }
        }
    }
    std::thread::sleep(Duration::from_millis(400));
    sys.refresh_memory();
    ResultadoDeMemoria { suportado: true, processos_ajustados: ajustados, liberado_bytes: sys.available_memory().saturating_sub(antes), nota: "Memória parada devolvida ao sistema; nenhum programa foi fechado.".into() }
}

#[cfg(not(windows))]
pub fn otimizar_memoria() -> ResultadoDeMemoria {
    ResultadoDeMemoria { suportado: false, processos_ajustados: 0, liberado_bytes: 0, nota: "A compactação de memória está disponível no Windows; aqui o sistema já gerencia a RAM sozinho.".into() }
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    fn arquivo(p: &Path, tam: usize) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        File::create(p).unwrap().write_all(&vec![7u8; tam]).unwrap();
    }
    fn futuro() -> SystemTime {
        SystemTime::now() + Duration::from_secs(3 * 24 * 3600)
    }

    #[test]
    fn so_apaga_o_que_esta_parado_e_dentro_da_pasta() {
        let t = tempfile::tempdir().unwrap();
        let pasta = t.path().join("cache");
        arquivo(&pasta.join("a.tmp"), 100);
        arquivo(&pasta.join("sub/b.tmp"), 50);
        arquivo(&t.path().join("importante.txt"), 10);
        let alvos = vec![Alvo { id: "x".into(), rotulo: "x".into(), pasta: pasta.clone(), idade_min_horas: 24 }];
        // arquivos recém-criados não entram no plano
        assert_eq!(planejar(&alvos, SystemTime::now()).itens.len(), 0);
        let plano = planejar(&alvos, futuro());
        assert_eq!(plano.itens.len(), 2);
        assert_eq!(plano.total_bytes, 150);
        let sim = executar(&plano, &alvos, true);
        assert!(sim.simulacao && sim.apagados == 2 && pasta.join("a.tmp").exists());
        let r = executar(&plano, &alvos, false);
        assert_eq!(r.apagados, 2);
        assert_eq!(r.liberado_bytes, 150);
        assert!(!pasta.join("a.tmp").exists() && !pasta.join("sub").exists());
        assert!(pasta.exists() && t.path().join("importante.txt").exists());
    }

    #[test]
    fn recusa_caminho_fora_do_alvo_mesmo_se_estiver_no_plano() {
        let t = tempfile::tempdir().unwrap();
        let pasta = t.path().join("cache");
        fs::create_dir_all(&pasta).unwrap();
        let fora = t.path().join("documento.docx");
        arquivo(&fora, 20);
        let alvos = vec![Alvo { id: "x".into(), rotulo: "x".into(), pasta, idade_min_horas: 0 }];
        let plano = PlanoDeLimpeza { itens: vec![ItemLimpeza { caminho: fora.clone(), bytes: 20, alvo: "x".into() }], total_bytes: 20, por_alvo: vec![] };
        let r = executar(&plano, &alvos, false);
        assert_eq!(r.apagados, 0);
        assert_eq!(r.falhas.len(), 1);
        assert!(fora.exists());
    }

    #[cfg(unix)]
    #[test]
    fn nao_segue_link_simbolico() {
        let t = tempfile::tempdir().unwrap();
        let pasta = t.path().join("cache");
        let externa = t.path().join("externa");
        arquivo(&externa.join("segredo.txt"), 5);
        fs::create_dir_all(&pasta).unwrap();
        std::os::unix::fs::symlink(&externa, pasta.join("atalho")).unwrap();
        let alvos = vec![Alvo { id: "x".into(), rotulo: "x".into(), pasta, idade_min_horas: 0 }];
        let plano = planejar(&alvos, futuro());
        assert!(plano.itens.is_empty());
        assert!(externa.join("segredo.txt").exists());
    }

    #[test]
    fn memoria_responde_sem_quebrar() {
        let r = otimizar_memoria();
        assert!(!r.nota.is_empty());
    }
}
