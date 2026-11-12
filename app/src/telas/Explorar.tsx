import { useCallback, useEffect, useMemo, useState } from "react";
import { useMotor } from "../estado";
import { bytes, nomeDoArquivo } from "../formato";
import type { Armazenamento, ItemDePasta, Movimento, PastaConhecida } from "../ponte";
import { Aviso, Botao, Cartao } from "../ui";
import { Icone, type NomeIcone } from "../icones";

const TIPO_ICONE = (c: string): NomeIcone => (["pasta", "imagens", "videos", "audios", "documentos", "planilhas", "apresentacoes", "compactados", "instaladores", "codigo"].includes(c) ? (c as NomeIcone) : "outros");
const COLECOES: { id: string; rotulo: string; icone: NomeIcone }[] = [
  { id: "recentes", rotulo: "Recentes", icone: "recentes" },
  { id: "imagens", rotulo: "Fotos", icone: "imagens" },
  { id: "audios", rotulo: "Música", icone: "audios" },
  { id: "videos", rotulo: "Vídeos", icone: "videos" },
  { id: "documentos", rotulo: "Documentos", icone: "documentos" },
  { id: "instaladores", rotulo: "Aplicativos e instaladores", icone: "instaladores" },
  { id: "compactados", rotulo: "Compactados", icone: "compactados" }
];
type Vista = { tipo: "inicio" } | { tipo: "pasta"; caminho: string } | { tipo: "colecao"; id: string; rotulo: string } | { tipo: "busca"; caminho: string; texto: string };

