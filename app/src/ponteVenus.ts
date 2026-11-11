import type { Motor } from "./ponte";
import { bytes } from "./formato";

/** Executa um pedido da Vênus com o motor local e devolve o texto que a Vênus lê em voz alta. */
export async function executarPedido(motor: Motor, comando: "otimizar" | "diagnostico"): Promise<{ ok: boolean; resumo: string; dados?: unknown }> {
  if (comando === "diagnostico") {
    const d = await motor.diagnostico(3);
    const disco = d.discos[0];
    return {
      ok: true,
      resumo: `${d.maquina || "o aparelho"}: CPU em ${Math.round(d.cpu_uso)}%, RAM em ${Math.round(d.memoria.percentual)}% (${bytes(d.memoria.usada)} de ${bytes(d.memoria.total)})` +
        (d.temperatura_max != null ? `, ${Math.round(d.temperatura_max)} graus` : "") + (disco ? `, disco ${Math.round(disco.percentual_usado)}% cheio` : "") + ".",
      dados: { cpu: d.cpu_uso, ram: d.memoria.percentual, disco: disco?.percentual_usado ?? null }
    };
  }
  const r = await motor.otimizarTudo(false);
  const partes = [`${r.limpeza.apagados} arquivos temporários removidos, ${bytes(r.limpeza.liberado_bytes)} liberados`];
  if (r.memoria.suportado) partes.push(`RAM de ${Math.round(r.ram_antes)}% para ${Math.round(r.ram_depois)}%`);
  return { ok: true, resumo: partes.join("; ") + ".", dados: { apagados: r.limpeza.apagados, liberado: r.limpeza.liberado_bytes } };
}
