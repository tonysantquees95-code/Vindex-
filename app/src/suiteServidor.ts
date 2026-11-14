// Última versão de cada app da suíte, pelo servidor da Vênus (com o GitHub como plano B).

import { SERVIDOR } from "./conta";
import { versaoValida } from "./atualizacao";
import { ultimaVersao, type VersaoPublicada } from "./suite";

const APP_NO_SERVIDOR: Record<string, string> = {
  "tech.vetorial.vindex": "vindex-android", "tech.vetorial.vortex": "vortex-android", "tech.vetorial.velox": "velox-android", "com.tonimarques.sextafeira": "venus",
};

/** Pergunta primeiro ao servidor da Vênus (guarda cópia e serve a Vênus, que é privada); os públicos têm o GitHub como plano B. */
export async function versaoDaSuite(pacote: string, repo: string): Promise<VersaoPublicada | null> {
  const id = APP_NO_SERVIDOR[pacote];
  if (id) {
    try {
      const r = await fetch(`${SERVIDOR}/atualizacao?app=${id}`, { cache: "no-store" });
      if (r.ok) { const v = versaoValida(await r.json()); if (v && v.sha256) return v; }
    } catch { /* cai para o GitHub */ }
  }
  if (pacote === "com.tonimarques.sextafeira") return null;
  return ultimaVersao(repo).catch(() => null);
}
