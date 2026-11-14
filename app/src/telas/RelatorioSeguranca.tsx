import { useState } from "react";
import { useMotor } from "../estado";
import type { Motor } from "../ponte";
import { relatorioSalvo, salvarRelatorio, type Relatorio } from "../relatorio";
import { Aviso, Botao, Cartao } from "../ui";

/** Roda a verificação dos apps instalados e guarda o resumo (usado pelo botão e pelo ciclo semanal do app). */
export async function gerarRelatorio(motor: Motor, novos: string[] = []): Promise<Relatorio> {
  const [verif, apps] = await Promise.all([motor.verificarApps(), motor.appsInstalados().catch(() => [])]);
  const r: Relatorio = {
    quando: Date.now(), analisados: verif.analisados, achados: verif.achados.length,
    graves: verif.achados.filter((a) => a.nivel === "alto").length, novos, foraDaLoja: apps.filter((a) => a.foraDaLoja).length,
  };
  salvarRelatorio(r);
  return r;
}

export function RelatorioSeguranca() {
  const motor = useMotor();
  const [r, setR] = useState<Relatorio | null>(() => relatorioSalvo());
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  async function gerar() {
    setOcupado(true); setErro("");
    try { setR(await gerarRelatorio(motor, r?.novos ?? [])); } catch (e) { setErro(typeof e === "string" ? e : e instanceof Error ? e.message : "Não deu certo."); } finally { setOcupado(false); }
  }
  return (
    <Cartao titulo="Relatório da semana">
      <p className="mb-3 text-sm text-suave">Uma vez por semana o Vindex confere os apps do aparelho e guarda um resumo. Também avisa quando aparece um app novo instalado fora da loja.</p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {r ? (
        <ul className="space-y-1 text-sm">
          <li>Última conferência: {new Date(r.quando).toLocaleString("pt-BR")}</li>
          <li>{r.analisados} apps analisados · {r.achados === 0 ? <span className="text-ok">nada suspeito</span> : <span className="text-aviso">{r.achados} para olhar{r.graves ? ` (${r.graves} grave${r.graves > 1 ? "s" : ""})` : ""}</span>}</li>
          <li>{r.foraDaLoja} app{r.foraDaLoja === 1 ? "" : "s"} instalado{r.foraDaLoja === 1 ? "" : "s"} fora da loja</li>
          {r.novos.length > 0 && <li className="text-aviso">Apareceram desde a última vez: {r.novos.join(", ")}</li>}
        </ul>
      ) : <p className="text-sm text-suave">Ainda não há relatório.</p>}
      <Botao className="mt-3" disabled={ocupado} onClick={() => void gerar()}>{ocupado ? "Conferindo…" : "Gerar agora"}</Botao>
    </Cartao>
  );
}
