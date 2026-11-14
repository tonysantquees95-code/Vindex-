import { useCallback, useEffect, useState } from "react";
import { useMotor } from "../estado";
import { bytes } from "../formato";
import type { AnaliseDisco, EstadoRam, Inicializacao, ItemInicio, VolumeDisco } from "../ponte";
import { Aviso, Barra, Botao, Cartao, Interruptor } from "../ui";

const segundos = (ms: number) => `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1).replace(".", ",")} s`;
const MSG = (e: unknown) => (e instanceof Error ? e.message : String(e));

function veredito(ms: number): { texto: string; cor: string } {
  if (ms < 30_000) return { texto: "Rápida", cor: "text-ok" };
  if (ms < 60_000) return { texto: "Normal", cor: "text-aviso" };
  return { texto: "Lenta", cor: "text-erro" };
}

const IMPACTO: Record<ItemInicio["impacto"], { texto: string; cor: string }> = {
  alto: { texto: "Lento", cor: "border-erro/40 text-erro" },
  medio: { texto: "Médio", cor: "border-aviso/40 text-aviso" },
  baixo: { texto: "Rápido", cor: "border-ok/40 text-ok" },
  nao_medido: { texto: "Não medido", cor: "border-borda text-suave" },
};

/** Inicialização do Windows, disco (desfragmentação inteligente) e memória: o que deixa o computador mais rápido, em uma tela só. */
export function Desempenho() {
  const motor = useMotor();
  return (
    <div className="space-y-4">
      <Inicio />
      <Discos />
      <Memoria />
      {!motor.recursos.desempenho && <Aviso>Estas ferramentas são do Windows. No Android, use a aba Otimizar e o painel de desempenho.</Aviso>}
    </div>
  );
}

