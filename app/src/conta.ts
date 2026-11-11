// Vetorial ID: login único (o mesmo da Vênus), licença e limite de aparelhos vêm do servidor.
export const SERVIDOR = "https://venus-servidor.tonysantquees95.workers.dev";

export interface Licenca { acesso: boolean; apps?: { vindex?: boolean; vortex?: boolean }; pacote?: string; fimDoTeste?: number; renovar?: boolean; emTeste?: boolean; diasDeTesteRestantes?: number; diasPagosRestantes?: number; plano?: string }
export interface Sessao { token: string; email: string; nome: string; licenca: Licenca }
export const SITE_DA_CONTA = `${SERVIDOR}/conta.html`;
export interface Aparelho { id: string; nome: string; plataforma: string }
export type ErroDeLimite = { tipo: "sessoes"; itens: { id: string; titulo: string }[] } | { tipo: "aparelhos"; itens: { id: string; titulo: string }[] };

export class ErroConta extends Error {
  constructor(mensagem: string, public codigo = "", public limite: ErroDeLimite | null = null, public status = 0) { super(mensagem); }
}

const CHAVE_SESSAO = "vindex.sessao";
const CHAVE_APARELHO = "vindex.aparelho";

export function aparelhoLocal(plataforma: string): Aparelho {
  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE_APARELHO) ?? "null") as Aparelho | null;
    if (guardado?.id) return guardado;
  } catch { /* sem armazenamento */ }
  const id = `vindex-${plataforma}-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const nome = plataforma === "android" ? "Celular (Vindex)" : "Computador (Vindex)";
  const a = { id, nome, plataforma: plataforma === "demonstracao" ? "web" : plataforma };
  try { localStorage.setItem(CHAVE_APARELHO, JSON.stringify(a)); } catch { /* ok */ }
  return a;
}

export function sessaoGuardada(): Sessao | null {
  try { const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) ?? "null") as Sessao | null; return s?.token ? s : null; } catch { return null; }
}
export function guardarSessao(s: Sessao | null): void {
  try { if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); else localStorage.removeItem(CHAVE_SESSAO); } catch { /* ok */ }
}

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown, token?: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${SERVIDOR}${caminho}`, { method: metodo, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch {
    throw new ErroConta("Sem conexão com o servidor. Confira a internet.");
  }
  const d = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (!r.ok) {
    let limite: ErroDeLimite | null = null;
    if (d.codigo === "limite_simultaneo") limite = { tipo: "sessoes", itens: (d.ativas ?? []).map((a: any) => ({ id: a.sessao, titulo: `${a.nome} (${a.plataforma})` })) };
    if (d.codigo === "limite_dispositivos") limite = { tipo: "aparelhos", itens: (d.dispositivos ?? []).map((x: any) => ({ id: x.id, titulo: `${x.nome} (${x.plataforma})` })) };
    throw new ErroConta(d.error || `Erro ${r.status}`, d.codigo || "", limite, r.status);
  }
  return d as T;
}

export async function entrar(email: string, senha: string, aparelho: Aparelho, extra: { encerrar?: string; remover?: string } = {}): Promise<Sessao> {
  const r = await chamar<{ token: string; usuario: { email: string; nome?: string } }>("POST", "/id/entrar", { email, senha, dispositivo: aparelho, ...extra });
  const v = await verificar(r.token);
  return { token: r.token, email: r.usuario.email, nome: r.usuario.nome ?? "", licenca: v };
}

/** Confere o login e a licença no servidor (também renova o que for preciso). */
export async function verificar(token: string): Promise<Licenca> {
  const r = await chamar<{ licenca: Licenca }>("GET", "/id/verificar", undefined, token);
  return r.licenca;
}

export async function sair(token: string): Promise<void> {
  try { await chamar("POST", "/id/sair", {}, token); } catch { /* já saiu */ }
}

// ------------------------------------------------------------------ ponte da Vênus
export interface Pedido { id: string; comando: "otimizar" | "diagnostico" }
export const buscarPedidos = (token: string, plataforma: string) => chamar<{ pedidos: Pedido[] }>("GET", `/vindex/fila?plataforma=${plataforma === "android" ? "android" : "windows"}`, undefined, token).then((r) => r.pedidos);
export const responderPedido = (token: string, id: string, corpo: { ok: boolean; resumo: string; dados?: unknown }) => chamar("POST", `/vindex/pedidos/${id}/resultado`, corpo, token);
