import { useCallback, useEffect, useRef, useState } from "react";
import { useMotor } from "../estado";
import { acrescentar, bytes, tempoLigado } from "../formato";
import type { Diagnostico } from "../ponte";
import { Aviso, Barra, Botao, Cartao, Grafico, Velocimetro } from "../ui";

/** Nota de 0 a 100 pela folga de CPU, memória e disco. Simples e explicável. */
export function notaDeSaude(d: Diagnostico): { nota: number; dicas: string[] } {
  let nota = 100;
  const dicas: string[] = [];
  const ruim = (v: number, limite: number, peso: number, msg: string) => { if (v >= limite) { nota -= Math.min(peso, Math.round((v - limite) / 2) + 8); dicas.push(msg); } };
  ruim(d.cpu_uso, 80, 25, "O processador está muito ocupado.");
  ruim(d.memoria.percentual, 80, 30, "A memória está quase cheia.");
  const disco = d.discos[0];
  if (disco) ruim(disco.percentual_usado, 85, 30, `O disco ${disco.ponto} está quase cheio.`);
  if (d.temperatura_max != null) ruim(d.temperatura_max, 80, 20, "A temperatura está alta.");
  return { nota: Math.max(0, nota), dicas };
}

const Ficha = ({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) => (
  <Cartao className="!p-3 text-center"><div className="text-[11px] uppercase tracking-[0.16em] text-suave">{rotulo}</div><div className="num mt-1 text-xl font-semibold">{valor}</div>{detalhe && <div className="num text-xs text-suave">{detalhe}</div>}</Cartao>
);

export function Painel({ ir }: { ir: (aba: string) => void }) {
  const motor = useMotor();
  const [d, setD] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState("");
  const [hist, setHist] = useState<{ cpu: number[]; ram: number[] }>({ cpu: [], ram: [] });
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

  if (!d) return <div className="py-16 text-center text-suave">{erro || "Lendo o seu aparelho…"}</div>;
  const disco = d.discos[0];
  const saude = notaDeSaude(d);
  const swapPct = d.swap_total ? Math.min(100, ((d.swap_usado ?? 0) / d.swap_total) * 100) : null;
  return (
    <div className="space-y-4">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao className="text-center">
        <p className="text-sm text-suave">{d.maquina || "Este aparelho"} · {d.sistema} · ligado há {tempoLigado(d.ligado_ha_s)}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <div className="text-center"><div className="num text-5xl font-semibold" style={{ color: saude.nota >= 80 ? "#34d399" : saude.nota >= 55 ? "#fbbf24" : "#f87171" }}>{saude.nota}</div><div className="text-xs text-suave">saúde do aparelho</div></div>
          <div className="max-w-xs text-left text-sm text-suave">{saude.dicas.length ? saude.dicas.map((t) => <div key={t}>• {t}</div>) : <div>Tudo certo por aqui. Quer liberar ainda mais espaço?</div>}</div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Botao variante="primario" className="brilho !min-h-12 px-6" onClick={() => ir("otimizar")}>⚡ Otimizar…</Botao>
          <Botao className="!min-h-12" onClick={() => ir("seguranca")}>🛡️ Segurança</Botao>
        </div>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao><Velocimetro valor={d.cpu_uso} rotulo="CPU" detalhe={`${d.cpu_nucleos} núcleos`} /></Cartao>
        <Cartao><Velocimetro valor={d.memoria.percentual} rotulo="RAM" detalhe={`${bytes(d.memoria.usada)} de ${bytes(d.memoria.total)}`} /></Cartao>
        <Cartao>{disco ? <Velocimetro valor={disco.percentual_usado} rotulo={`Disco ${disco.ponto}`} detalhe={`${disco.tipo} · ${bytes(disco.livre)} livres`} /> : <p className="py-10 text-center text-sm text-suave">Sem disco lido.</p>}</Cartao>
        <Cartao>
          {d.temperatura_max != null ? <Velocimetro valor={d.temperatura_max} rotulo="Temperatura" unidade="°C" detalhe="sensor mais quente" />
            : swapPct != null ? <Velocimetro valor={swapPct} rotulo="Memória virtual" detalhe={`${bytes(d.swap_usado ?? 0)} de ${bytes(d.swap_total ?? 0)}`} />
            : d.bateria ? <Velocimetro valor={d.bateria.nivel} rotulo="Bateria" detalhe={d.bateria.estado} />
            : <p className="py-10 text-center text-sm text-suave">Sem mais sensores neste aparelho.</p>}
        </Cartao>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Ficha rotulo="Ligado há" valor={tempoLigado(d.ligado_ha_s)} />
        <Ficha rotulo="Processos" valor={String(d.processos_total ?? d.processos.length)} detalhe="em execução" />
        <Ficha rotulo="Rede" valor={d.rede ? `↓ ${bytes(d.rede.recebido)}` : "—"} detalhe={d.rede ? `↑ ${bytes(d.rede.enviado)} desde que ligou` : undefined} />
        <Ficha rotulo="Processador" valor={`${d.cpu_nucleos} núcleos`} detalhe={d.cpu_nome ? d.cpu_nome.replace(/\(R\)|\(TM\)/g, "").slice(0, 30) : undefined} />
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
