import type { Motor } from "./tipos";

/** Windows: fala com o motor em Rust pelo comando "motor" do Tauri. */
export async function motorTauri(): Promise<Motor> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const c = <T>(comando: string, args: Record<string, unknown> = {}) => invoke<T>("motor", { comando, args });
  return {
    plataforma: "windows",
    recursos: { extrair: true, defender: true, inicializacao: true, abrirPasta: true, arquivosSuspeitos: true, verificarApps: false, permissoes: false, atualizaSozinho: false },
    diagnostico: (processos = 8) => c("diagnostico", { processos }),
    otimizarTudo: (simulacao = false) => c("otimizar_tudo", { simulacao }),
    escolherPasta: async () => {
      const r = await open({ directory: true, multiple: false });
      return typeof r === "string" ? r : null;
    },
    varrer: (raizes) => c("varrer", { raizes }),
    duplicados: (raizes, min_bytes = 1024) => c("duplicados", { raizes, min_bytes }),
    gigantes: (raizes, min_bytes = 500 * 1024 * 1024, parado_dias = 90) => c("gigantes", { raizes, min_bytes, parado_dias }),
    organizarCategorias: (raizes, simulacao) => c("organizar_categorias", { raizes, simulacao }),
    aplicarRegras: (raizes, regras, simulacao) => c("aplicar_regras", { raizes, regras, simulacao }),
    duplicadoParaQuarentena: (raizes, manter, simulacao) => c("duplicados_para_quarentena", { raizes, manter, simulacao }),
    desfazer: (movidos) => c("desfazer", { movidos }),
    alvosDeLimpeza: () => c("alvos_limpeza"),
    planejarLimpeza: (alvos) => c("planejar_limpeza", { alvos }),
    executarLimpeza: (alvos, simulacao = false) => c("executar_limpeza", { alvos, simulacao }),
    otimizarMemoria: () => c("otimizar_memoria"),
    pastasConhecidas: () => c("pastas_conhecidas"),
    escolherArquivo: async () => {
      const r = await open({ multiple: false, filters: [{ name: "Arquivos compactados", extensions: ["zip", "tar", "gz", "tgz"] }] });
      return typeof r === "string" ? r : null;
    },
    listarCompactado: (origem) => c("listar_arquivo", { origem }),
    pastaSugerida: (origem) => c("pasta_sugerida", { origem }),
    extrair: (origem, destino) => c("extrair", { origem, destino }),
    inicioPeloMenu: () => invoke("argumento_inicial"),
    abrirPasta: (caminho) => invoke("abrir_pasta", { caminho }),
    abrirLink: (url) => invoke("abrir_link", { url }),
    estadoProtecao: () => c("seguranca_estado"),
    defenderVarrer: (pasta) => c("defender_varrer", { pasta: pasta ?? "" }),
    verificarArquivos: (raizes) => c("verificar_arquivos", { raizes }),
    programasIniciais: () => c("programas_iniciais"),
    verificarHosts: () => c("verificar_hosts"),
    permissoes: async () => [],
    pedirPermissao: async () => undefined,
    abrirConfiguracao: async () => undefined,
    verificarApps: async () => ({ analisados: 0, achados: [] }),
    instalarAtualizacao: async () => { throw new Error("No Windows a atualização é baixada pelo navegador."); }
  };
}
