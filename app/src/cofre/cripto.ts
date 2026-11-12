// Cofre pessoal: toda a criptografia roda no aparelho (WebCrypto). O servidor só recebe o pacote já cifrado.
//   senha do cofre ──PBKDF2──► chave que abre a "chave dos dados" (DEK, 256 bits, sorteada)
//   código de recuperação ──PBKDF2──► outra chave que também abre a mesma DEK
//   DEK ──AES-GCM──► a lista de itens
// Trocar a senha só reembrulha a DEK (os itens não mudam), e a digital guarda a DEK no Keystore do Android.

export type TipoDeItem = "senha" | "cartao" | "nota" | "chave";
export interface Item {
  id: string; tipo: TipoDeItem; titulo: string; usuario: string; segredo: string; url: string; notas: string;
  atualizado: number; apagado?: boolean;
}
export interface Embrulho { iv: string; ct: string }
export interface Pacote {
  v: 1;
  senha: Embrulho & { sal: string; iter: number };
  recup: Embrulho & { sal: string; iter: number };
  dados: Embrulho;
}
export interface Aberto { dek: Uint8Array; itens: Item[] }
export interface Opcoes { iter?: number }

export const ITER_SENHA = 600_000;
export const ITER_RECUP = 100_000; // o código de recuperação já tem 130 bits: não precisa de tantas voltas
const CONTEXTO = new TextEncoder().encode("vindex-cofre-v1");
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // base32 sem I, L, O, U
const TEMPO_DE_LAPIDE = 90 * 24 * 3600_000;

export class ErroDoCofre extends Error {
  codigo: "senha" | "recuperacao" | "pacote" | "chave";
  constructor(mensagem: string, codigo: "senha" | "recuperacao" | "pacote" | "chave") { super(mensagem); this.codigo = codigo; }
}

// ---------------------------------------------------------------- base64
export const paraB64 = (b: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
export const deB64 = (t: string): Uint8Array => {
  const s = atob(t);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
};
const sortear = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// ---------------------------------------------------------------- primitivas
async function derivar(segredo: string, sal: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: buf(sal), iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const chaveDe = (raw: Uint8Array) => crypto.subtle.importKey("raw", buf(raw), "AES-GCM", false, ["encrypt", "decrypt"]);

async function cifrar(chave: CryptoKey, dados: Uint8Array): Promise<Embrulho> {
  const iv = sortear(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(CONTEXTO) }, chave, buf(dados)));
  return { iv: paraB64(iv), ct: paraB64(ct) };
}
async function decifrar(chave: CryptoKey, e: Embrulho): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(deB64(e.iv)), additionalData: buf(CONTEXTO) }, chave, buf(deB64(e.ct))));
}

