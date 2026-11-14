import { useCallback, useEffect, useMemo, useState } from "react";
import { useMotor } from "../estado";
import { bytes } from "../formato";
import type { ProgramaInstalado, RestoDePrograma } from "../ponte";
import { Aviso, Botao, Cartao, Interruptor } from "../ui";
import { organizarProgramas, type Ordem } from "../programas";

const campo = "min-h-11 w-full rounded-xl border border-borda bg-black/20 px-3 text-sm";

export function Desinstalar() {
  const motor = useMotor();
  const android = motor.plataforma === "android";
  const [lista, setLista] = useState<ProgramaInstalado[] | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("nome");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [silencioso, setSilencioso] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [restos, setRestos] = useState<{ programa: ProgramaInstalado; itens: RestoDePrograma[] }[]>([]);
  const [armado, setArmado] = useState(false);

  const carregar = useCallback(async () => {
    try { setLista(await motor.programas()); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : typeof e === "string" ? e : "Não consegui listar agora."); setLista([]); }
  }, [motor]);
  useEffect(() => { void carregar(); }, [carregar]);
  // no Android a confirmação é do sistema: ao voltar para o Vindex a lista se atualiza sozinha
  useEffect(() => {
    if (!android) return;
    const ver = () => { if (document.visibilityState === "visible") void carregar(); };
    document.addEventListener("visibilitychange", ver);
    window.addEventListener("focus", ver);
    return () => { document.removeEventListener("visibilitychange", ver); window.removeEventListener("focus", ver); };
  }, [android, carregar]);

  const vistos = useMemo(() => organizarProgramas(lista ?? [], busca, ordem), [lista, busca, ordem]);
  const total = useMemo(() => (lista ?? []).reduce((s, p) => s + p.bytes, 0), [lista]);

  async function remover(p: ProgramaInstalado): Promise<void> {
    setOcupado(p.id); setErro(""); setMsg("");
    try {
      const r = await motor.desinstalarPrograma(p.id, silencioso && motor.recursos.desinstalarSilencioso && p.silencioso);
      if (android) { setMsg(`Confirme no aviso do Android para desinstalar ${p.nome}.`); return; }
      if (r.removido) {
        setMsg(`${p.nome} foi desinstalado.`);
        setMarcados((m) => m.filter((x) => x !== p.id));
        if (r.restos.length) setRestos((x) => [...x.filter((y) => y.programa.id !== p.id), { programa: p, itens: r.restos }]);
        await carregar();
      } else {
        setMsg(`O desinstalador de ${p.nome} terminou, mas ele ainda aparece na lista. Se a janela dele ainda estiver aberta, conclua lá e toque em Atualizar.`);
      }
    } catch (e) { setErro(typeof e === "string" ? e : e instanceof Error ? e.message : "Não consegui desinstalar."); } finally { setOcupado(""); }
  }

  async function removerMarcados() {
    if (!armado) { setArmado(true); window.setTimeout(() => setArmado(false), 4000); return; }
    setArmado(false);
    for (const id of marcados) {
      const p = (lista ?? []).find((x) => x.id === id);
      if (p) await remover(p);
    }
    if (android) setMarcados([]);
  }

  async function limpar(programa: ProgramaInstalado) {
    setOcupado("restos:" + programa.id); setErro("");
    try {
      const r = await motor.limparRestos(programa.id);
      setMsg(`Sobras de ${programa.nome} apagadas: ${r.apagados} item(ns), ${bytes(r.bytes)} liberados.${r.falhas.length ? ` Não consegui apagar ${r.falhas.length}.` : ""}`);
      setRestos((x) => x.filter((y) => y.programa.id !== programa.id));
    } catch (e) { setErro(typeof e === "string" ? e : e instanceof Error ? e.message : "Não consegui limpar."); } finally { setOcupado(""); }
  }

  const alternar = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const rotulo = android ? "apps" : "programas";

  return (
    <div className="space-y-4">
      <Cartao titulo={android ? "Desinstalar apps" : "Desinstalar programas"} acao={<Botao onClick={() => void carregar()} disabled={!!ocupado}>Atualizar</Botao>}>
        <p className="mb-3 text-sm text-suave">
          {android
            ? "Escolha o app e toque em Desinstalar. O Android pede uma confirmação e o app sai na hora. Apps do sistema não aparecem aqui."
            : "Escolha o programa e toque em Desinstalar. O Vindex abre o desinstalador do próprio programa e, quando ele termina, procura as sobras (pastas e configurações) para você apagar com um clique."}
        </p>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {msg && <Aviso tom="ok">{msg}</Aviso>}
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input className={campo} type="search" placeholder={`Buscar entre os ${rotulo}…`} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          <div role="group" aria-label="Ordenar" className="flex gap-1">
            {(["nome", "tamanho", "data"] as const).map((o) => (
              <button key={o} onClick={() => setOrdem(o)} aria-pressed={ordem === o} className={`min-h-11 rounded-xl border px-3 text-sm ${ordem === o ? "border-neon/50 bg-neon/15 text-neon" : "border-borda text-suave"}`}>{o === "nome" ? "Nome" : o === "tamanho" ? "Tamanho" : "Recentes"}</button>
            ))}
          </div>
        </div>
        {motor.recursos.desinstalarSilencioso && (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm"><span>Sem janelas quando o programa permitir<span className="block text-xs text-suave">Usa o modo silencioso do próprio programa. Os que não têm abrem a janela normal.</span></span><Interruptor ligado={silencioso} aoMudar={setSilencioso} rotulo="Desinstalar sem janelas" /></div>
        )}
        <p className="mt-3 text-xs text-suave">{lista === null ? "Carregando…" : `${lista.length} ${rotulo}${total ? ` · ${bytes(total)} no total` : ""}${vistos.length !== (lista?.length ?? 0) ? ` · ${vistos.length} na busca` : ""}`}</p>
      </Cartao>

      {restos.map(({ programa, itens }) => (
        <Cartao key={programa.id} titulo={`Sobras de ${programa.nome}`}>
          <p className="mb-2 text-sm text-suave">O programa saiu, mas deixou isto para trás. Apagar libera espaço e não afeta o resto do Windows.</p>
          <ul className="space-y-1 text-xs">{itens.map((r) => <li key={r.caminho} className="flex justify-between gap-2 rounded-lg border border-borda px-2 py-1"><span className="min-w-0 break-all">{r.tipo === "registro" ? "Configuração: " : ""}{r.caminho}</span><span className="flex-none text-suave">{r.tipo === "pasta" ? bytes(r.bytes) : ""}</span></li>)}</ul>
          <div className="mt-3 flex gap-2">
            <Botao variante="primario" disabled={!!ocupado} onClick={() => void limpar(programa)}>{ocupado === "restos:" + programa.id ? "Apagando…" : "Apagar sobras"}</Botao>
            <Botao onClick={() => setRestos((x) => x.filter((y) => y.programa.id !== programa.id))}>Deixar</Botao>
          </div>
        </Cartao>
      ))}

      {marcados.length > 0 && (
        <div className="sticky top-2 z-10"><Botao variante="perigo" className="w-full bg-fundo/90 backdrop-blur" disabled={!!ocupado} onClick={() => void removerMarcados()}>{armado ? `Toque de novo para desinstalar ${marcados.length}` : `Desinstalar os ${marcados.length} marcados`}</Botao></div>
      )}

      <ul className="space-y-2">
        {vistos.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-borda bg-white/[0.02] px-3 py-2 text-sm">
            <input type="checkbox" className="h-5 w-5 flex-none accent-[var(--color-neon)]" checked={marcados.includes(p.id)} onChange={() => alternar(p.id)} aria-label={`Marcar ${p.nome}`} />
            {p.icone ? <img src={`data:image/png;base64,${p.icone}`} alt="" className="h-10 w-10 flex-none rounded-xl" loading="lazy" /> : null}
            <button className="min-w-0 flex-1 text-left" onClick={() => void motor.detalhesPrograma(p.id, p.local).catch(() => undefined)} title={android ? "Abrir as informações do app" : "Abrir a pasta do programa"}>
              <span className="block truncate font-medium">{p.nome}</span>
              <span className="block truncate text-xs text-suave">{[p.editora, p.versao && `v${p.versao}`, p.bytes ? bytes(p.bytes) : "", p.instaladoEm].filter(Boolean).join(" · ")}</span>
            </button>
            <Botao variante="perigo" disabled={!!ocupado} onClick={() => void remover(p)}>{ocupado === p.id ? "Aguarde…" : "Desinstalar"}</Botao>
          </li>
        ))}
        {lista !== null && vistos.length === 0 && !erro && <li className="py-6 text-center text-sm text-suave">{busca ? "Nada encontrado com esse nome." : `Nenhum ${android ? "app" : "programa"} para mostrar.`}</li>}
      </ul>
    </div>
  );
}
