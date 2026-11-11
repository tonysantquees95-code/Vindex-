//! VindexEngineCore: leitura de hardware em tempo real.
use serde::{Deserialize, Serialize};
use std::time::Duration;
use sysinfo::{Components, Disks, Networks, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Memoria {
    pub total: u64,
    pub usada: u64,
    pub disponivel: u64,
    pub percentual: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Sensor {
    pub nome: String,
    pub celsius: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Bateria {
    pub nivel: f32,
    pub estado: String,
    pub saude: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Armazenamento {
    pub nome: String,
    pub ponto: String,
    pub tipo: String,
    pub sistema: String,
    pub total: u64,
    pub livre: u64,
    pub percentual_usado: f32,
    /// "boa", "atencao" ou "critica", pela folga de espaço. Não é leitura SMART do disco.
    pub saude: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Processo {
    pub pid: u32,
    pub nome: String,
    pub cpu: f32,
    pub memoria: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Rede {
    /// total recebido/enviado desde que o sistema ligou, somando as interfaces
    pub recebido: u64,
    pub enviado: u64,
    pub interfaces: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Diagnostico {
    pub sistema: String,
    pub maquina: String,
    pub ligado_ha_s: u64,
    pub cpu_nome: String,
    pub cpu_nucleos: usize,
    pub cpu_uso: f32,
    pub memoria: Memoria,
    pub temperatura_max: Option<f32>,
    pub sensores: Vec<Sensor>,
    pub bateria: Option<Bateria>,
    pub discos: Vec<Armazenamento>,
    pub processos: Vec<Processo>,
    /// memória virtual (arquivo de paginação): total e usada
    #[serde(default)]
    pub swap_total: u64,
    #[serde(default)]
    pub swap_usado: u64,
    #[serde(default)]
    pub processos_total: usize,
    #[serde(default)]
    pub rede: Rede,
}

pub fn saude_do_disco(percentual_usado: f32) -> &'static str {
    if percentual_usado >= 95.0 {
        "critica"
    } else if percentual_usado >= 85.0 {
        "atencao"
    } else {
        "boa"
    }
}

fn percentual(parte: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        (parte as f64 / total as f64 * 100.0) as f32
    }
}

pub fn ler_bateria() -> Option<Bateria> {
    let gerente = starship_battery::Manager::new().ok()?;
    let b = gerente.batteries().ok()?.flatten().next()?;
    Some(Bateria {
        nivel: b.state_of_charge().value * 100.0,
        estado: format!("{}", b.state()).to_lowercase(),
        saude: b.state_of_health().value * 100.0,
    })
}

/// Lê tudo de uma vez. A CPU precisa de duas leituras separadas por um intervalo para dar uma porcentagem real.
pub fn diagnosticar(limite_processos: usize) -> Diagnostico {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL.max(Duration::from_millis(250)));
    sys.refresh_cpu_usage();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let total = sys.total_memory();
    let disponivel = sys.available_memory();
    let usada = total.saturating_sub(disponivel);

    let sensores: Vec<Sensor> = Components::new_with_refreshed_list()
        .iter()
        .filter(|c| c.temperature().is_finite() && c.temperature() > 0.0)
        .map(|c| Sensor { nome: c.label().to_string(), celsius: c.temperature() })
        .collect();
    let temperatura_max = sensores.iter().map(|s| s.celsius).fold(None, |m: Option<f32>, v| Some(m.map_or(v, |x| x.max(v))));

    let discos = Disks::new_with_refreshed_list()
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| {
            let usado = d.total_space().saturating_sub(d.available_space());
            let p = percentual(usado, d.total_space());
            Armazenamento {
                nome: d.name().to_string_lossy().to_string(),
                ponto: d.mount_point().to_string_lossy().to_string(),
                tipo: d.kind().to_string(),
                sistema: d.file_system().to_string_lossy().to_string(),
                total: d.total_space(),
                livre: d.available_space(),
                percentual_usado: p,
                saude: saude_do_disco(p).to_string(),
            }
        })
        .collect();

    let mut processos: Vec<Processo> = sys
        .processes()
        .values()
        .map(|p| Processo { pid: p.pid().as_u32(), nome: p.name().to_string_lossy().to_string(), cpu: p.cpu_usage(), memoria: p.memory() })
        .collect();
    processos.sort_by(|a, b| {
        let pa = a.cpu as f64 * 1_000_000_000.0 + a.memoria as f64;
        let pb = b.cpu as f64 * 1_000_000_000.0 + b.memoria as f64;
        pb.partial_cmp(&pa).unwrap_or(std::cmp::Ordering::Equal)
    });
    let processos_total = processos.len();
    processos.truncate(limite_processos);
    let redes = Networks::new_with_refreshed_list();
    let rede = Rede { recebido: redes.iter().map(|(_, d)| d.total_received()).sum(), enviado: redes.iter().map(|(_, d)| d.total_transmitted()).sum(), interfaces: redes.iter().count() };

    Diagnostico {
        sistema: format!("{} {}", System::name().unwrap_or_default(), System::os_version().unwrap_or_default()).trim().to_string(),
        maquina: System::host_name().unwrap_or_default(),
        ligado_ha_s: System::uptime(),
        cpu_nome: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
        cpu_nucleos: sys.cpus().len(),
        cpu_uso: sys.global_cpu_usage(),
        memoria: Memoria { total, usada, disponivel, percentual: percentual(usada, total) },
        temperatura_max,
        sensores,
        bateria: ler_bateria(),
        discos,
        processos,
        swap_total: sys.total_swap(),
        swap_usado: sys.used_swap(),
        processos_total,
        rede,
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    #[test]
    fn saude_pela_folga() {
        assert_eq!(saude_do_disco(40.0), "boa");
        assert_eq!(saude_do_disco(90.0), "atencao");
        assert_eq!(saude_do_disco(97.0), "critica");
    }
    #[test]
    fn diagnostico_devolve_valores_coerentes() {
        let d = diagnosticar(5);
        assert!(d.memoria.total > 0);
        assert!(d.memoria.usada <= d.memoria.total);
        assert!(d.cpu_nucleos > 0);
        assert!(d.cpu_uso >= 0.0 && d.cpu_uso <= 100.0 * d.cpu_nucleos as f32);
        assert!(d.processos.len() <= 5);
        let json = serde_json::to_string(&d).unwrap();
        let volta: Diagnostico = serde_json::from_str(&json).unwrap();
        assert_eq!(volta.memoria.total, d.memoria.total);
    }
}