// ---------------------------------------------------------------- código de recuperação
/** 26 letras/números (130 bits) em grupos de 5, para a pessoa anotar. */
export function novoCodigoDeRecuperacao(): string {
  const b = sortear(26);
  let s = "";
  for (const x of b) s += ALFABETO[x & 31];
  return s.match(/.{1,5}/g)!.join("-");
}
/** Aceita minúsculas, espaços e os enganos comuns (O→0, I/L→1). */
export function normalizarCodigo(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

// ---------------------------------------------------------------- itens
export function novoItem(tipo: TipoDeItem = "senha"): Item {
  return { id: paraB64(sortear(9)).replace(/[+/=]/g, "x"), tipo, titulo: "", usuario: "", segredo: "", url: "", notas: "", atualizado: Date.now() };
}

/** Junta duas listas (a do aparelho e a da nuvem): vale o item mais recente de cada id; itens apagados viram "lápide". */
export function juntar(a: Item[], b: Item[], agora = Date.now()): Item[] {
  const mapa = new Map<string, Item>();
  for (const i of [...a, ...b]) {
    const atual = mapa.get(i.id);
    if (!atual || i.atualizado > atual.atualizado) mapa.set(i.id, i);
  }
  return [...mapa.values()].filter((i) => !(i.apagado && agora - i.atualizado > TEMPO_DE_LAPIDE));
}
export const visiveis = (l: Item[]): Item[] => l.filter((i) => !i.apagado);

const lerItens = (b: Uint8Array): Item[] => {
  const j = JSON.parse(new TextDecoder().decode(b)) as { itens?: Item[] };
  if (!Array.isArray(j.itens)) throw new ErroDoCofre("O cofre está num formato que não conheço.", "pacote");
  return j.itens;
};
const sobItens = (itens: Item[]): Uint8Array => new TextEncoder().encode(JSON.stringify({ itens }));

// ---------------------------------------------------------------- criar, abrir, salvar
export async function criarCofre(senha: string, op: Opcoes = {}): Promise<{ pacote: Pacote; aberto: Aberto; codigo: string }> {
  const dek = sortear(32);
  const codigo = novoCodigoDeRecuperacao();
  const pacote = await montar(dek, [], senha, codigo, op);
  return { pacote, aberto: { dek, itens: [] }, codigo };
}

async function montar(dek: Uint8Array, itens: Item[], senha: string, codigo: string, op: Opcoes): Promise<Pacote> {
  const salS = sortear(16), salR = sortear(16);
  const iterS = op.iter ?? ITER_SENHA, iterR = op.iter ?? ITER_RECUP;
  const kS = await derivar(senha, salS, iterS), kR = await derivar(normalizarCodigo(codigo), salR, iterR);
  return {
    v: 1,
    senha: { sal: paraB64(salS), iter: iterS, ...(await cifrar(kS, dek)) },
    recup: { sal: paraB64(salR), iter: iterR, ...(await cifrar(kR, dek)) },
    dados: await cifrar(await chaveDe(dek), sobItens(itens)),
  };
}

async function abrirCom(p: Pacote, dek: Uint8Array): Promise<Aberto> {
  try { return { dek, itens: lerItens(await decifrar(await chaveDe(dek), p.dados)) }; }
  catch (e) { if (e instanceof ErroDoCofre) throw e; throw new ErroDoCofre("Não consegui abrir os dados do cofre.", "pacote"); }
}

export async function abrirComSenha(p: Pacote, senha: string): Promise<Aberto> {
  validar(p);
  let dek: Uint8Array;
  try { dek = await decifrar(await derivar(senha, deB64(p.senha.sal), p.senha.iter), p.senha); }
  catch { throw new ErroDoCofre("Senha do cofre incorreta.", "senha"); }
  return abrirCom(p, dek);
}
export async function abrirComRecuperacao(p: Pacote, codigo: string): Promise<Aberto> {
  validar(p);
  let dek: Uint8Array;
  try { dek = await decifrar(await derivar(normalizarCodigo(codigo), deB64(p.recup.sal), p.recup.iter), p.recup); }
  catch { throw new ErroDoCofre("Código de recuperação incorreto.", "recuperacao"); }
  return abrirCom(p, dek);
}
/** Abre com a chave guardada no aparelho (digital, rosto ou padrão). */
export async function abrirComChave(p: Pacote, dek: Uint8Array): Promise<Aberto> {
  validar(p);
  try { return await abrirCom(p, dek); } catch { throw new ErroDoCofre("A chave deste aparelho não abre mais o cofre. Entre com a senha.", "chave"); }
}

/** Gera o pacote novo com os itens atuais (mesma DEK, mesmos embrulhos). */
export async function salvarItens(p: Pacote, dek: Uint8Array, itens: Item[]): Promise<Pacote> {
  return { ...p, dados: await cifrar(await chaveDe(dek), sobItens(itens)) };
}
export async function trocarSenha(p: Pacote, dek: Uint8Array, nova: string, op: Opcoes = {}): Promise<Pacote> {
  const sal = sortear(16), iter = op.iter ?? ITER_SENHA;
  return { ...p, senha: { sal: paraB64(sal), iter, ...(await cifrar(await derivar(nova, sal, iter), dek)) } };
}
/** Troca o código de recuperação (o antigo deixa de funcionar). */
export async function novaRecuperacao(p: Pacote, dek: Uint8Array, op: Opcoes = {}): Promise<{ pacote: Pacote; codigo: string }> {
  const codigo = novoCodigoDeRecuperacao(), sal = sortear(16), iter = op.iter ?? ITER_RECUP;
  return { pacote: { ...p, recup: { sal: paraB64(sal), iter, ...(await cifrar(await derivar(normalizarCodigo(codigo), sal, iter), dek)) } }, codigo };
}

function validar(p: Pacote): void {
  if (!p || p.v !== 1 || !p.senha?.sal || !p.recup?.sal || !p.dados?.ct) throw new ErroDoCofre("O pacote do cofre está incompleto ou é de uma versão mais nova do Vindex.", "pacote");
  if (!(p.senha.iter >= 1000) || !(p.recup.iter >= 1000)) throw new ErroDoCofre("O pacote do cofre tem parâmetros inválidos.", "pacote");
}

// ---------------------------------------------------------------- texto que vai ao servidor
export const empacotar = (p: Pacote): string => btoa(JSON.stringify(p));
export function desempacotar(t: string): Pacote {
  try { return JSON.parse(atob(t)) as Pacote; } catch { throw new ErroDoCofre("O pacote do cofre está corrompido.", "pacote"); }
}

// ---------------------------------------------------------------- gerador de senhas
export interface OpcoesDeSenha { tamanho: number; maiusculas: boolean; numeros: boolean; simbolos: boolean }
export function gerarSenha(o: OpcoesDeSenha = { tamanho: 20, maiusculas: true, numeros: true, simbolos: true }): string {
  const grupos = ["abcdefghijkmnpqrstuvwxyz"];
  if (o.maiusculas) grupos.push("ABCDEFGHJKLMNPQRSTUVWXYZ");
  if (o.numeros) grupos.push("23456789");
  if (o.simbolos) grupos.push("!@#$%&*?-_+=");
  const tamanho = Math.min(64, Math.max(8, Math.floor(o.tamanho)));
  const todos = grupos.join("");
  const sorteio = (n: number): number => {
    const limite = Math.floor(0x1_0000_0000 / n) * n; // sem viés
    for (;;) { const x = crypto.getRandomValues(new Uint32Array(1))[0]!; if (x < limite) return x % n; }
  };
  const saida = grupos.map((g) => g[sorteio(g.length)]!); // pelo menos um de cada grupo
  while (saida.length < tamanho) saida.push(todos[sorteio(todos.length)]!);
  for (let i = saida.length - 1; i > 0; i--) { const j = sorteio(i + 1); [saida[i], saida[j]] = [saida[j]!, saida[i]!]; }
  return saida.join("");
}

/** 0 a 4: comprimento e variedade (só para orientar; a segurança real vem de a senha ser longa). */
export function forcaDaSenha(s: string): 0 | 1 | 2 | 3 | 4 {
  if (s.length < 8) return 0;
  const tipos = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(s)).length;
  const pontos = (s.length >= 12 ? 1 : 0) + (s.length >= 16 ? 1 : 0) + (tipos >= 3 ? 1 : 0) + (tipos >= 2 ? 1 : 0);
  return Math.min(4, pontos) as 0 | 1 | 2 | 3 | 4;
}
