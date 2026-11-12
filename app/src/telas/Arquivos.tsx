import { useEffect, useState } from "react";
import { useMotor, usePastas } from "../estado";
import { bytes, nomeDoArquivo, pastaDoArquivo } from "../formato";
import type { Arquivo, GrupoDuplicado, Movimento, ResultadoDeMovimento, ResumoVarredura } from "../ponte";
import { Aviso, Botao, Cartao } from "../ui";
import { Explorar } from "./Explorar";
import { Pastas } from "./Pastas";

/** Arquivos: abre como um gerenciador (Explorar) e guarda as ferramentas de organização em “Organizar”. */
export function Arquivos({ abrirEm = null }: { abrirEm?: string | null }) {
  const [aba, setAba] = useState<"explorar" | "organizar">(() => { try { return sessionStorage.getItem("vindex.arquivos.aba") === "organizar" ? "organizar" : "explorar"; } catch { return "explorar"; } });
  useEffect(() => { if (abrirEm) setAba("explorar"); }, [abrirEm]);
  const trocar = (a: "explorar" | "organizar") => { setAba(a); try { sessionStorage.setItem("vindex.arquivos.aba", a); } catch { /* ok */ } };
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-2">
        {([["explorar", "Explorar"], ["organizar", "Organizar"]] as const).map(([id, r]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => trocar(id)} className={`min-h-10 rounded-xl px-4 text-sm ${aba === id ? "bg-neon/15 text-neon" : "border border-borda text-suave"}`}>{r}</button>
        ))}
      </div>
      {aba === "explorar" ? <Explorar abrirEm={abrirEm} /> : <Organizar />}
    </div>
  );
}

