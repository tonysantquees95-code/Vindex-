// Alerta de app novo e relatório da semana: tudo guardado só neste aparelho.
import type { AppInstalado } from "./ponte";

const VISTOS = "vindex.apps.vistos";
const RELATORIO = "vindex.relatorio";
export const SEMANA = 7 * 24 * 3_600_000;

export interface Relatorio { quando: number; analisados: number; achados: number; graves: number; novos: string[]; foraDaLoja: number }

const ler = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

/** Apps que apareceram desde a última conferência. Na primeira vez só guarda a lista (nada de alarme). */
export function novosApps(atuais: AppInstalado[], vistos: string[] | null): AppInstalado[] {
  if (!vistos) return [];
  const antes = new Set(vistos);
  return atuais.filter((a) => !antes.has(a.pacote));
}

export function conferirNovos(atuais: AppInstalado[]): AppInstalado[] {
  const v = ler(VISTOS);
  const vistos = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  const novos = novosApps(atuais, vistos);
  gravar(VISTOS, atuais.map((a) => a.pacote));
  return novos;
}

export const relatorioSalvo = (): Relatorio | null => {
  const r = ler(RELATORIO) as Partial<Relatorio> | null;
  if (!r || typeof r.quando !== "number") return null;
  return { quando: r.quando, analisados: Number(r.analisados) || 0, achados: Number(r.achados) || 0, graves: Number(r.graves) || 0, novos: Array.isArray(r.novos) ? r.novos.map(String) : [], foraDaLoja: Number(r.foraDaLoja) || 0 };
};
export const salvarRelatorio = (r: Relatorio) => gravar(RELATORIO, r);
export const relatorioVencido = (r: Relatorio | null, agora: number): boolean => !r || agora - r.quando >= SEMANA || agora < r.quando;
