import type { ProgramaInstalado } from "./ponte/tipos";

export type Ordem = "nome" | "tamanho" | "data";

/** Filtra e ordena a lista (puro, para testar sem tela). */
export function organizarProgramas(lista: ProgramaInstalado[], busca: string, ordem: Ordem): ProgramaInstalado[] {
  const q = busca.trim().toLowerCase();
  const f = q ? lista.filter((p) => p.nome.toLowerCase().includes(q) || p.editora.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : lista.slice();
  const nome = (a: ProgramaInstalado, b: ProgramaInstalado) => a.nome.toLowerCase().localeCompare(b.nome.toLowerCase());
  if (ordem === "tamanho") return f.sort((a, b) => b.bytes - a.bytes || nome(a, b));
  if (ordem === "data") return f.sort((a, b) => b.instaladoEm.localeCompare(a.instaladoEm) || nome(a, b));
  return f.sort(nome);
}

