import { registerPlugin } from "@capacitor/core";
import type { Motor } from "./tipos";

/** Mesmo contrato do Rust, implementado em Kotlin (plugin "Vindex"). */
interface PluginVindex {
  motor(opcoes: { comando: string; args: string }): Promise<{ resultado: string }>;
  escolherPasta(): Promise<{ pasta: string | null }>;
}
const Vindex = registerPlugin<PluginVindex>("Vindex");

export function motorAndroid(): Motor {
  const c = async <T>(comando: string, args: Record<string, unknown> = {}): Promise<T> => JSON.parse((await Vindex.motor({ comando, args: JSON.stringify(args) })).resultado) as T;
  return {
    plataforma: "android",
    diagnostico: (processos = 8) => c("diagnostico", { processos }),
    otimizarTudo: (simulacao = false) => c("otimizar_tudo", { simulacao }),
    escolherPasta: async () => (await Vindex.escolherPasta()).pasta,
    varrer: (raizes) => c("varrer", { raizes }),
    duplicados: (raizes, min_bytes = 1024) => c("duplicados", { raizes, min_bytes }),
    gigantes: (raizes, min_bytes = 200 * 1024 * 1024, parado_dias = 90) => c("gigantes", { raizes, min_bytes, parado_dias }),
    organizarCategorias: (raizes, simulacao) => c("organizar_categorias", { raizes, simulacao }),
    aplicarRegras: (raizes, regras, simulacao) => c("aplicar_regras", { raizes, regras, simulacao }),
    duplicadoParaQuarentena: (raizes, manter, simulacao) => c("duplicados_para_quarentena", { raizes, manter, simulacao }),
    desfazer: (movidos) => c("desfazer", { movidos })
  };
}
