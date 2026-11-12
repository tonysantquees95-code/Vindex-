import { useCallback, useEffect, useRef, useState } from "react";
import { useMotor } from "../estado";
import { bytes, nomeDoArquivo, pastaDeExtracao, pastaDoArquivo } from "../formato";
import type { ConteudoCompactado, ProgressoArquivo, ResultadoExtracao } from "../ponte";
import { Aviso, Botao, Cartao } from "../ui";

const campo = "min-h-11 w-full rounded-xl border border-borda bg-black/20 px-3 text-sm";
const texto = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "Não deu certo.");

/** Pergunta o andamento enquanto um trabalho longo roda (o plugin responde em outro fio). */
function useAndamento(ativo: boolean) {
  const motor = useMotor();
  const [p, setP] = useState<ProgressoArquivo | null>(null);
  useEffect(() => {
    if (!ativo || !motor.progressoArquivo) { setP(null); return; }
    let vivo = true;
    const t = window.setInterval(() => { void motor.progressoArquivo?.().then((x) => { if (vivo) setP(x); }).catch(() => undefined); }, 600);
    return () => { vivo = false; window.clearInterval(t); };
  }, [ativo, motor]);
  return p;
}

function Barra({ p, rotulo }: { p: ProgressoArquivo | null; rotulo: string }) {
  const pct = p && p.total > 0 ? Math.min(100, Math.round((p.feitos / p.total) * 100)) : null;
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm"><span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neon/30 border-t-neon" />{rotulo}{pct !== null ? ` · ${pct}%` : "…"}</div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-neon transition-all ${pct === null ? "w-1/3 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} /></div>
      {p?.atual && <div className="truncate text-xs text-suave">{p.atual}{p.total > 0 ? ` · ${bytes(p.feitos)} de ${bytes(p.total)}` : ""}</div>}
    </div>
  );
}

