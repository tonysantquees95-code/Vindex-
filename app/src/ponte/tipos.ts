// Contrato único do motor: o Windows (Tauri/Rust) e o Android (Kotlin) respondem exatamente com estes formatos.
export interface Diagnostico {
  sistema: string; maquina: string; ligado_ha_s: number; cpu_nome: string; cpu_nucleos: number; cpu_uso: number;
  memoria: { total: number; usada: number; disponivel: number; percentual: number };
  temperatura_max: number | null; sensores: { nome: string; celsius: number }[];
  /** Android 10+: estado térmico que o próprio sistema calcula para este modelo (0 normal … 6 desligando) e a folga (1.0 = limite) */
  termico?: { estado: number; folga?: number } | null;
  bateria: { nivel: number; estado: string; saude: number } | null;
  discos: { nome: string; ponto: string; tipo: string; sistema: string; total: number; livre: number; percentual_usado: number; saude: string }[];
  processos: { pid: number; nome: string; cpu: number; memoria: number; tempo_uso_s?: number }[];
  // campos novos (o Android antigo pode não mandar)
  swap_total?: number; swap_usado?: number; processos_total?: number;
  rede?: { recebido: number; enviado: number; interfaces: number; tipo?: string; internet?: boolean; vpn?: boolean; velocidade_mbps?: number; sinal?: number };
  /** true quando o Android não deixa ler a carga real e o número é estimado pela frequência dos núcleos */
  cpu_estimado?: boolean;
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

export interface PastaConhecida { id: string; rotulo: string; caminho: string }
export interface ConteudoCompactado { itens: number; bytes: number; nomes: string[]; tamanhos?: number[]; formato: string }
export interface ProgressoArquivo { fase: string; atual: string; feitos: number; total: number }
export interface ResultadoExtracao { destino: string; arquivos: number; bytes: number; pulados: string[] }
export interface EstadoProtecao {
  suportado: boolean; antivirus_ligado: boolean | null; tempo_real_ligado: boolean | null; assinaturas_dias: number | null;
  firewall: [string, boolean][]; nota: string;
  /** Android: verificações do aparelho (bloqueio de tela, Play Protect, patch…). `config` abre a tela certa do sistema. */
  itens?: { rotulo: string; ok: boolean | null; detalhe: string; config: string | null }[];
}
export interface Achado { caminho: string; nivel: "alto" | "medio" | "baixo"; motivo: string }
export interface ResultadoVerificacao { analisados: number; achados: Achado[] }
export interface ProgramaInicial { nome: string; comando: string; origem: string }
export interface AlvoDeLimpeza { id: string; rotulo: string; pasta: string }
export interface PlanoDeLimpeza { total_bytes: number; arquivos: number; por_alvo: [string, number][] }
export interface InicioPeloMenu { modo: "escolher" | "aqui"; arquivo: string }

/** O que cada plataforma sabe fazer; a interface esconde o que não existe. */
export interface Recursos {
  extrair: boolean; defender: boolean; inicializacao: boolean; abrirPasta: boolean;
  /** abre arquivos com o programa padrão */
  abrirArquivos: boolean;
  /** verificar arquivos suspeitos nas pastas (Windows e Android) */
  arquivosSuspeitos: boolean;
  /** verificar os apps instalados (Android) */
  verificarApps: boolean;
  /** o app pede permissões ao Android antes de usar */
  permissoes: boolean;
  /** o app se atualiza baixando o APK e abrindo a instalação */
  atualizaSozinho: boolean;
}
export interface Permissao { id: string; rotulo: string; motivo: string; obrigatoria: boolean; concedida: boolean }

export interface Armazenamento { rotulo: string; caminho: string; total: number; livre: number }
export interface ItemDePasta { nome: string; caminho: string; pasta: boolean; bytes: number; modificado: number; categoria: string; itens: number }
export interface Listagem { caminho: string; pai: string | null; itens: ItemDePasta[]; truncado: boolean }

export interface Motor {
  plataforma: "windows" | "android" | "demonstracao";
  recursos: Recursos;
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
  alvosDeLimpeza(): Promise<AlvoDeLimpeza[]>;
  planejarLimpeza(alvos: string[]): Promise<PlanoDeLimpeza>;
  executarLimpeza(alvos: string[], simulacao?: boolean): Promise<{ apagados: number; liberado_bytes: number; falhas: string[]; simulacao: boolean }>;
  otimizarMemoria(): Promise<{ suportado: boolean; processos_ajustados: number; liberado_bytes: number; nota: string }>;
  pastasConhecidas(): Promise<PastaConhecida[]>;
  escolherArquivo(): Promise<string | null>;
  listarCompactado(origem: string, senha?: string): Promise<ConteudoCompactado>;
  pastaSugerida(origem: string): Promise<string>;
  extrair(origem: string, destino: string, senha?: string, selecionados?: string[]): Promise<ResultadoExtracao>;
  /** Android: cria ZIP, 7z ou TAR.GZ; consulta o andamento de extrair/compactar; cancela. */
  compactar?(origens: string[], destino: string, formato: "zip" | "7z" | "tgz"): Promise<{ destino: string; arquivos: number; bytes: number }>;
  progressoArquivo?(): Promise<ProgressoArquivo>;
  cancelarArquivo?(): Promise<void>;
  inicioPeloMenu(): Promise<InicioPeloMenu | null>;
  /** Só no Android: pasta que outro app (o Vortex) pediu para abrir; entrega uma vez. */
  pastaPedida?(): Promise<string | null>;
  abrirPasta(caminho: string): Promise<void>;
  // explorador de arquivos
  armazenamentos(): Promise<Armazenamento[]>;
  listarPasta(caminho: string, ocultos?: boolean): Promise<Listagem>;
  recentes(raizes: string[], limite?: number): Promise<ItemDePasta[]>;
  colecao(raizes: string[], categoria: string, limite?: number): Promise<ItemDePasta[]>;
  buscarNome(caminho: string, texto: string): Promise<ItemDePasta[]>;
  novaPasta(caminho: string, nome: string): Promise<string>;
  renomear(caminho: string, nome: string): Promise<string>;
  paraLixeira(caminhos: string[]): Promise<ResultadoDeMovimento>;
  /** Exclui de vez, sem lixeira. */
  apagarDeVez(caminhos: string[]): Promise<{ apagados: number; falhas: string[] }>;
  /** Pastas “Vindex-Quarentena” dentro das raízes. */
  quarentenas(raizes: string[]): Promise<ItemDePasta[]>;
  /** abrir um arquivo com o programa padrão (Windows); no Android ainda não */
  abrirArquivo(caminho: string): Promise<void>;
  abrirLink(url: string): Promise<void>;
  estadoProtecao(): Promise<EstadoProtecao>;
  defenderVarrer(pasta?: string): Promise<{ resumo: string }>;
  verificarArquivos(raizes: string[]): Promise<ResultadoVerificacao>;
  programasIniciais(): Promise<ProgramaInicial[]>;
  verificarHosts(): Promise<string[]>;
  permissoes(): Promise<Permissao[]>;
  pedirPermissao(id: string): Promise<void>;
  abrirConfiguracao(id: string): Promise<void>;
  verificarApps(): Promise<ResultadoVerificacao>;
  /** Android: baixa o APK, confere o SHA-256 e abre a confirmação de instalação. */
  instalarAtualizacao(url: string, sha256: string): Promise<void>;
}
