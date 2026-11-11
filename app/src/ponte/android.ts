import { registerPlugin } from "@capacitor/core";
import type { Motor } from "./tipos";

/** Mesmo contrato do Rust, implementado em Kotlin (plugin "Vindex"). */
interface PluginVindex {
  motor(opcoes: { comando: string; args: string }): Promise<{ resultado: string }>;
  escolherPasta(): Promise<{ pasta: string | null }>;
}
const Vindex = registerPlugin<PluginVindex>("Vindex");

const indisponivel = async (): Promise<never> => { throw new Error("Esse recurso ainda não existe no Android."); };

export function motorAndroid(): Motor {
  const c = async <T>(comando: string, args: Record<string, unknown> = {}): Promise<T> => JSON.parse((await Vindex.motor({ comando, args: JSON.stringify(args) })).resultado) as T;
  return {
    plataforma: "android",
    recursos: { extrair: false, defender: false, inicializacao: false, abrirPasta: false },
    diagnostico: (processos = 8) => c("diagnostico", { processos }),
    otimizarTudo: (simulacao = false) => c("otimizar_tudo", { simulacao }),
    escolherPasta: async () => (await Vindex.escolherPasta()).pasta,
    varrer: (raizes) => c("varrer", { raizes }),
    duplicados: (raizes, min_bytes = 1024) => c("duplicados", { raizes, min_bytes }),
    gigantes: (raizes, min_bytes = 200 * 1024 * 1024, parado_dias = 90) => c("gigantes", { raizes, min_bytes, parado_dias }),
    organizarCategorias: (raizes, simulacao) => c("organizar_categorias", { raizes, simulacao }),
    aplicarRegras: (raizes, regras, simulacao) => c("aplicar_regras", { raizes, regras, simulacao }),
    duplicadoParaQuarentena: (raizes, manter, simulacao) => c("duplicados_para_quarentena", { raizes, manter, simulacao }),
    desfazer: (movidos) => c("desfazer", { movidos }),
    alvosDeLimpeza: () => c("alvos_limpeza"),
    planejarLimpeza: (alvos) => c("planejar_limpeza", { alvos }),
    executarLimpeza: (alvos, simulacao = false) => c("executar_limpeza", { alvos, simulacao }),
    otimizarMemoria: () => c("otimizar_memoria"),
    pastasConhecidas: async () => [
      { id: "downloads", rotulo: "Downloads", caminho: "/storage/emulated/0/Download" },
      { id: "documentos", rotulo: "Documentos", caminho: "/storage/emulated/0/Documents" },
      { id: "imagens", rotulo: "Imagens", caminho: "/storage/emulated/0/Pictures" },
      { id: "dcim", rotulo: "Câmera", caminho: "/storage/emulated/0/DCIM" }
    ],
    escolherArquivo: async () => null,
    listarCompactado: indisponivel, pastaSugerida: indisponivel, extrair: indisponivel,
    inicioPeloMenu: async () => null,
    abrirPasta: async () => undefined,
    abrirLink: async (url) => { window.open(url, "_blank"); },
    estadoProtecao: async () => ({ suportado: false, antivirus_ligado: null, tempo_real_ligado: null, assinaturas_dias: null, firewall: [], nota: "No Android, a proteção é feita pelo Google Play Protect." }),
    defenderVarrer: indisponivel,
    verificarArquivos: indisponivel,
    programasIniciais: async () => [],
    verificarHosts: async () => []
  };
}
