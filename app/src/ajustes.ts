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

export interface FormatoDeBotao { id: string; nome: string; raio: string }
export const FORMATOS: FormatoDeBotao[] = [
  { id: "redondo", nome: "Arredondado", raio: "0.75rem" },
  { id: "pilula", nome: "Pílula", raio: "9999px" },
  { id: "reto", nome: "Reto", raio: "0.3rem" },
];
export interface EstiloDeBotao { id: string; nome: string }
export const ESTILOS: EstiloDeBotao[] = [
  { id: "solido", nome: "Sólido" },
  { id: "degrade", nome: "Degradê" },
  { id: "contorno", nome: "Contorno" },
];

export const COR_PERSONALIZADA = "personalizada";
export interface Ajustes { cor: string; corPersonalizada: string; formato: string; estilo: string; icones: string; autoAtualizar: boolean; autoOrganizar: boolean }
export const AJUSTES_PADRAO: Ajustes = { cor: "ciano", corPersonalizada: "#22d3ee", formato: "redondo", estilo: "solido", icones: "padrao", autoAtualizar: true, autoOrganizar: true };

export const hexValido = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** #rrggbb → [matiz 0-360, saturação 0-1, luz 0-1] */
export function hexParaHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslParaHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const p = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** Cor secundária de uma cor escolhida: mesma saturação, matiz deslocado (como o "par" da Vênus). Luz mínima para ler no fundo escuro. */
export function parDaCor(hex: string): string {
  const [h, s, l] = hexParaHsl(hex);
  return hslParaHex(h + 55, Math.max(s, 0.5), Math.min(Math.max(l, 0.55), 0.75));
}

/** Garante que uma cor escolhida aparece no fundo escuro do app (não deixa escolher quase preto). */
export function corLegivel(hex: string): string {
  const [h, s, l] = hexParaHsl(hex);
  return l < 0.5 ? hslParaHex(h, s, 0.5) : hex;
}

export function corDoTema(a: Ajustes): { destaque: string; secundaria: string } {
  if (a.cor === COR_PERSONALIZADA) { const d = corLegivel(a.corPersonalizada); return { destaque: d, secundaria: parDaCor(d) }; }
  const c = CORES.find((x) => x.id === a.cor) ?? CORES[0]!;
  return { destaque: c.destaque, secundaria: c.secundaria };
}

/** Aceita qualquer coisa vinda do disco e devolve ajustes válidos. */
export function limparAjustes(v: unknown): Ajustes {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    cor: CORES.some((c) => c.id === o.cor) || o.cor === COR_PERSONALIZADA ? (o.cor as string) : AJUSTES_PADRAO.cor,
    corPersonalizada: hexValido(o.corPersonalizada) ? o.corPersonalizada.toLowerCase() : AJUSTES_PADRAO.corPersonalizada,
    formato: FORMATOS.some((f) => f.id === o.formato) ? (o.formato as string) : AJUSTES_PADRAO.formato,
    estilo: ESTILOS.some((e) => e.id === o.estilo) ? (o.estilo as string) : AJUSTES_PADRAO.estilo,
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
  const cor = corDoTema(a);
  const fm = FORMATOS.find((f) => f.id === a.formato) ?? FORMATOS[0]!;
  const ic = ICONES.find((i) => i.id === a.icones) ?? ICONES[0]!;
  raiz.style.setProperty("--color-neon", cor.destaque);
  raiz.style.setProperty("--color-magenta", cor.secundaria);
  raiz.style.setProperty("--raio-botao", fm.raio);
  raiz.dataset.botoes = a.estilo;
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
