import { useCallback, useEffect, useRef, useState } from "react";
import { useMotor } from "../estado";
import { acrescentar, bytes, tempoLigado } from "../formato";
import type { Diagnostico, ResultadoOtimizacao } from "../ponte";
import { Aviso, Barra, Botao, Cartao, Grafico, Velocimetro } from "../ui";

export function Painel() {
  const motor = useMotor();
  const [d, setD] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState("");
  const [hist, setHist] = useState<{ cpu: number[]; ram: number[] }>({ cpu: [], ram: [] });
  const [otimizando, setOtimizando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoOtimizacao | null>(null);
  const vivo = useRef(true);

  const ler = useCallback(async () => {
    try {
      const x = await motor.diagnostico(8);
      if (!vivo.current) return;
      setD(x);
      setErro("");
      setHist((h) => ({ cpu: acrescentar(h.cpu, x.cpu_uso), ram: acrescentar(h.ram, x.memoria.percentual) }));
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error ? e.message : String(e));
    }
  }, [motor]);

  useEffect(() => {
    vivo.current = true;
    void ler();
    const t = setInterval(() => void ler(), 2000);
    return () => { vivo.current = false; clearInterval(t); };
  }, [ler]);

  async function otimizar() {
    setOtimizando(true);
    setResultado(null);
    try { setResultado(await motor.otimizarTudo(false)); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    setOtimizando(false);
    void ler();
  }

  if (!d) return <div className="py-16 text-center text-suave">{erro || "Lendo o seu aparelho…"}</div>;
  const disco = d.discos[0];
  return (
    <div className="space-y-4">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao className="text-center">
        <p className="text-sm text-suave">{d.maquina || "Este aparelho"} · {d.sistema} · ligado há {tempoLigado(d.ligado_ha_s)}</p>
        <Botao variante="primario" disabled={otimizando} onClick={otimizar} className="brilho mx-auto mt-4 !min-h-16 w-full max-w-sm text-base" aria-label="Otimização com 1 clique">
          {otimizando ? "Otimizando…" : "⚡ Otimizar com 1 clique"}
        </Botao>
        {resultado && (
          <div className="mt-3"><Aviso tom="ok">
            {resultado.limpeza.apagados} arquivos removidos ({bytes(resultado.limpeza.liberado_bytes)} liberados). RAM {Math.round(resultado.ram_antes)}% → {Math.round(resultado.ram_depois)}%. {resultado.memoria.nota}
            {resultado.limpeza.falhas.length > 0 && ` ${resultado.limpeza.falhas.length} itens em uso foram pulados.`}
          </Aviso></div>
        )}
      </Cartao>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao><Velocimetro valor={d.cpu_uso} rotulo="CPU" detalhe={`${d.cpu_nucleos} núcleos`} /></Cartao>
        <Cartao><Velocimetro valor={d.memoria.percentual} rotulo="RAM" detalhe={`${bytes(d.memoria.usada)} de ${bytes(d.memoria.total)}`} /></Cartao>
        <Cartao>{d.temperatura_max != null ? <Velocimetro valor={d.temperatura_max} rotulo="Temperatura" unidade="°C" detalhe="sensor mais quente" /> : <p className="py-10 text-center text-sm text-suave">Sem sensor de temperatura neste aparelho.</p>}</Cartao>
        <Cartao>{disco ? <Velocimetro valor={disco.percentual_usado} rotulo={`Disco ${disco.ponto}`} detalhe={`${disco.tipo} · ${bytes(disco.livre)} livres`} /> : <p className="py-10 text-center text-sm text-suave">Sem disco lido.</p>}</Cartao>
      </div>

      <Cartao titulo="Consumo em tempo real"><Grafico series={[{ nome: "CPU", cor: "#22d3ee", valores: hist.cpu }, { nome: "RAM", cor: "#e879f9", valores: hist.ram }]} /></Cartao>

      <div className="grid gap-3 md:grid-cols-2">
        <Cartao titulo="Quem mais consome">
          <ul className="space-y-2">{d.processos.map((p) => (
            <li key={p.pid} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{p.nome}</span><span className="num flex-none text-xs text-suave">{p.cpu.toFixed(0)}% CPU · {bytes(p.memoria)}</span></li>
          ))}</ul>
        </Cartao>
        <Cartao titulo="Armazenamento e bateria">
          <ul className="space-y-3">
            {d.discos.map((x) => (
              <li key={x.ponto}><div className="mb-1 flex justify-between text-sm"><span>{x.ponto} · {x.tipo}</span><span className="num text-xs text-suave">{bytes(x.total - x.livre)} / {bytes(x.total)} · saúde {x.saude}</span></div><Barra valor={x.percentual_usado} rotulo={`Uso de ${x.ponto}`} /></li>
            ))}
            {d.bateria && <li><div className="mb-1 flex justify-between text-sm"><span>Bateria · {d.bateria.estado}</span><span className="num text-xs text-suave">saúde {Math.round(d.bateria.saude)}%</span></div><Barra valor={100 - d.bateria.nivel} rotulo="Bateria usada" /><div className="num mt-1 text-xs text-suave">{Math.round(d.bateria.nivel)}% de carga</div></li>}
          </ul>
        </Cartao>
      </div>
    </div>
  );
}
