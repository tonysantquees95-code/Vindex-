import { useCallback, useEffect, useRef, useState } from "react";
import { useMotor } from "../estado";
import { acrescentar, bytes, tempoLigado } from "../formato";
import { Icone } from "../icones";
import type { Diagnostico } from "../ponte";
import { avaliar, dicaDeTemperatura, tomDoNivel } from "../temperatura";
import { Aviso, AnelDeSaude, Barra, Botao, Cartao, Grafico, Velocimetro } from "../ui";

/** Valores já suavizados (média móvel) que alimentam a nota. */
export type Suaves = { cpu: number; ram: number; temp: number | null };

/**
 * Saúde de 0 a 100 pelo estado geral do aparelho: armazenamento, bateria, temperatura
 * e pressão sustentada de memória. O uso momentâneo do processador quase não pesa:
 * ele mostra carga, não desgaste.
 */
export function notaDeSaude(d: Diagnostico, s?: Suaves): { nota: number; dicas: string[] } {
  const ram = s?.ram ?? d.memoria.percentual;
  const cpu = s?.cpu ?? d.cpu_uso;
  let nota = 100;
  const dicas: string[] = [];
  const perde = (v: number, de: number, ate: number, peso: number) => Math.round(peso * Math.max(0, Math.min(1, (v - de) / (ate - de))));
  const disco = d.discos[0];
  if (disco) { const p = perde(disco.percentual_usado, 75, 98, 30); if (p > 3) { nota -= p; dicas.push(`O disco ${disco.ponto} está ficando cheio.`); } }
  if (d.bateria) {
    const p = perde(100 - d.bateria.saude, 15, 50, 25);
    if (p > 3) { nota -= p; dicas.push("A bateria já perdeu boa parte da capacidade."); }
  }
  { // a régua de cada peça (e o estado térmico do Android) decide; 44 °C no processador não é febre
    const t = avaliar(d.sensores ?? [], d.termico);
    const p = t.nivel === 3 ? 25 : t.nivel === 2 ? 12 : t.nivel === 1 ? 2 : 0;
    const dica = dicaDeTemperatura(t);
    if (dica) { nota -= p; dicas.push(dica); }
  }
  { const p = perde(ram, 85, 98, 15); if (p > 3) { nota -= p; dicas.push("A memória está bem pressionada."); } }
  { const p = perde(cpu, 92, 100, 5); if (p > 1) { nota -= p; dicas.push("O processador está sob carga constante."); } }
  return { nota: Math.max(0, Math.min(100, nota)), dicas };
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
  const anterior = useRef<{ rx: number; tx: number; t: number } | null>(null);
  const emas = useRef<Suaves | null>(null);
  const notaMostrada = useRef<number | null>(null);
  const [suave, setSuave] = useState<{ s: Suaves; nota: number } | null>(null);
  const [veloc, setVeloc] = useState<{ down: number; up: number } | null>(null);

  const ler = useCallback(async () => {
    try {
      const x = await motor.diagnostico(8);
      if (!vivo.current) return;
      const ema = (a: number, b: number) => a + (b - a) * 0.25;
      const ant = emas.current;
      const s: Suaves = ant
        ? { cpu: ema(ant.cpu, x.cpu_uso), ram: ema(ant.ram, x.memoria.percentual), temp: x.temperatura_max == null ? null : ema(ant.temp ?? x.temperatura_max, x.temperatura_max) }
        : { cpu: x.cpu_uso, ram: x.memoria.percentual, temp: x.temperatura_max };
      emas.current = s;
      // a nota anda no máximo 1 ponto por leitura: nunca dá salto
      const alvo = notaDeSaude(x, s).nota;
      const m = notaMostrada.current;
      const nota = m == null ? alvo : m + Math.max(-1, Math.min(1, alvo - m));
      notaMostrada.current = nota;
      setSuave({ s, nota });
      setD(x);
      setErro("");
      if (x.rede) {
        const agora = Date.now();
        const a = anterior.current;
        if (a && agora > a.t && x.rede.recebido >= a.rx) setVeloc({ down: ((x.rede.recebido - a.rx) * 1000) / (agora - a.t), up: ((x.rede.enviado - a.tx) * 1000) / (agora - a.t) });
        anterior.current = { rx: x.rede.recebido, tx: x.rede.enviado, t: agora };
      }
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
  const saude = notaDeSaude(d, suave?.s);
  const nota = Math.round(suave?.nota ?? saude.nota);
  const sv = suave?.s;
  const termica = avaliar(d.sensores ?? [], d.termico);
  const swapPct = d.swap_total ? Math.min(100, ((d.swap_usado ?? 0) / d.swap_total) * 100) : null;
  return (
    <div className="space-y-4">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao className="text-center">
        <p className="text-sm text-suave">{d.maquina || "Este aparelho"} · {d.sistema} · ligado há {tempoLigado(d.ligado_ha_s)}</p>
        <div className="mt-3"><AnelDeSaude valor={nota} rotulo="saúde" /></div>
        <div className="mx-auto mt-2 min-h-14 max-w-full text-center text-sm leading-[1.375rem] text-suave">{saude.dicas.length ? saude.dicas.slice(0, 2).map((t) => <div key={t}>{t}</div>) : <><div>Tudo certo por aqui.</div><div>Que tal liberar mais espaço?</div></>}</div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Botao variante="primario" className="brilho !min-h-12 px-6" onClick={() => ir("otimizar")}><Icone nome="otimizar" tam={18} />Otimizar…</Botao>
          <Botao className="!min-h-12" onClick={() => ir("seguranca")}><Icone nome="seguranca" tam={18} />Segurança</Botao>
        </div>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao><Velocimetro valor={sv?.cpu ?? d.cpu_uso} rotulo={d.cpu_estimado ? "CPU (estimada)" : "CPU"} detalhe={`${d.cpu_nucleos} núcleos`} /></Cartao>
        <Cartao><Velocimetro valor={sv?.ram ?? d.memoria.percentual} rotulo="RAM" detalhe={`${bytes(d.memoria.usada)} de ${bytes(d.memoria.total)}${d.swap_total ? ` · +${bytes(d.swap_total)} virtual` : ""}`} /></Cartao>
        <Cartao>{disco ? <Velocimetro valor={disco.percentual_usado} rotulo={`Disco ${disco.ponto}`} detalhe={`${disco.tipo} · ${bytes(disco.livre)} livres`} /> : <p className="py-10 text-center text-sm text-suave">Sem disco lido.</p>}</Cartao>
        <Cartao>
          {d.temperatura_max != null ? <Velocimetro valor={termica.fracao} numero={termica.sensor?.celsius ?? d.temperatura_max} tom={tomDoNivel(termica.nivel)} rotulo="Temperatura" unidade="°C" detalhe={termica.detalhe} />
            : swapPct != null ? <Velocimetro valor={swapPct} rotulo="Memória virtual" detalhe={`${bytes(d.swap_usado ?? 0)} de ${bytes(d.swap_total ?? 0)}`} />
            : d.bateria ? <Velocimetro valor={d.bateria.nivel} rotulo="Bateria" detalhe={d.bateria.estado} />
            : <p className="py-10 text-center text-sm text-suave">Sem mais sensores neste aparelho.</p>}
        </Cartao>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Ficha rotulo="Ligado há" valor={tempoLigado(d.ligado_ha_s)} />
        <Ficha rotulo="Processos" valor={String(d.processos_total ?? d.processos.length)} detalhe="em execução" />
        <Ficha rotulo="Rede" valor={d.rede ? (d.rede.tipo ?? `↓ ${bytes(d.rede.recebido)}`) : "—"} detalhe={d.rede ? (veloc ? `↓ ${bytes(veloc.down)}/s · ↑ ${bytes(veloc.up)}/s` : `↓ ${bytes(d.rede.recebido)} · ↑ ${bytes(d.rede.enviado)}`) : undefined} />
        <Ficha rotulo="Processador" valor={`${d.cpu_nucleos} núcleos`} detalhe={d.cpu_nome ? d.cpu_nome.replace(/\(R\)|\(TM\)/g, "").slice(0, 30) : undefined} />
      </div>

      <Cartao titulo="Consumo em tempo real"><Grafico series={[{ nome: "CPU", cor: "var(--color-neon)", valores: hist.cpu }, { nome: "RAM", cor: "var(--color-magenta)", valores: hist.ram }]} /></Cartao>

      <div className="grid gap-3 md:grid-cols-2">
        <Cartao titulo={d.processos.some((x) => x.tempo_uso_s != null) ? "Apps mais usados hoje" : "Quem mais consome"}>
          <ul className="space-y-2">{d.processos.map((p) => (
            <li key={p.pid} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{p.nome}</span><span className="num flex-none text-xs text-suave">{p.tempo_uso_s != null ? `${Math.max(1, Math.round(p.tempo_uso_s / 60))} min hoje` : `${p.cpu.toFixed(0)}% CPU · ${bytes(p.memoria)}`}</span></li>
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
