// Ajustes do Vindex (cores, ícones, atualização e organização automática). Mesma ideia da Vênus: personalizar sem perder a identidade.
export interface CorDoTema { id: string; nome: string; destaque: string; secundaria: string }
export const CORES: CorDoTema[] = [
  { id: "ciano", nome: "Ciano neon", destaque: "#22d3ee", secundaria: "#e879f9" },
  { id: "violeta", nome: "Violeta", destaque: "#a78bfa", secundaria: "#22d3ee" },
  { id: "rosa", nome: "Rosa Vênus", destaque: "#f472b6", secundaria: "#a78bfa" },
  { id: "verde", nome: "Verde", destaque: "#34d399", secundaria: "#22d3ee" },
  { id: "ambar", nome: "Âmbar", destaque: "#fbbf24", secundaria: "#f472b6" },
  { id: "azul", nome: "Azul", destaque: "#60a5fa", secundaria: "#34d399" },
];

export interface PacoteDeIcones { id: string; nome: string; traco: number; ponta: "round" | "butt" | "square"; junta: "round" | "miter"; preench: number }
export const ICONES: PacoteDeIcones[] = [
  { id: "padrao", nome: "Padrão", traco: 1.7, ponta: "round", junta: "round", preench: 0 },
  { id: "fino", nome: "Fino", traco: 1.2, ponta: "round", junta: "round", preench: 0 },
  { id: "grosso", nome: "Grosso", traco: 2.3, ponta: "round", junta: "round", preench: 0 },
  { id: "reto", nome: "Reto", traco: 1.9, ponta: "butt", junta: "miter", preench: 0 },
  { id: "cheio", nome: "Suave cheio", traco: 1.6, ponta: "round", junta: "round", preench: 0.22 },
];

export interface Ajustes { cor: string; icones: string; autoAtualizar: boolean; autoOrganizar: boolean }
export const AJUSTES_PADRAO: Ajustes = { cor: "ciano", icones: "padrao", autoAtualizar: true, autoOrganizar: true };

/** Aceita qualquer coisa vinda do disco e devolve ajustes válidos. */
export function limparAjustes(v: unknown): Ajustes {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    cor: CORES.some((c) => c.id === o.cor) ? (o.cor as string) : AJUSTES_PADRAO.cor,
    icones: ICONES.some((i) => i.id === o.icones) ? (o.icones as string) : AJUSTES_PADRAO.icones,
    autoAtualizar: typeof o.autoAtualizar === "boolean" ? o.autoAtualizar : AJUSTES_PADRAO.autoAtualizar,
    autoOrganizar: typeof o.autoOrganizar === "boolean" ? o.autoOrganizar : AJUSTES_PADRAO.autoOrganizar,
  };
}

const CHAVE = "vindex.ajustes";
let atual: Ajustes = ler();
const ouvintes = new Set<() => void>();

function ler(): Ajustes {
  try { return limparAjustes(JSON.parse(localStorage.getItem(CHAVE) ?? "null")); } catch { return { ...AJUSTES_PADRAO }; }
}

/** Escreve as cores e o traço dos ícones nas variáveis CSS do app inteiro. */
export function aplicarTema(a: Ajustes, raiz: HTMLElement = document.documentElement) {
  const cor = CORES.find((c) => c.id === a.cor) ?? CORES[0]!;
  const ic = ICONES.find((i) => i.id === a.icones) ?? ICONES[0]!;
  raiz.style.setProperty("--color-neon", cor.destaque);
  raiz.style.setProperty("--color-magenta", cor.secundaria);
  raiz.style.setProperty("--icone-traco", String(ic.traco));
  raiz.style.setProperty("--icone-ponta", ic.ponta);
  raiz.style.setProperty("--icone-junta", ic.junta);
  raiz.style.setProperty("--icone-preench", String(ic.preench));
}

export function iniciarTema() { try { aplicarTema(atual); } catch { /* sem DOM */ } }

export function definirAjustes(parcial: Partial<Ajustes>) {
  atual = limparAjustes({ ...atual, ...parcial });
  try { localStorage.setItem(CHAVE, JSON.stringify(atual)); } catch { /* sem armazenamento */ }
  try { aplicarTema(atual); } catch { /* ok */ }
  ouvintes.forEach((f) => f());
}

export const ajustesAtuais = () => atual;

/** Para o hook do React (usarAjustes.ts). */
export function assinar(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
