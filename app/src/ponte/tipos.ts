// Contrato único do motor: o Windows (Tauri/Rust) e o Android (Kotlin) respondem exatamente com estes formatos.
export interface Diagnostico {
  sistema: string; maquina: string; ligado_ha_s: number; cpu_nome: string; cpu_nucleos: number; cpu_uso: number;
  memoria: { total: number; usada: number; disponivel: number; percentual: number };
  temperatura_max: number | null; sensores: { nome: string; celsius: number }[];
  bateria: { nivel: number; estado: string; saude: number } | null;
  discos: { nome: string; ponto: string; tipo: string; sistema: string; total: number; livre: number; percentual_usado: number; saude: string }[];
  processos: { pid: number; nome: string; cpu: number; memoria: number }[];
}
export interface GrupoDuplicado { sha256: string; bytes: number; caminhos: string[]; desperdicio: number }
export interface Movimento { de: string; para: string; motivo: string }
export interface ResultadoDeMovimento { movidos: Movimento[]; falhas: string[]; simulacao: boolean }
export interface ResultadoDeLimpeza { apagados: number; liberado_bytes: number; falhas: string[]; simulacao: boolean }
export interface ResultadoOtimizacao {
  limpeza: ResultadoDeLimpeza; memoria: { suportado: boolean; processos_ajustados: number; liberado_bytes: number; nota: string };
  ram_antes: number; ram_depois: number;
}
export interface ResumoVarredura { arquivos: number; bytes: number; categorias: Record<string, [number, number]> }
export interface Arquivo { caminho: string; nome: string; extensao: string; categoria: string; bytes: number; modificado: number }

export type Categoria = "imagens" | "videos" | "audios" | "documentos" | "planilhas" | "apresentacoes" | "compactados" | "instaladores" | "codigo" | "outros";
export type Acao = { tipo: "mover"; destino: string } | { tipo: "quarentena" };
export interface Regra {
  id: string; nome: string; ativa: boolean;
  condicoes: { extensoes: string[]; categorias: Categoria[]; nome_contem: string | null; tamanho_min: number | null; tamanho_max: number | null; parado_dias_min: number | null };
  acao: Acao;
}

export interface Motor {
  plataforma: "windows" | "android" | "demonstracao";
  diagnostico(processos?: number): Promise<Diagnostico>;
  otimizarTudo(simulacao?: boolean): Promise<ResultadoOtimizacao>;
  escolherPasta(): Promise<string | null>;
  varrer(raizes: string[]): Promise<ResumoVarredura>;
  duplicados(raizes: string[], minBytes?: number): Promise<GrupoDuplicado[]>;
  gigantes(raizes: string[], minBytes?: number, paradoDias?: number): Promise<Arquivo[]>;
  organizarCategorias(raizes: string[], simulacao: boolean): Promise<ResultadoDeMovimento>;
  aplicarRegras(raizes: string[], regras: Regra[], simulacao: boolean): Promise<ResultadoDeMovimento>;
  duplicadoParaQuarentena(raizes: string[], manter: string, simulacao: boolean): Promise<ResultadoDeMovimento>;
  desfazer(movidos: Movimento[]): Promise<ResultadoDeMovimento>;
}