const quando = (s: number) => (s ? new Date(s * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "");
const nomeDe = (c: string) => nomeDoArquivo(c.replace(/[\\/]+$/, "")) || c;

/** Gerenciador de arquivos: armazenamentos, favoritos, coleções (recentes, fotos, música…), pastas e busca. */
export function Explorar() {
  const motor = useMotor();
  const [vista, setVista] = useState<Vista>({ tipo: "inicio" });
  const [armaz, setArmaz] = useState<Armazenamento[]>([]);
  const [favoritos, setFavoritos] = useState<PastaConhecida[]>([]);
  const [itens, setItens] = useState<ItemDePasta[]>([]);
  const [pai, setPai] = useState<string | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [ocultos, setOcultos] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [desfazer, setDesfazer] = useState<Movimento[]>([]);
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<{ caminho: string; nome: string } | null>(null);

  const raizesDeBusca = useMemo(() => (motor.plataforma === "android" ? armaz.map((a) => a.caminho) : favoritos.map((f) => f.caminho)), [motor.plataforma, armaz, favoritos]);

  useEffect(() => {
    void motor.armazenamentos().then(setArmaz).catch((e) => setErro(texto(e)));
    void motor.pastasConhecidas().then(setFavoritos).catch(() => undefined);
  }, [motor]);

  const carregar = useCallback(async (v: Vista) => {
    setCarregando(true); setErro(""); setMarcados(new Set());
    try {
      if (v.tipo === "pasta") {
        const l = await motor.listarPasta(v.caminho, ocultos);
        setItens(l.itens); setPai(l.pai); setTruncado(l.truncado);
      } else if (v.tipo === "colecao") {
        setPai(null); setTruncado(false);
        setItens(v.id === "recentes" ? await motor.recentes(raizesDeBusca, 80) : await motor.colecao(raizesDeBusca, v.id, 300));
      } else if (v.tipo === "busca") {
        setPai(null); setTruncado(false);
        setItens(await motor.buscarNome(v.caminho, v.texto));
      }
    } catch (e) { setErro(texto(e)); setItens([]); } finally { setCarregando(false); }
  }, [motor, ocultos, raizesDeBusca]);

  useEffect(() => { if (vista.tipo !== "inicio") void carregar(vista); }, [vista, carregar]);

  function texto(e: unknown) { return e instanceof Error ? e.message : typeof e === "string" ? e : "Não deu certo."; }
  const abrir = (i: ItemDePasta) => {
    if (i.pasta) { setBusca(""); setVista({ tipo: "pasta", caminho: i.caminho }); return; }
    if (motor.recursos.abrirArquivos) void motor.abrirArquivo(i.caminho).catch((e) => setErro(texto(e)));
    else setMsg("Esta versão não abre arquivos.");
  };
  const pastaAtual = vista.tipo === "pasta" ? vista.caminho : null;
  const trilha = useMemo(() => {
    if (!pastaAtual) return [] as { rotulo: string; caminho: string }[];
    const sep = pastaAtual.includes("\\") ? "\\" : "/";
    const partes = pastaAtual.split(/[\\/]+/).filter(Boolean);
    const unix = pastaAtual.startsWith("/");
    const lista = partes.map((p, i) => ({ rotulo: p, caminho: (unix ? sep : "") + partes.slice(0, i + 1).join(sep) + (!unix && i === 0 ? sep : "") }));
    // esconde os níveis acima do armazenamento (ex.: /storage/emulated)
    const raiz = armaz.map((a) => a.caminho.replace(/[\\/]+$/, "")).filter((r) => pastaAtual.startsWith(r)).sort((a, b) => b.length - a.length)[0];
    return raiz ? lista.filter((t) => t.caminho.replace(/[\\/]+$/, "").length >= raiz.length) : lista;
  }, [pastaAtual, armaz]);

  async function criarPasta() {
    if (!pastaAtual || nova === null) return;
    try { await motor.novaPasta(pastaAtual, nova); setNova(null); setMsg("Pasta criada."); void carregar(vista); } catch (e) { setErro(texto(e)); }
  }
  async function renomear() {
    if (!renomeando) return;
    try { await motor.renomear(renomeando.caminho, renomeando.nome); setRenomeando(null); setMsg("Renomeado."); void carregar(vista); } catch (e) { setErro(texto(e)); }
  }
  async function lixeira() {
    const lista = itens.filter((i) => marcados.has(i.caminho)).map((i) => i.caminho);
    if (!lista.length) { setErro("Marque o que quer mandar para a lixeira."); return; }
    try {
      const r = await motor.paraLixeira(lista);
      setDesfazer(r.movidos);
      setMsg(`${r.movidos.length} item(ns) na lixeira do Vindex (pasta “Vindex-Quarentena” ao lado). Dá para desfazer.${r.falhas.length ? ` ${r.falhas.length} falharam.` : ""}`);
      void carregar(vista);
    } catch (e) { setErro(texto(e)); }
  }
  async function voltar() { const r = await motor.desfazer(desfazer); setDesfazer([]); setMsg(`${r.movidos.length} item(ns) voltaram ao lugar.`); void carregar(vista); }
  const alternar = (c: string) => setMarcados((m) => { const n = new Set(m); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  // ------------------------------------------------------------ início (como o menu lateral do Solid)
  if (vista.tipo === "inicio") {
    return (
      <div className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Cartao titulo="Armazenamentos">
          {armaz.length === 0 && <p className="text-sm text-suave">Nenhum armazenamento encontrado ainda.</p>}
          <ul className="space-y-2">{armaz.map((a) => {
            const usado = a.total ? Math.round(((a.total - a.livre) / a.total) * 100) : 0;
            return (
              <li key={a.caminho}><button className="w-full rounded-xl border border-borda bg-white/5 p-3 text-left hover:bg-white/10" onClick={() => setVista({ tipo: "pasta", caminho: a.caminho })}>
                <div className="flex justify-between gap-2 text-sm"><span>💾 {a.rotulo}</span><span className="num text-xs text-suave">{bytes(a.livre)} livres de {bytes(a.total)}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-neon" style={{ width: `${usado}%` }} /></div>
              </button></li>
            );
          })}</ul>
        </Cartao>
        {favoritos.length > 0 && (
          <Cartao titulo="Favoritos">
            <ul className="grid gap-2 sm:grid-cols-2">{favoritos.map((f) => <li key={f.id}><button className="flex w-full items-center gap-3 rounded-xl border border-borda bg-white/5 px-3 py-3 text-left text-sm hover:bg-white/10" onClick={() => setVista({ tipo: "pasta", caminho: f.caminho })}><span className="text-neon"><Icone nome="pasta" tam={20} /></span>{f.rotulo}</button></li>)}</ul>
          </Cartao>
        )}
        <Cartao titulo="Coleções">
          <ul className="grid gap-2 sm:grid-cols-2">{COLECOES.map((c) => <li key={c.id}><button className="flex w-full items-center gap-3 rounded-xl border border-borda bg-white/5 px-3 py-3 text-left text-sm hover:bg-white/10" onClick={() => setVista({ tipo: "colecao", id: c.id, rotulo: c.rotulo })}><span className="text-neon"><Icone nome={c.icone} tam={20} /></span>{c.rotulo}</button></li>)}</ul>
        </Cartao>
      </div>
    );
  }

  const titulo = vista.tipo === "colecao" ? vista.rotulo : vista.tipo === "busca" ? `Busca: “${vista.texto}”` : nomeDe(vista.caminho);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Botao className="!min-h-10 !px-3" aria-label="Voltar" onClick={() => (pastaAtual && pai && armaz.every((a) => a.caminho.replace(/[\\/]+$/, "") !== pastaAtual.replace(/[\\/]+$/, "")) ? setVista({ tipo: "pasta", caminho: pai }) : setVista({ tipo: "inicio" }))}>←</Botao>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{titulo}</h2>
        <Botao className="!min-h-10 !px-3" aria-label="Início" onClick={() => setVista({ tipo: "inicio" })}>🏠</Botao>
      </div>
      {pastaAtual && (
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-xs text-suave">
          {trilha.map((t, i) => <span key={t.caminho} className="flex items-center gap-1">{i > 0 && "›"}<button className="rounded px-1 py-0.5 hover:text-texto" onClick={() => setVista({ tipo: "pasta", caminho: t.caminho })}>{t.rotulo}</button></span>)}
        </nav>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (busca.trim()) setVista({ tipo: "busca", caminho: pastaAtual ?? raizesDeBusca[0] ?? "", texto: busca.trim() }); }}>
        <input className="min-h-10 w-full rounded-xl border border-borda bg-white/5 px-3 text-sm outline-none focus:border-neon" placeholder={pastaAtual ? "Buscar nesta pasta…" : "Buscar pelo nome…"} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Botao disabled={!busca.trim()}>Buscar</Botao>
      </form>
      <div className="flex flex-wrap gap-2">
        {pastaAtual && <Botao onClick={() => setNova("")}>＋ Nova pasta</Botao>}
        {pastaAtual && <Botao onClick={() => setOcultos((o) => !o)}>{ocultos ? "Esconder ocultos" : "Mostrar ocultos"}</Botao>}
        {marcados.size > 0 && <Botao variante="perigo" onClick={lixeira}>Lixeira ({marcados.size})</Botao>}
        {desfazer.length > 0 && <Botao onClick={voltar}>Desfazer</Botao>}
      </div>
      {nova !== null && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void criarPasta(); }}>
          <input autoFocus className="min-h-10 w-full rounded-xl border border-borda bg-white/5 px-3 text-sm outline-none focus:border-neon" placeholder="Nome da pasta" value={nova} onChange={(e) => setNova(e.target.value)} />
          <Botao variante="primario">Criar</Botao><Botao type="button" onClick={() => setNova(null)}>Cancelar</Botao>
        </form>
      )}
      {renomeando && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void renomear(); }}>
          <input autoFocus className="min-h-10 w-full rounded-xl border border-borda bg-white/5 px-3 text-sm outline-none focus:border-neon" value={renomeando.nome} onChange={(e) => setRenomeando({ ...renomeando, nome: e.target.value })} />
          <Botao variante="primario">Renomear</Botao><Botao type="button" onClick={() => setRenomeando(null)}>Cancelar</Botao>
        </form>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {msg && <Aviso tom="ok">{msg}</Aviso>}
      {carregando && <p className="text-sm text-suave">Carregando…</p>}
      {!carregando && itens.length === 0 && !erro && <p className="text-sm text-suave">Nada por aqui.</p>}
      <ul className="divide-y divide-borda overflow-hidden rounded-2xl border border-borda">
        {itens.map((i) => (
          <li key={i.caminho} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5">
            <input type="checkbox" aria-label={`Marcar ${i.nome}`} className="h-5 w-5 flex-none accent-[#2ee6ff]" checked={marcados.has(i.caminho)} onChange={() => alternar(i.caminho)} />
            <button className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left" onClick={() => abrir(i)}>
              <span className="text-neon" aria-hidden="true"><Icone nome={i.pasta ? "pasta" : TIPO_ICONE(i.categoria)} tam={22} /></span>
              <span className="min-w-0"><span className="block truncate text-sm">{i.nome}</span>
                <span className="num block text-xs text-suave">{i.pasta ? `${i.itens} ${i.itens === 1 ? "item" : "itens"}` : bytes(i.bytes)}{i.modificado ? ` · ${quando(i.modificado)}` : ""}</span></span>
            </button>
            <button className="flex-none rounded-lg px-2 py-2 text-xs text-suave hover:text-texto" aria-label={`Renomear ${i.nome}`} onClick={() => setRenomeando({ caminho: i.caminho, nome: i.nome })}>✏️</button>
          </li>
        ))}
      </ul>
      {truncado && <p className="text-xs text-suave">Mostrando só os primeiros itens. Use a busca para achar o resto.</p>}
    </div>
  );
}
