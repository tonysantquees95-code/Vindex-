import { useCallback, useEffect, useState } from "react";
import { useMotor } from "../estado";
import { bytes, nomeDoArquivo } from "../formato";
import type { ConteudoCompactado, InicioPeloMenu, ResultadoExtracao } from "../ponte";
import { Aviso, Botao, Cartao } from "../ui";
import { PainelCompactado } from "./Compactados";
import type { ItemDePasta } from "../ponte";

const campo = "min-h-11 w-full rounded-xl border border-borda bg-black/20 px-3 text-sm";

/** Descompactar como no WinRAR: escolhe o arquivo, vê o conteúdo, escolhe para onde vai e extrai. */
export function Descompactar({ inicio, aoUsarInicio }: { inicio: InicioPeloMenu | null; aoUsarInicio: () => void }) {
  const motor = useMotor();
  if (motor.plataforma === "android") return <DescompactarAndroid />;
  return <DescompactarWindows inicio={inicio} aoUsarInicio={aoUsarInicio} />;
}

/** No Android: lista os compactados do aparelho; tocar em um abre o conteúdo e extrai. */
function DescompactarAndroid() {
  const motor = useMotor();
  const [lista, setLista] = useState<ItemDePasta[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    setErro("");
    try { const raizes = (await motor.armazenamentos()).map((a) => a.caminho); setLista(await motor.colecao(raizes, "compactados", 300)); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLista([]); }
  }, [motor]);
  useEffect(() => { void carregar(); }, [carregar]);
  return (
    <div className="space-y-4">
      {aberto && <PainelCompactado key={aberto} caminho={aberto} aoFechar={() => setAberto(null)} />}
      <Cartao titulo="Arquivos compactados no aparelho">
        <p className="mb-2 text-xs text-suave">Toque em um para ver o conteúdo e extrair. Funciona com ZIP, 7z, RAR, TAR, TAR.GZ, GZ, BZ2 e XZ — sem precisar de outro app. Também dá para tocar neles direto no Explorar.</p>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {lista === null ? <p className="text-sm text-suave">Procurando…</p> : lista.length === 0 ? <p className="text-sm text-suave">Nenhum arquivo compactado encontrado.</p> : (
          <ul className="space-y-1.5">
            {lista.map((i) => (
              <li key={i.caminho}><button className="w-full rounded-xl border border-borda bg-white/5 p-3 text-left hover:bg-white/10" onClick={() => setAberto(i.caminho)}>
                <div className="break-all text-sm">{i.nome}</div><div className="text-xs text-suave">{bytes(i.bytes)}</div>
              </button></li>
            ))}
          </ul>
        )}
        <div className="mt-3"><Botao onClick={() => void carregar()}>Procurar de novo</Botao></div>
      </Cartao>
    </div>
  );
}

function DescompactarWindows({ inicio, aoUsarInicio }: { inicio: InicioPeloMenu | null; aoUsarInicio: () => void }) {
  const motor = useMotor();
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [conteudo, setConteudo] = useState<ConteudoCompactado | null>(null);
  const [resultado, setResultado] = useState<ResultadoExtracao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const abrir = useCallback(async (arquivo: string) => {
    setOrigem(arquivo); setErro(""); setResultado(null); setConteudo(null);
    try {
      setDestino(await motor.pastaSugerida(arquivo));
      setConteudo(await motor.listarCompactado(arquivo));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }, [motor]);

  async function extrair(arq = origem, dest = destino) {
    setOcupado(true); setErro("");
    try { setResultado(await motor.extrair(arq, dest)); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    setOcupado(false);
  }

  // aberto pelo menu do botão direito do Windows
  useEffect(() => {
    if (!inicio) return;
    aoUsarInicio();
    void (async () => {
      await abrir(inicio.arquivo);
      if (inicio.modo === "aqui") {
        try { await extrair(inicio.arquivo, await motor.pastaSugerida(inicio.arquivo)); } catch { /* o erro já aparece */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio]);

  if (!motor.recursos.extrair) return <Cartao titulo="Descompactar"><p className="text-sm text-suave">A descompactação está disponível no Vindex para Windows.</p></Cartao>;

  return (
    <div className="space-y-4">
      <Cartao titulo="Arquivo compactado">
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="primario" onClick={async () => { const a = await motor.escolherArquivo(); if (a) await abrir(a); }}>Escolher arquivo…</Botao>
          <span className="min-w-0 break-all text-sm text-suave">{origem || "ZIP, TAR, TAR.GZ, TGZ ou GZ. Dica: clique com o botão direito no arquivo e escolha “Extrair com o Vindex…”."}</span>
        </div>
        {conteudo && (
          <div className="mt-3">
            <p className="text-sm">{nomeDoArquivo(origem)} · <span className="text-suave">{conteudo.itens} arquivos · {bytes(conteudo.bytes)} descompactado</span></p>
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto rounded-xl bg-black/20 p-2 text-xs text-suave">{conteudo.nomes.map((n) => <li key={n} className="break-all">{n}</li>)}{conteudo.itens > conteudo.nomes.length && <li>…e mais {conteudo.itens - conteudo.nomes.length}</li>}</ul>
          </div>
        )}
      </Cartao>

      {conteudo && (
        <Cartao titulo="Para onde extrair?">
          <div className="space-y-2">
            <input className={campo} value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Pasta de destino" />
            <div className="flex flex-wrap gap-2">
              <Botao onClick={async () => { const p = await motor.escolherPasta(); if (p) setDestino(p); }}>Escolher outra pasta…</Botao>
              <Botao variante="primario" disabled={ocupado || !destino.trim()} onClick={() => void extrair()}>{ocupado ? "Extraindo…" : "Extrair"}</Botao>
            </div>
            <p className="text-xs text-suave">Nada é sobrescrito: se já existir um arquivo com o mesmo nome, o novo ganha “(1)” no final.</p>
          </div>
        </Cartao>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado && (
        <Aviso tom="ok">
          <div>{resultado.arquivos} arquivos extraídos ({bytes(resultado.bytes)}) em {resultado.destino}.</div>
          {resultado.pulados.length > 0 && <div className="mt-1 text-xs">{resultado.pulados.length} itens inseguros foram ignorados.</div>}
          {motor.recursos.abrirPasta && <Botao className="mt-2 !min-h-9 !px-3 text-xs" onClick={() => void motor.abrirPasta(resultado.destino)}>Abrir a pasta</Botao>}
        </Aviso>
      )}
    </div>
  );
}