/** Um arquivo compactado aberto: mostra o que tem dentro e extrai aqui ou em outra pasta, com senha se precisar. */
export function PainelCompactado({ caminho, aoFechar, aoExtrair, direto = false }: { caminho: string; aoFechar: () => void; aoExtrair?: (pasta: string) => void; direto?: boolean }) {
  const motor = useMotor();
  const [conteudo, setConteudo] = useState<ConteudoCompactado | null>(null);
  const [destino, setDestino] = useState(pastaDeExtracao(caminho));
  const [senha, setSenha] = useState("");
  const [pedeSenha, setPedeSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoExtracao | null>(null);
  const andamento = useAndamento(ocupado);
  const iniciou = useRef(false);

  const ler = useCallback(async (s = senha) => {
    setErro(""); setPedeSenha(false);
    try { setConteudo(await motor.listarCompactado(caminho, s)); } catch (e) { const m = texto(e); setErro(m); if (/senha/i.test(m)) setPedeSenha(true); }
  }, [motor, caminho, senha]);

  const extrair = useCallback(async (dest: string, s = senha) => {
    setOcupado(true); setErro(""); setResultado(null);
    try { const r = await motor.extrair(caminho, dest, s); setResultado(r); aoExtrair?.(r.destino); }
    catch (e) { const m = texto(e); setErro(m); if (/senha/i.test(m)) setPedeSenha(true); }
    setOcupado(false);
  }, [motor, caminho, senha, aoExtrair]);

  useEffect(() => {
    if (iniciou.current) return; iniciou.current = true;
    void ler();
    if (direto) void extrair(pastaDeExtracao(caminho));
  }, [ler, extrair, direto, caminho]);

  return (
    <Cartao titulo={nomeDoArquivo(caminho)}>
      <div className="space-y-3">
        {conteudo && (
          <div>
            <p className="text-sm text-suave">{conteudo.itens} {conteudo.itens === 1 ? "arquivo" : "arquivos"} · {bytes(conteudo.bytes)} descompactado · {conteudo.formato.toUpperCase()}</p>
            <ul className="mt-2 max-h-36 space-y-0.5 overflow-auto rounded-xl bg-black/20 p-2 text-xs text-suave">
              {conteudo.nomes.slice(0, 80).map((n) => <li key={n} className="break-all">{n}</li>)}
              {conteudo.itens > Math.min(80, conteudo.nomes.length) && <li>…e mais {conteudo.itens - Math.min(80, conteudo.nomes.length)}</li>}
            </ul>
          </div>
        )}
        {pedeSenha && (
          <div className="flex gap-2">
            <input className={campo} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha do arquivo" aria-label="Senha do arquivo" />
            <Botao variante="primario" onClick={() => { void ler(senha); }}>Abrir</Botao>
          </div>
        )}
        {!ocupado && !resultado && conteudo && (
          <div className="space-y-2">
            <input className={campo} value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Pasta de destino" />
            <div className="flex flex-wrap gap-2">
              <Botao variante="primario" disabled={!destino.trim()} onClick={() => void extrair(destino)}>Extrair aqui</Botao>
              <Botao onClick={async () => { const p = await motor.escolherPasta(); if (p) { setDestino(p); await extrair(p); } }}>Extrair em outra pasta…</Botao>
              {motor.recursos.abrirArquivos && <Botao onClick={() => void motor.abrirArquivo(caminho).catch((e) => setErro(texto(e)))}>Abrir com outro app</Botao>}
            </div>
            <p className="text-xs text-suave">Nada é sobrescrito: se já existir um arquivo com o mesmo nome, o novo ganha “(1)”.</p>
          </div>
        )}
        {ocupado && (
          <div className="space-y-2">
            <Barra p={andamento} rotulo="Extraindo — jogos grandes demoram, não travou" />
            {motor.cancelarArquivo && <Botao onClick={() => void motor.cancelarArquivo?.()}>Cancelar</Botao>}
          </div>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {resultado && (
          <Aviso tom="ok">
            <div>{resultado.arquivos} arquivos extraídos ({bytes(resultado.bytes)}) em {resultado.destino}.</div>
            {resultado.pulados.length > 0 && <div className="mt-1 text-xs">{resultado.pulados.length} itens inseguros foram ignorados.</div>}
          </Aviso>
        )}
        <div className="flex justify-end"><Botao onClick={aoFechar}>{resultado ? "Pronto" : "Fechar"}</Botao></div>
      </div>
    </Cartao>
  );
}

/** Compactar o que está marcado: ZIP, 7z ou TAR.GZ. */
export function PainelCompactar({ caminhos, aoFechar, aoCriar }: { caminhos: string[]; aoFechar: () => void; aoCriar?: () => void }) {
  const motor = useMotor();
  const pasta = pastaDoArquivo(caminhos[0] ?? "");
  const sep = pasta.includes("\\") ? "\\" : "/";
  const [formato, setFormato] = useState<"zip" | "7z" | "tgz">("zip");
  const [nome, setNome] = useState(caminhos.length === 1 ? nomeDoArquivo(caminhos[0]).replace(/\.[^.]+$/, "") : "Arquivos");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<{ destino: string; arquivos: number; bytes: number } | null>(null);
  const andamento = useAndamento(ocupado);
  const ext = formato === "tgz" ? "tar.gz" : formato;

  async function criar() {
    if (!motor.compactar) return;
    setOcupado(true); setErro("");
    try { const r = await motor.compactar(caminhos, `${pasta}${sep}${nome.trim() || "Arquivos"}.${ext}`, formato); setFeito(r); aoCriar?.(); }
    catch (e) { setErro(texto(e)); }
    setOcupado(false);
  }

  return (
    <Cartao titulo={`Compactar ${caminhos.length} ${caminhos.length === 1 ? "item" : "itens"}`}>
      <div className="space-y-3">
        {!ocupado && !feito && (
          <>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Formato">
              {([["zip", "ZIP (abre em qualquer lugar)"], ["7z", "7z (menor)"], ["tgz", "TAR.GZ"]] as const).map(([id, r]) => (
                <button key={id} role="radio" aria-checked={formato === id} onClick={() => setFormato(id)} className={`min-h-10 rounded-xl px-4 text-sm ${formato === id ? "bg-neon/15 text-neon" : "border border-borda text-suave"}`}>{r}</button>
              ))}
            </div>
            <div className="flex items-center gap-2"><input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do arquivo" /><span className="text-sm text-suave">.{ext}</span></div>
            <div className="flex gap-2"><Botao variante="primario" onClick={() => void criar()}>Compactar</Botao><Botao onClick={aoFechar}>Cancelar</Botao></div>
          </>
        )}
        {ocupado && (
          <div className="space-y-2">
            <Barra p={andamento} rotulo="Compactando" />
            {motor.cancelarArquivo && <Botao onClick={() => void motor.cancelarArquivo?.()}>Cancelar</Botao>}
          </div>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {feito && <><Aviso tom="ok">{feito.arquivos} arquivos em {feito.destino} ({bytes(feito.bytes)}).</Aviso><div className="flex justify-end"><Botao onClick={aoFechar}>Pronto</Botao></div></>}
      </div>
    </Cartao>
  );
}
