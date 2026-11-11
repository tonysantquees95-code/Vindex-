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
