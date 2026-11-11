import { useCallback, useEffect, useState } from "react";
import { useMotor } from "../estado";
import { bytes } from "../formato";
import type { AlvoDeLimpeza, ProgramaInicial } from "../ponte";
import { Aviso, Botao, Cartao } from "../ui";

interface Linha { alvo: AlvoDeLimpeza; tamanho: number }

/** Otimização com escolha: o usuário vê o que será limpo, quanto espaço volta e marca o que quer. */
export function Otimizar() {
  const motor = useMotor();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [memoria, setMemoria] = useState(true);
  const [iniciais, setIniciais] = useState<ProgramaInicial[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState("");
  const [erro, setErro] = useState("");

  const analisar = useCallback(async () => {
    setErro("");
    try {
      const alvos = await motor.alvosDeLimpeza();
      const plano = await motor.planejarLimpeza(alvos.map((a) => a.id));
      const por = new Map(plano.por_alvo);
      const l = alvos.map((a) => ({ alvo: a, tamanho: por.get(a.id) ?? 0 }));
      setLinhas(l);
      setMarcados(new Set(l.filter((x) => x.tamanho > 0).map((x) => x.alvo.id)));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLinhas([]); }
  }, [motor]);

  useEffect(() => { void analisar(); }, [analisar]);
  useEffect(() => { if (motor.recursos.inicializacao) void motor.programasIniciais().then(setIniciais).catch(() => undefined); }, [motor]);

  const total = (linhas ?? []).filter((l) => marcados.has(l.alvo.id)).reduce((s, l) => s + l.tamanho, 0);
  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todos = !!linhas?.length && linhas.every((l) => marcados.has(l.alvo.id));

  async function otimizar() {
    setOcupado(true); setResultado(""); setErro("");
    try {
      const partes: string[] = [];
      if (marcados.size) {
        const r = await motor.executarLimpeza([...marcados], false);
        partes.push(`${r.apagados} arquivos removidos (${bytes(r.liberado_bytes)} liberados)${r.falhas.length ? `, ${r.falhas.length} em uso foram pulados` : ""}.`);
      }
      if (memoria) {
        const m = await motor.otimizarMemoria();
        partes.push(m.nota || (m.suportado ? "Memória otimizada." : ""));
      }
      setResultado(partes.filter(Boolean).join(" ") || "Nada foi marcado.");
      await analisar();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    setOcupado(false);
  }

  return (
    <div className="space-y-4">
      <Cartao titulo="O que você quer otimizar?" acao={<Botao className="!min-h-9 !px-3 text-xs" onClick={() => setMarcados(todos ? new Set() : new Set((linhas ?? []).map((l) => l.alvo.id)))}>{todos ? "Desmarcar tudo" : "Marcar tudo"}</Botao>}>
        {!linhas ? <p className="text-sm text-suave">Calculando o que dá para limpar…</p> : linhas.length === 0 ? <p className="text-sm text-suave">Nenhuma pasta de limpeza encontrada neste aparelho.</p> : (
          <ul className="space-y-2">{linhas.map((l) => (
            <li key={l.alvo.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-borda p-3 hover:bg-white/5">
                <input type="checkbox" className="size-5" checked={marcados.has(l.alvo.id)} onChange={() => alternar(l.alvo.id)} />
                <span className="min-w-0 flex-1"><span className="block text-sm">{l.alvo.rotulo}</span><span className="block truncate text-xs text-suave">{l.alvo.pasta}</span></span>
                <span className="num flex-none text-sm text-neon">{l.tamanho > 0 ? bytes(l.tamanho) : "limpo"}</span>
              </label>
            </li>
          ))}</ul>
        )}
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-borda p-3 hover:bg-white/5">
          <input type="checkbox" className="size-5" checked={memoria} onChange={(e) => setMemoria(e.target.checked)} />
          <span className="min-w-0 flex-1"><span className="block text-sm">Liberar memória RAM</span><span className="block text-xs text-suave">Pede aos programas abertos que devolvam memória que não estão usando.</span></span>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Botao variante="primario" className="brilho !min-h-12 px-6" disabled={ocupado || (!marcados.size && !memoria)} onClick={otimizar}>{ocupado ? "Otimizando…" : "⚡ Otimizar selecionados"}</Botao>
          <span className="text-sm text-suave">{marcados.size ? `Vão voltar cerca de ${bytes(total)}.` : "Marque pelo menos um item."}</span>
          <Botao className="ml-auto !min-h-9 !px-3 text-xs" disabled={ocupado} onClick={() => void analisar()}>Analisar de novo</Botao>
        </div>
        <p className="mt-2 text-xs text-suave">Só arquivos temporários e caches parados há horas são apagados, nunca seus documentos. Arquivos em uso são pulados.</p>
      </Cartao>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado && <Aviso tom="ok">{resultado}</Aviso>}

      {motor.recursos.inicializacao && (
        <Cartao titulo={`Programas que iniciam com o Windows (${iniciais.length})`}>
          {iniciais.length === 0 ? <p className="text-sm text-suave">Nenhum programa encontrado na inicialização.</p> : (
            <ul className="space-y-2">{iniciais.map((p) => (
              <li key={p.origem + p.nome} className="rounded-xl border border-borda px-3 py-2"><div className="flex justify-between gap-2 text-sm"><span className="truncate">{p.nome}</span><span className="flex-none text-xs text-suave">{p.origem}</span></div><div className="truncate text-xs text-suave">{p.comando}</div></li>
            ))}</ul>
          )}
          <p className="mt-2 text-xs text-suave">Quanto menos programas iniciando junto, mais rápido o Windows liga. Para desativar: Gerenciador de Tarefas (Ctrl+Shift+Esc) › Aplicativos de inicialização.</p>
        </Cartao>
      )}
    </div>
  );
}
