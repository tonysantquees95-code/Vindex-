// Apps da Vetorial Tech: última versão publicada no GitHub de cada um (os repositórios são públicos).
export interface VersaoPublicada { numero: number; tag: string; url: string; sha256: string; tamanho: number }

/** "1.39" ou "v1.20" → 39 / 20; qualquer outra coisa → 0. */
export const numeroDaVersao = (texto: string): number => {
  const m = /^v?1\.(\d+)/.exec(String(texto ?? "").trim());
  return m ? Number(m[1]) : 0;
};

export type SituacaoApp = "instalar" | "atualizar" | "em-dia" | "sem-versao";

export function situacao(instalado: boolean, versaoInstalada: string, publicada: VersaoPublicada | null): SituacaoApp {
  if (!publicada) return "sem-versao";
  if (!instalado) return "instalar";
  const atual = numeroDaVersao(versaoInstalada);
  return atual > 0 && atual >= publicada.numero ? "em-dia" : "atualizar";
}

/** Só aceita o APK com SHA-256 publicado pelo GitHub e vindo da página de lançamentos do próprio repositório. */
export function versaoDoRelease(repo: string, o: unknown): VersaoPublicada | null {
  if (!o || typeof o !== "object") return null;
  const r = o as { tag_name?: string; assets?: { name?: string; size?: number; digest?: string; browser_download_url?: string }[] };
  const numero = numeroDaVersao(r.tag_name ?? "");
  const arq = (r.assets ?? []).find((a) => /\.apk$/i.test(a.name ?? ""));
  if (!numero || !arq) return null;
  const dig = String(arq.digest ?? "").toLowerCase();
  const sha256 = dig.startsWith("sha256:") ? dig.slice(7) : "";
  const url = String(arq.browser_download_url ?? "");
  if (!/^[0-9a-f]{64}$/.test(sha256) || !url.startsWith(`https://github.com/${repo}/releases/download/`)) return null;
  return { numero, tag: r.tag_name ?? "", url, sha256, tamanho: Number(arq.size) || 0 };
}

export async function ultimaVersao(repo: string): Promise<VersaoPublicada | null> {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) return null;
  return versaoDoRelease(repo, await r.json());
}
