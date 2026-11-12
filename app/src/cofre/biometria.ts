// Ponte com o Android: abrir o cofre com digital, rosto, PIN ou padrão. Fora do Android tudo responde "indisponível".
import { Capacitor } from "@capacitor/core";
import { deB64, paraB64 } from "./cripto";

export interface EstadoBio { disponivel: boolean; ativo: boolean }
export class ErroBio extends Error {
  codigo: string;
  constructor(mensagem: string, codigo: string) { super(mensagem); this.codigo = codigo; }
}

const noAndroid = (): boolean => { try { return Capacitor.getPlatform() === "android"; } catch { return false; } };
async function plugin() { return (await import("../ponte/android")).Vindex; }

function traduzir(e: unknown): ErroBio {
  const x = e as { code?: string; message?: string };
  return new ErroBio(x?.message || "Não consegui usar a digital.", x?.code || "erro");
}

export async function estadoBio(conta: string): Promise<EstadoBio> {
  if (!noAndroid()) return { disponivel: false, ativo: false };
  const semBio: EstadoBio = { disponivel: false, ativo: false };
  try {
    // se a ponte do Android não responder, o cofre abre sem digital em vez de ficar esperando
    return await Promise.race([(await plugin()).cofreBioEstado({ conta }), new Promise<EstadoBio>((ok) => setTimeout(() => ok(semBio), 4000))]);
  } catch { return semBio; }
}
/** Pede a identificação do celular e guarda a chave do cofre protegida por ela. */
export async function ativarBio(conta: string, dek: Uint8Array): Promise<void> {
  if (!noAndroid()) throw new ErroBio("A digital só funciona no Android.", "indisponivel");
  try { await (await plugin()).cofreBioGuardar({ conta, segredo: paraB64(dek) }); } catch (e) { throw traduzir(e); }
}
/** Pede a identificação do celular e devolve a chave do cofre. */
export async function abrirComBio(conta: string): Promise<Uint8Array> {
  if (!noAndroid()) throw new ErroBio("A digital só funciona no Android.", "indisponivel");
  try { return deB64((await (await plugin()).cofreBioAbrir({ conta })).valor); } catch (e) { throw traduzir(e); }
}
export async function desativarBio(conta: string): Promise<void> {
  if (!noAndroid()) return;
  try { await (await plugin()).cofreBioApagar({ conta }); } catch { /* ok */ }
}
/** Bloqueia captura de tela enquanto o cofre está aberto (só Android). */
export async function protegerTela(ligado: boolean): Promise<void> {
  if (!noAndroid()) return;
  try { await (await plugin()).cofreProteger({ ligado }); } catch { /* ok */ }
}
