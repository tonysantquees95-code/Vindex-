import { registerPlugin } from "@capacitor/core";
import type { Motor, Permissao } from "./tipos";

/** Mesmo contrato do Rust, implementado em Kotlin (plugin "Vindex"). */
interface PluginVindex {
  motor(opcoes: { comando: string; args: string }): Promise<{ resultado: string }>;
  escolherPasta(): Promise<{ pasta: string | null }>;
  permissoes(): Promise<{ lista: Permissao[] }>;
  pedirPermissao(o: { id: string }): Promise<void>;
  abrirConfiguracao(o: { id: string }): Promise<void>;
  abrirArquivo(o: { caminho: string }): Promise<void>;
  instalarAtualizacao(o: { url: string; sha256: string }): Promise<void>;
}
const Vindex = registerPlugin<PluginVindex>("Vindex");

const indisponivel = async (): Promise<never> => { throw new Error("Esse recurso ainda não existe no Android."); };

export function motorAndroid(): Motor {
  const c = async <T>(comando: string, args: Record<string, unknown> = {}): Promise<T> => JSON.parse((await Vindex.motor({ comando, args: JSON.stringify(args) })).resultado) as T;
  return {
    plataforma: "android",
    recursos: { extrair: false, defender: false, inicializacao: false, abrirPasta: false, abrirArquivos: true, arquivosSuspeitos: true, verificarApps: true, permissoes: true, atualizaSozinho: true },
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
    armazenamentos: () => c("explorar_armazenamentos"),
    listarPasta: (caminho, ocultos = false) => c("explorar_listar", { caminho, ocultos }),
    recentes: (raizes, limite = 60) => c("explorar_recentes", { raizes, limite }),
    colecao: (raizes, categoria, limite = 200) => c("explorar_colecao", { raizes, categoria, limite }),
    buscarNome: (caminho, texto) => c("explorar_buscar", { caminho, texto }),
    novaPasta: (caminho, nome) => c("explorar_nova_pasta", { caminho, nome }),
    renomear: (caminho, nome) => c("explorar_renomear", { caminho, nome }),
    paraLixeira: (caminhos) => c("explorar_lixeira", { caminhos }),
    abrirPasta: async () => undefined,
    abrirArquivo: (caminho) => Vindex.abrirArquivo({ caminho }),
    abrirLink: async (url) => { window.open(url, "_blank"); },
    estadoProtecao: () => c("estado_protecao"),
    defenderVarrer: indisponivel,
    verificarArquivos: (raizes) => c("verificar_arquivos", { raizes }),
    programasIniciais: async () => [],
    verificarHosts: async () => [],
    permissoes: async () => (await Vindex.permissoes()).lista,
    pedirPermissao: (id) => Vindex.pedirPermissao({ id }),
    abrirConfiguracao: (id) => Vindex.abrirConfiguracao({ id }),
    verificarApps: () => c("verificar_apps"),
    instalarAtualizacao: (url, sha256) => Vindex.instalarAtualizacao({ url, sha256 })
  };
}
