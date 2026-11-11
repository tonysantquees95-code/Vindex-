import type { Categoria, Regra } from "./ponte";

export const CATEGORIAS: { id: Categoria; rotulo: string }[] = [
  { id: "imagens", rotulo: "Imagens" }, { id: "videos", rotulo: "Vídeos" }, { id: "audios", rotulo: "Áudios" },
  { id: "documentos", rotulo: "Documentos" }, { id: "planilhas", rotulo: "Planilhas" }, { id: "apresentacoes", rotulo: "Apresentações" },
  { id: "compactados", rotulo: "Compactados" }, { id: "instaladores", rotulo: "Instaladores" }, { id: "codigo", rotulo: "Código" }, { id: "outros", rotulo: "Outros" }
];

export const novaRegra = (id: string): Regra => ({
  id, nome: "", ativa: true,
  condicoes: { extensoes: [], categorias: [], nome_contem: null, tamanho_min: null, tamanho_max: null, parado_dias_min: null },
  acao: { tipo: "mover", destino: "" }
});

export const semCondicao = (r: Regra): boolean => {
  const c = r.condicoes;
  return !c.extensoes.length && !c.categorias.length && !c.nome_contem && c.tamanho_min == null && c.tamanho_max == null && c.parado_dias_min == null;
};

/** Mesmas regras de validação do motor, para avisar antes de enviar. */
export function validar(r: Regra): string[] {
  const e: string[] = [];
  if (!r.nome.trim()) e.push("Dê um nome à regra.");
  if (semCondicao(r)) e.push("Escolha pelo menos uma condição.");
  const { tamanho_min: a, tamanho_max: b } = r.condicoes;
  if (a != null && b != null && a > b) e.push("O tamanho mínimo é maior que o máximo.");
  if (r.acao.tipo === "mover" && !r.acao.destino.trim()) e.push("Informe a pasta de destino.");
  return e;
}

export function frase(r: Regra): string {
  const c = r.condicoes;
  const partes: string[] = [];
  if (c.categorias.length) partes.push(`do tipo ${c.categorias.map((x) => CATEGORIAS.find((k) => k.id === x)?.rotulo ?? x).join(" ou ")}`);
  if (c.extensoes.length) partes.push(`com extensão ${c.extensoes.map((x) => "." + x.replace(/^\./, "")).join(", ")}`);
  if (c.nome_contem) partes.push(`com “${c.nome_contem}” no nome`);
  if (c.tamanho_min != null) partes.push(`maiores que ${Math.round(c.tamanho_min / 1048576)} MB`);
  if (c.tamanho_max != null) partes.push(`menores que ${Math.round(c.tamanho_max / 1048576)} MB`);
  if (c.parado_dias_min != null) partes.push(`parados há ${c.parado_dias_min}+ dias`);
  const quais = partes.length ? `Arquivos ${partes.join(", ")}` : "Arquivos (escolha as condições)";
  return `${quais} → ${r.acao.tipo === "quarentena" ? "quarentena do Vindex" : `pasta “${r.acao.destino || "?"}”`}`;
}

const CHAVE = "vindex.regras";
export function carregarRegras(): Regra[] {
  try { const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function guardarRegras(r: Regra[]): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(r)); } catch { /* sem armazenamento: as regras valem só nesta sessão */ }
}

// ------------------------------------------------------------------ regras prontas
export interface RegraPronta { chave: string; titulo: string; descricao: string; regra: Omit<Regra, "id" | "ativa"> }
export interface PacotePronto { chave: string; titulo: string; descricao: string; chaves: string[] }

const vazia = { extensoes: [], categorias: [], nome_contem: null, tamanho_min: null, tamanho_max: null, parado_dias_min: null } as Regra["condicoes"];
const mover = (nome: string, destino: string, c: Partial<Regra["condicoes"]>): Omit<Regra, "id" | "ativa"> => ({ nome, condicoes: { ...vazia, ...c }, acao: { tipo: "mover", destino } });
const MB = 1048576;

