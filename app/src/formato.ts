export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
export function tempoLigado(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`;
}
/** verde até 60, amarelo até 85, vermelho acima */
export function tomDoUso(p: number): "ok" | "aviso" | "erro" {
  return p >= 85 ? "erro" : p >= 60 ? "aviso" : "ok";
}
export function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).filter(Boolean).pop() ?? caminho;
}
export function pastaDoArquivo(caminho: string): string {
  const p = caminho.split(/[\\/]/);
  p.pop();
  return p.join(caminho.includes("\\") ? "\\" : "/");
}
/** Mantém só as últimas `max` leituras (histórico dos gráficos). */
export function acrescentar<T>(lista: T[], valor: T, max = 60): T[] {
  const v = [...lista, valor];
  return v.length > max ? v.slice(v.length - max) : v;
}
