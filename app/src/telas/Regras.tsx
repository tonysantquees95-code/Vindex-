import { useState } from "react";
import { useMotor, usePastas } from "../estado";
import { nomeDoArquivo, pastaDoArquivo } from "../formato";
import type { Categoria, Regra, ResultadoDeMovimento } from "../ponte";
import { CATEGORIAS, carregarRegras, frase, guardarRegras, novaRegra, validar } from "../regras";
import { Aviso, Botao, Cartao } from "../ui";
import { Pastas } from "./Pastas";

const campo = "min-h-11 w-full rounded-xl border border-borda bg-black/20 px-3 text-sm";
const num = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Math.max(0, Number(v)));

export function RegrasTela() {
  const motor = useMotor();
  const { pastas, adicionar, remover } = usePastas();
  const [regras, setRegras] = useState<Regra[]>(carregarRegras);
  const [edit, setEdit] = useState<Regra | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [previa, setPrevia] = useState<ResultadoDeMovimento | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const salvar = (lista: Regra[]) => { setRegras(lista); guardarRegras(lista); };
  const gravarEdicao = () => {
    if (!edit) return;
    const e = validar(edit);
    setErros(e);
    if (e.length) return;
    salvar(regras.some((r) => r.id === edit.id) ? regras.map((r) => (r.id === edit.id ? edit : r)) : [...regras, edit]);
    setEdit(null);
  };
  const executar = async (simulacao: boolean) => {
    setErro(""); setMsg("");
    try {
      const r = await motor.aplicarRegras(pastas, regras.filter((x) => x.ativa), simulacao);
      if (simulacao) setPrevia(r);
      else { setPrevia(null); setMsg(`${r.movidos.length} arquivos organizados pelas regras.${r.falhas.length ? ` ${r.falhas.length} falharam.` : ""}`); }
    } catch (e) { setErro(e instanceof Error ? e.message : typeof e === "string" ? e : "Não deu certo."); }
  };
  const alternar = (c: Categoria) => setEdit((r) => r && { ...r, condicoes: { ...r.condicoes, categorias: r.condicoes.categorias.includes(c) ? r.condicoes.categorias.filter((x) => x !== c) : [...r.condicoes.categorias, c] } });
  const cond = (parte: Partial<Regra["condicoes"]>) => setEdit((r) => r && { ...r, condicoes: { ...r.condicoes, ...parte } });
  const mb = (v: number | null) => (v == null ? "" : String(Math.round(v / 1048576)));

  return (
    <div className="space-y-4">
      <Cartao titulo="Pastas onde as regras valem"><Pastas pastas={pastas} adicionar={adicionar} remover={remover} /></Cartao>

      <Cartao titulo="Suas regras" acao={<Botao variante="primario" onClick={() => { setErros([]); setEdit(novaRegra(`r${Date.now()}`)); }}>Nova regra</Botao>}>
        {regras.length === 0 ? <p className="text-sm text-suave">Nenhuma regra ainda. Ex.: “PDFs com ‘nota’ no nome → pasta Fiscal”.</p> : (
          <ul className="space-y-2">{regras.map((r, i) => (
            <li key={r.id} className="rounded-xl border border-borda p-3">
              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-medium">{i + 1}. {r.nome}</div><div className="text-xs text-suave">{frase(r)}</div></div>
                <label className="flex flex-none items-center gap-2 text-xs"><input type="checkbox" checked={r.ativa} onChange={(e) => salvar(regras.map((x) => (x.id === r.id ? { ...x, ativa: e.target.checked } : x)))} />ativa</label></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Botao className="!min-h-9 !px-3 text-xs" onClick={() => { setErros([]); setEdit(r); }}>Editar</Botao>
                <Botao className="!min-h-9 !px-3 text-xs" disabled={i === 0} onClick={() => { const l = [...regras]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; salvar(l); }}>Subir</Botao>
                <Botao variante="perigo" className="!min-h-9 !px-3 text-xs" onClick={() => salvar(regras.filter((x) => x.id !== r.id))}>Excluir</Botao>
              </div>
            </li>
          ))}</ul>
        )}
        <p className="mt-2 text-xs text-suave">A primeira regra ativa que combinar com o arquivo decide para onde ele vai: a ordem importa.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Botao disabled={!pastas.length || !regras.some((r) => r.ativa)} onClick={() => executar(true)}>Ver prévia</Botao>
        </div>
      </Cartao>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {msg && <Aviso tom="ok">{msg}</Aviso>}
      {previa && (
        <Cartao titulo="Prévia: nada foi movido ainda" acao={<Botao variante="primario" disabled={previa.movidos.length === 0} onClick={() => executar(false)}>Aplicar agora</Botao>}>
          {previa.movidos.length === 0 ? <p className="text-sm text-suave">Nenhum arquivo combina com as regras.</p> : (
            <ul className="max-h-64 space-y-1 overflow-auto text-sm">{previa.movidos.slice(0, 200).map((m) => <li key={m.de} className="break-all"><span className="text-suave">{nomeDoArquivo(m.de)}</span> → <span className="text-neon">{pastaDoArquivo(m.para)}</span> <span className="text-xs text-suave">({m.motivo})</span></li>)}</ul>
          )}
        </Cartao>
      )}

      {edit && (
        <Cartao titulo={regras.some((r) => r.id === edit.id) ? "Editar regra" : "Nova regra"}>
          <div className="space-y-3">
            <label className="block text-sm"><span className="text-suave">Nome</span><input className={campo} value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
            <fieldset><legend className="mb-1 text-sm text-suave">Quando o arquivo for do tipo…</legend>
              <div className="flex flex-wrap gap-2">{CATEGORIAS.map((c) => <button key={c.id} type="button" onClick={() => alternar(c.id)} aria-pressed={edit.condicoes.categorias.includes(c.id)} className={`min-h-9 rounded-full border px-3 text-xs ${edit.condicoes.categorias.includes(c.id) ? "border-neon bg-neon/15 text-neon" : "border-borda text-suave"}`}>{c.rotulo}</button>)}</div></fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm"><span className="text-suave">Extensões (separe por vírgula)</span><input className={campo} placeholder="pdf, docx" value={edit.condicoes.extensoes.join(", ")} onChange={(e) => cond({ extensoes: e.target.value.split(",").map((x) => x.trim().replace(/^\./, "")).filter(Boolean) })} /></label>
              <label className="block text-sm"><span className="text-suave">Nome contém</span><input className={campo} value={edit.condicoes.nome_contem ?? ""} onChange={(e) => cond({ nome_contem: e.target.value || null })} /></label>
              <label className="block text-sm"><span className="text-suave">Maior que (MB)</span><input className={campo} inputMode="numeric" value={mb(edit.condicoes.tamanho_min)} onChange={(e) => { const n = num(e.target.value); cond({ tamanho_min: n == null ? null : n * 1048576 }); }} /></label>
              <label className="block text-sm"><span className="text-suave">Menor que (MB)</span><input className={campo} inputMode="numeric" value={mb(edit.condicoes.tamanho_max)} onChange={(e) => { const n = num(e.target.value); cond({ tamanho_max: n == null ? null : n * 1048576 }); }} /></label>
              <label className="block text-sm"><span className="text-suave">Parado há (dias)</span><input className={campo} inputMode="numeric" value={edit.condicoes.parado_dias_min ?? ""} onChange={(e) => cond({ parado_dias_min: num(e.target.value) })} /></label>
            </div>
            <fieldset><legend className="mb-1 text-sm text-suave">Então…</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEdit({ ...edit, acao: { tipo: "mover", destino: edit.acao.tipo === "mover" ? edit.acao.destino : "" } })} aria-pressed={edit.acao.tipo === "mover"} className={`min-h-9 rounded-full border px-3 text-xs ${edit.acao.tipo === "mover" ? "border-neon bg-neon/15 text-neon" : "border-borda text-suave"}`}>Mover para uma pasta</button>
                <button type="button" onClick={() => setEdit({ ...edit, acao: { tipo: "quarentena" } })} aria-pressed={edit.acao.tipo === "quarentena"} className={`min-h-9 rounded-full border px-3 text-xs ${edit.acao.tipo === "quarentena" ? "border-neon bg-neon/15 text-neon" : "border-borda text-suave"}`}>Enviar à quarentena</button>
              </div>
              {edit.acao.tipo === "mover" && <input className={`${campo} mt-2`} placeholder="Pasta de destino (ex.: Fiscal ou D:\Arquivos)" value={edit.acao.destino} onChange={(e) => setEdit({ ...edit, acao: { tipo: "mover", destino: e.target.value } })} />}
            </fieldset>
            <p className="text-xs text-suave">{frase(edit)}</p>
            {erros.length > 0 && <Aviso tom="erro">{erros.join(" ")}</Aviso>}
            <div className="flex gap-2"><Botao variante="primario" onClick={gravarEdicao}>Salvar regra</Botao><Botao onClick={() => setEdit(null)}>Cancelar</Botao></div>
          </div>
        </Cartao>
      )}
    </div>
  );
}
