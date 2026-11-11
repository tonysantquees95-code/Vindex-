import type { Motor } from "./tipos";

/** Windows: fala com o motor em Rust pelo comando "motor" do Tauri. */
export async function motorTauri(): Promise<Motor> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const c = <T>(comando: string, args: Record<string, unknown> = {}) => invoke<T>("motor", { comando, args });
  return {
    plataforma: "windows",
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
    desfazer: (movidos) => c("desfazer", { movidos })
  };
}