function Inicio() {
  const motor = useMotor();
  const [dados, setDados] = useState<Inicializacao | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const ler = useCallback(async () => {
    setErro("");
    try { setDados(await motor.inicializacao()); } catch (e) { setErro(MSG(e)); setDados({ suportado: true, boot_ms: null, boot_quando: null, historico_ms: [], itens: [], economia_possivel_ms: 0, nota: "" }); }
  }, [motor]);
  useEffect(() => { void ler(); }, [ler]);

  const sugeridos = (dados?.itens ?? []).filter((i) => i.ligado && !i.protegido && (i.impacto === "alto" || i.impacto === "medio"));
  async function definir(i: ItemInicio, ligado: boolean) {
    setOcupado(i.id); setAviso(""); setErro("");
    try { setAviso(await motor.definirInicio(i.local, i.nome, ligado)); await ler(); } catch (e) { setErro(MSG(e)); }
    setOcupado("");
  }
  async function desligarSugeridos() {
    setOcupado("todos"); setAviso(""); setErro("");
    let feitos = 0;
    try { for (const i of sugeridos) { await motor.definirInicio(i.local, i.nome, false); feitos++; } setAviso(`${feitos} programa(s) não iniciam mais com o Windows. Dá para religar a qualquer hora.`); } catch (e) { setErro(`${feitos ? `${feitos} desligado(s). ` : ""}${MSG(e)}`); }
    await ler();
    setOcupado("");
  }

  if (!dados) return <Cartao titulo="Inicialização do Windows"><p className="text-sm text-suave">Lendo o que inicia com o Windows…</p></Cartao>;
  if (!dados.suportado) return <Cartao titulo="Inicialização do Windows"><p className="text-sm text-suave">{dados.nota || "Disponível no Windows."}</p></Cartao>;
  const v = dados.boot_ms ? veredito(dados.boot_ms) : null;
  const media = dados.historico_ms.length > 1 ? dados.historico_ms.reduce((a, b) => a + b, 0) / dados.historico_ms.length : null;
  return (
    <Cartao titulo="Inicialização do Windows" acao={<Botao className="!min-h-9 !px-3 text-xs" disabled={!!ocupado} onClick={() => void ler()}>Ler de novo</Botao>}>
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-suave">Último boot</div>
          <div className="num text-3xl font-semibold">{dados.boot_ms ? segundos(dados.boot_ms) : "—"}</div>
        </div>
        {v && <div className={`text-sm font-medium ${v.cor}`}>{v.texto}{media ? <span className="ml-2 text-xs font-normal text-suave">média dos últimos {dados.historico_ms.length}: {segundos(media)}</span> : null}</div>}
        {dados.economia_possivel_ms > 0 && <div className="text-sm text-suave">Desligando os lentos, o Windows pode ligar até <span className="text-neon">{segundos(dados.economia_possivel_ms)}</span> mais rápido.</div>}
      </div>
      {dados.nota && <p className="mb-3 text-xs text-suave">{dados.nota}</p>}
      {dados.itens.length === 0 ? <p className="text-sm text-suave">Nenhum programa na inicialização.</p> : (
        <ul className="space-y-2">{dados.itens.map((i) => {
          const im = IMPACTO[i.impacto];
          return (
            <li key={i.id} className={`rounded-xl border border-borda px-3 py-2 ${i.ligado ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm"><span className="truncate">{i.nome}</span><span className={`rounded-full border px-2 py-0.5 text-[11px] ${im.cor}`}>{im.texto}{i.atraso_ms ? ` · ${segundos(i.atraso_ms)}` : ""}</span>{i.protegido && <span className="rounded-full border border-borda px-2 py-0.5 text-[11px] text-suave">protegido</span>}</div>
                  <div className="truncate text-xs text-suave">{i.origem} · {i.comando}</div>
                </div>
                <Interruptor ligado={i.ligado} aoMudar={(l) => void definir(i, l)} rotulo={`${i.nome} inicia com o Windows`} />
              </div>
            </li>
          );
        })}</ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Botao variante="primario" disabled={!!ocupado || sugeridos.length === 0} onClick={() => void desligarSugeridos()}>{ocupado === "todos" ? "Desligando…" : `Desligar os ${sugeridos.length} sugeridos`}</Botao>
        <span className="text-xs text-suave">{sugeridos.length ? "Sugeridos: lentos ou médios que não são segurança, driver nem do Windows." : "Nada lento para sugerir agora."}</span>
      </div>
      <p className="mt-2 text-xs text-suave">Nada é apagado: o programa continua instalado e só deixa de abrir sozinho. “Protegido” são antivírus, drivers e itens do Windows. O tempo de cada programa vem do próprio Windows e aparece depois de alguns boots.</p>
      {aviso && <div className="mt-3"><Aviso tom="ok">{aviso}</Aviso></div>}
      {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
    </Cartao>
  );
}

function Discos() {
  const motor = useMotor();
  const [volumes, setVolumes] = useState<VolumeDisco[] | null>(null);
  const [analises, setAnalises] = useState<Record<string, AnaliseDisco>>({});
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => { motor.discos().then(setVolumes).catch((e) => { setErro(MSG(e)); setVolumes([]); }); }, [motor]);

  async function analisar(letra: string) {
    setOcupado(letra); setErro(""); setAviso("");
    try { const a = await motor.analisarDisco(letra); setAnalises((x) => ({ ...x, [letra]: a })); } catch (e) { setErro(MSG(e)); }
    setOcupado("");
  }
  async function otimizar(letra: string) {
    setOcupado(letra); setErro(""); setAviso("");
    try { const r = await motor.otimizarDisco(letra); setAviso(`${letra}: ${r.resumo}`); setVolumes(await motor.discos()); } catch (e) { setErro(MSG(e)); }
    setOcupado("");
  }

  return (
    <Cartao titulo="Discos: desfragmentação inteligente">
      {!volumes ? <p className="text-sm text-suave">Lendo os discos…</p> : volumes.length === 0 ? <p className="text-sm text-suave">Nenhum disco encontrado.</p> : (
        <ul className="space-y-3">{volumes.map((v) => {
          const usado = v.total ? ((v.total - v.livre) * 100) / v.total : 0;
          const a = analises[v.letra];
          return (
            <li key={v.letra} className="rounded-xl border border-borda p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{v.letra}: {v.rotulo && <span className="text-suave">{v.rotulo}</span>} <span className="ml-1 rounded-full border border-borda px-2 py-0.5 text-[11px] text-suave">{v.tipo}</span></span>
                <span className="num text-xs text-suave">{bytes(v.livre)} livres de {bytes(v.total)}</span>
              </div>
              <div className="my-2"><Barra valor={usado} rotulo={`Uso do disco ${v.letra}`} /></div>
              {a && <p className="mb-2 text-xs text-suave">{a.fragmentado_pct != null ? `${a.fragmentado_pct}% fragmentado. ` : ""}{a.motivo}</p>}
              <div className="flex flex-wrap gap-2">
                <Botao className="!min-h-9 !px-3 text-xs" disabled={!!ocupado} onClick={() => void analisar(v.letra)}>{ocupado === v.letra && !aviso ? "Aguarde…" : "Analisar"}</Botao>
                <Botao variante="primario" className="!min-h-9 !px-3 text-xs" disabled={!!ocupado} onClick={() => void otimizar(v.letra)}>{v.tipo === "SSD" ? "Otimizar (TRIM)" : v.tipo === "HDD" ? "Otimizar (desfragmentar se precisar)" : "Otimizar"}</Botao>
              </div>
            </li>
          );
        })}</ul>
      )}
      <p className="mt-3 text-xs text-suave">HDD só é desfragmentado quando precisa. SSD nunca é desfragmentado (só gasta o disco): ele recebe TRIM. Pode demorar vários minutos e precisa do Vindex aberto como administrador. Para ganhar espaço, use também a aba Otimizar (limpeza) e a aba Arquivos (duplicados e arquivos grandes).</p>
      {aviso && <div className="mt-3"><Aviso tom="ok">{aviso}</Aviso></div>}
      {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
    </Cartao>
  );
}

function Memoria() {
  const motor = useMotor();
  const [ram, setRam] = useState<EstadoRam | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const ler = useCallback(() => motor.ramEstado(8).then(setRam).catch((e) => setErro(MSG(e))), [motor]);
  useEffect(() => { void ler(); }, [ler]);

  async function liberar() {
    setOcupado(true); setAviso(""); setErro("");
    try {
      const antes = ram?.disponivel ?? 0;
      const r = await motor.otimizarMemoria();
      const depois = await motor.ramEstado(8);
      setRam(depois);
      const ganho = Math.max(0, depois.disponivel - antes);
      setAviso(r.suportado ? `${r.nota} ${ganho > 0 ? `Voltaram ${bytes(ganho)} de RAM.` : "A memória já estava em ordem."}` : r.nota);
    } catch (e) { setErro(MSG(e)); }
    setOcupado(false);
  }

  return (
    <Cartao titulo="Memória RAM" acao={<Botao className="!min-h-9 !px-3 text-xs" disabled={ocupado} onClick={() => void ler()}>Atualizar</Botao>}>
      {!ram ? <p className="text-sm text-suave">Lendo a memória…</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{bytes(ram.total - ram.disponivel)} em uso de {bytes(ram.total)}</span><span className="num text-xs text-suave">{Math.round(ram.percentual)}%</span></div>
          <div className="my-2"><Barra valor={ram.percentual} rotulo="Uso da memória" /></div>
          <ul className="mt-3 space-y-1">{ram.maiores.map((p) => <li key={p.nome} className="flex justify-between gap-2 text-xs"><span className="truncate text-suave">{p.nome}</span><span className="num flex-none">{bytes(p.memoria)}</span></li>)}</ul>
        </>
      )}
      <div className="mt-4"><Botao variante="primario" disabled={ocupado} onClick={() => void liberar()}>{ocupado ? "Liberando…" : "Liberar RAM"}</Botao></div>
      <p className="mt-2 text-xs text-suave">Pede aos programas abertos que devolvam a memória que não estão usando. Nenhum programa é fechado e nada é perdido.</p>
      {aviso && <div className="mt-3"><Aviso tom="ok">{aviso}</Aviso></div>}
      {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
    </Cartao>
  );
}
