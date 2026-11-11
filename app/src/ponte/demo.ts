import type { Diagnostico, Motor } from "./tipos";

/** Navegador comum (sem motor nativo): dados de demonstração, claramente identificados na tela. */
export function motorDemo(): Motor {
  let t = 0;
  const diag = (): Diagnostico => {
    t += 1;
    const onda = (base: number, amp: number, f: number) => Math.max(1, Math.min(99, base + amp * Math.sin(t / f)));
    return {
      sistema: "Demonstração", maquina: "navegador", ligado_ha_s: 86_400, cpu_nome: "CPU de demonstração", cpu_nucleos: 8, cpu_uso: onda(35, 25, 2),
      memoria: { total: 16e9, usada: onda(55, 10, 5) * 16e7, disponivel: 0, percentual: onda(55, 10, 5) },
      temperatura_max: onda(55, 12, 4), sensores: [{ nome: "CPU", celsius: onda(55, 12, 4) }], bateria: { nivel: 82, estado: "carregando", saude: 91 },
      discos: [{ nome: "C:", ponto: "C:\\", tipo: "SSD", sistema: "NTFS", total: 512e9, livre: 180e9, percentual_usado: 65, saude: "boa" }],
      processos: [{ pid: 1, nome: "navegador", cpu: 12.3, memoria: 900e6 }, { pid: 2, nome: "editor", cpu: 5.1, memoria: 420e6 }]
    };
  };
  const vazio = { movidos: [], falhas: ["Modo demonstração: abra o app do Windows ou do Android para mexer nos arquivos."], simulacao: true };
  return {
    plataforma: "demonstracao",
    diagnostico: async () => diag(),
    otimizarTudo: async () => ({ limpeza: { apagados: 0, liberado_bytes: 0, falhas: [], simulacao: true }, memoria: { suportado: false, processos_ajustados: 0, liberado_bytes: 0, nota: "Demonstração." }, ram_antes: 55, ram_depois: 55 }),
    escolherPasta: async () => null,
    varrer: async () => ({ arquivos: 0, bytes: 0, categorias: {} }),
    duplicados: async () => [], gigantes: async () => [],
    organizarCategorias: async () => vazio, aplicarRegras: async () => vazio, duplicadoParaQuarentena: async () => vazio, desfazer: async () => vazio
  };
}