function Organizar() {
  const motor = useMotor();
  const { pastas, adicionar, remover } = usePastas();
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [resumo, setResumo] = useState<ResumoVarredura | null>(null);
  const [grupos, setGrupos] = useState<GrupoDuplicado[] | null>(null);
  const [gigantes, setGigantes] = useState<Arquivo[] | null>(null);
  const [previa, setPrevia] = useState<ResultadoDeMovimento | null>(null);
  const [ultimo, setUltimo] = useState<Movimento[]>([]);
  const [msg, setMsg] = useState("");

  async function rodar<T>(nome: string, f: () => Promise<T>): Promise<T | null> {
    setOcupado(nome); setErro(""); setMsg("");
    try { return await f(); } catch (e) { setErro(e instanceof Error ? e.message : typeof e === "string" ? e : "Não deu certo."); return null; } finally { setOcupado(""); }
  }
  const analisar = async () => {
    const r = await rodar("analisar", async () => ({ v: await motor.varrer(pastas), d: await motor.duplicados(pastas), g: await motor.gigantes(pastas) }));
    if (r) { setResumo(r.v); setGrupos(r.d); setGigantes(r.g); }
  };
  const previaDeCategorias = async () => { const r = await rodar("previa", () => motor.organizarCategorias(pastas, true)); if (r) setPrevia(r); };
  const aplicarCategorias = async () => {
    const r = await rodar("organizar", () => motor.organizarCategorias(pastas, false));
    if (r) { setUltimo(r.movidos); setPrevia(null); setMsg(`${r.movidos.length} arquivos organizados.${r.falhas.length ? ` ${r.falhas.length} não puderam ser movidos.` : ""}`); void analisar(); }
  };
  const desfazer = async () => { const r = await rodar("desfazer", () => motor.desfazer(ultimo)); if (r) { setUltimo([]); setMsg(`${r.movidos.length} arquivos voltaram ao lugar.`); } };
  const manter = async (g: GrupoDuplicado, caminho: string) => {
    const r = await rodar("quarentena", () => motor.duplicadoParaQuarentena(pastas, caminho, false));
    if (r) { setMsg(`${r.movidos.length} cópias foram para a quarentena do Vindex (você pode recuperá-las).`); setUltimo(r.movidos); setGrupos((l) => (l ?? []).filter((x) => x.sha256 !== g.sha256)); }
  };
  // abriu a tela com pastas escolhidas: já mostra o que dá para organizar (nada é movido sem apertar “Aplicar”)
  useEffect(() => { if (pastas.length) void previaDeCategorias(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const total = (grupos ?? []).reduce((s, g) => s + g.desperdicio, 0);

  return (
    <div className="space-y-4">
      <Cartao titulo="Pastas do Vindex"><Pastas pastas={pastas} adicionar={adicionar} remover={remover} /></Cartao>
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" disabled={!pastas.length || !!ocupado} onClick={analisar}>{ocupado === "analisar" ? "Analisando…" : "Analisar pastas"}</Botao>
        <Botao disabled={!pastas.length || !!ocupado} onClick={previaDeCategorias}>Organizar por categoria (prévia)</Botao>
        {ultimo.length > 0 && <Botao variante="perigo" disabled={!!ocupado} onClick={desfazer}>Desfazer última ação</Botao>}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {msg && <Aviso tom="ok">{msg}</Aviso>}

      {previa && (
        <Cartao titulo="Prévia: nada foi movido ainda" acao={<Botao variante="primario" onClick={aplicarCategorias} disabled={!!ocupado || previa.movidos.length === 0}>Aplicar</Botao>}>
          {previa.movidos.length === 0 ? <p className="text-sm text-suave">Já está tudo organizado.</p> : (
            <ul className="max-h-64 space-y-1 overflow-auto text-sm">{previa.movidos.slice(0, 200).map((m) => <li key={m.de} className="break-all"><span className="text-suave">{nomeDoArquivo(m.de)}</span> → <span className="text-neon">{pastaDoArquivo(m.para)}</span></li>)}</ul>
          )}
        </Cartao>
      )}

      {resumo && (
        <Cartao titulo="Resumo">
          <p className="mb-2 text-sm">{resumo.arquivos} arquivos · {bytes(resumo.bytes)}</p>
          <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">{Object.entries(resumo.categorias).map(([c, [n, b]]) => <li key={c} className="rounded-xl border border-borda px-3 py-2"><div>{c}</div><div className="num text-xs text-suave">{n} · {bytes(b)}</div></li>)}</ul>
        </Cartao>
      )}

      {grupos && (
        <Cartao titulo={`Duplicados · ${grupos.length} grupos · ${bytes(total)} para recuperar`}>
          {grupos.length === 0 ? <p className="text-sm text-suave">Nenhum duplicado encontrado.</p> : (
            <ul className="space-y-3">{grupos.slice(0, 100).map((g) => (
              <li key={g.sha256} className="rounded-xl border border-borda p-3">
                <div className="mb-2 flex justify-between text-sm"><span>{nomeDoArquivo(g.caminhos[0])}</span><span className="num text-xs text-suave">{g.caminhos.length} cópias · {bytes(g.desperdicio)} sobrando</span></div>
                <ul className="space-y-1">{g.caminhos.map((c) => (
                  <li key={c} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 break-all text-suave">{c}</span><Botao className="!min-h-9 flex-none !px-3 text-xs" disabled={!!ocupado} onClick={() => manter(g, c)}>Manter esta</Botao></li>
                ))}</ul>
              </li>
            ))}</ul>
          )}
          <p className="mt-2 text-xs text-suave">As outras cópias vão para a pasta “Vindex-Quarentena”, ao lado do arquivo mantido. Nada é apagado de vez.</p>
        </Cartao>
      )}

      {gigantes && (
        <Cartao titulo="Gigantes parados há mais de 90 dias">
          {gigantes.length === 0 ? <p className="text-sm text-suave">Nenhum arquivo grande parado.</p> : (
            <ul className="space-y-2">{gigantes.slice(0, 50).map((a) => <li key={a.caminho} className="flex justify-between gap-2 text-sm"><span className="min-w-0 break-all">{a.nome}</span><span className="num flex-none text-xs text-suave">{bytes(a.bytes)}</span></li>)}</ul>
          )}
        </Cartao>
      )}
    </div>
  );
}