export const REGRAS_PRONTAS: RegraPronta[] = [
  { chave: "grandes", titulo: "Itens grandes", descricao: "Arquivos de mais de 500 MB vão para “Arquivos grandes”.", regra: mover("Itens grandes (+500 MB)", "Arquivos grandes", { tamanho_min: 500 * MB }) },
  { chave: "capturas", titulo: "Capturas de tela", descricao: "Imagens com “captura” ou “screenshot” no nome vão para Imagens/Capturas de tela.", regra: mover("Capturas de tela", "Imagens/Capturas de tela", { categorias: ["imagens"], nome_contem: "captura" }) },
  { chave: "capturas_en", titulo: "Screenshots", descricao: "Imagens com “screenshot” no nome vão para Imagens/Capturas de tela.", regra: mover("Screenshots", "Imagens/Capturas de tela", { categorias: ["imagens"], nome_contem: "screenshot" }) },
  { chave: "fiscal", titulo: "Notas fiscais", descricao: "PDFs com “nota” no nome vão para a pasta Fiscal.", regra: mover("Notas fiscais", "Fiscal", { extensoes: ["pdf"], nome_contem: "nota" }) },
  { chave: "fotos", titulo: "Fotos e imagens", descricao: "Todas as imagens vão para a pasta Imagens.", regra: mover("Fotos e imagens", "Imagens", { categorias: ["imagens"] }) },
  { chave: "videos", titulo: "Vídeos", descricao: "Todos os vídeos vão para a pasta Vídeos.", regra: mover("Vídeos", "Vídeos", { categorias: ["videos"] }) },
  { chave: "musicas", titulo: "Músicas e áudios", descricao: "Músicas e áudios vão para a pasta Áudios.", regra: mover("Músicas e áudios", "Áudios", { categorias: ["audios"] }) },
  { chave: "documentos", titulo: "Documentos", descricao: "PDF, Word, textos e livros vão para a pasta Documentos.", regra: mover("Documentos", "Documentos", { categorias: ["documentos"] }) },
  { chave: "planilhas", titulo: "Planilhas", descricao: "Excel, CSV e similares vão para a pasta Planilhas.", regra: mover("Planilhas", "Planilhas", { categorias: ["planilhas"] }) },
  { chave: "apresentacoes", titulo: "Apresentações", descricao: "PowerPoint e similares vão para a pasta Apresentações.", regra: mover("Apresentações", "Apresentações", { categorias: ["apresentacoes"] }) },
  { chave: "compactados", titulo: "Compactados", descricao: "ZIP, RAR, 7z e similares vão para a pasta Compactados.", regra: mover("Compactados", "Compactados", { categorias: ["compactados"] }) },
  { chave: "instaladores", titulo: "Instaladores", descricao: "Programas e instaladores vão para a pasta Instaladores.", regra: mover("Instaladores", "Instaladores", { categorias: ["instaladores"] }) },
  { chave: "codigo", titulo: "Código e projetos", descricao: "Arquivos de programação vão para a pasta Código.", regra: mover("Código", "Código", { categorias: ["codigo"] }) },
  { chave: "velhos", titulo: "Parados há 6 meses", descricao: "O que não é mexido há 180 dias vai para a quarentena do Vindex (nada é apagado).", regra: { nome: "Parados há 6 meses", condicoes: { ...vazia, parado_dias_min: 180 }, acao: { tipo: "quarentena" } } }
];

export const PACOTES_PRONTOS: PacotePronto[] = [
  { chave: "downloads", titulo: "Downloads por categoria", descricao: "Separa tudo em pastas: Imagens, Vídeos, Áudios, Documentos, Planilhas, Apresentações, Compactados, Instaladores e Código.", chaves: ["capturas", "capturas_en", "fotos", "videos", "musicas", "documentos", "planilhas", "apresentacoes", "compactados", "instaladores", "codigo"] },
  { chave: "limpeza", titulo: "Faxina completa", descricao: "Itens grandes em uma pasta, notas fiscais separadas e o que está parado há 6 meses na quarentena.", chaves: ["grandes", "fiscal", "velhos"] }
];

export const regraDaPronta = (p: RegraPronta): Regra => ({ id: `pronta:${p.chave}`, ativa: true, ...p.regra });

/** Acrescenta (ou atualiza) as regras prontas, mantendo as que o usuário já tinha e a ordem: específicas antes das gerais. */
export function adicionarProntas(atuais: Regra[], chaves: string[]): Regra[] {
  const novas = chaves.map((k) => REGRAS_PRONTAS.find((p) => p.chave === k)).filter((p): p is RegraPronta => !!p).map(regraDaPronta);
  const ids = new Set(novas.map((r) => r.id));
  return [...atuais.filter((r) => !ids.has(r.id)), ...novas];
}
