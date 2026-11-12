import { useState, type ReactNode } from "react";
import { useMotor } from "../estado";
import { BUILD, haNovaVersao, procurarVersao, type InfoVersao } from "../atualizacao";
import { COR_PERSONALIZADA, CORES, ESTILOS, FORMATOS, ICONES, AJUSTES_PADRAO, corDoTema, hexParaHsl, hslParaHex } from "../ajustes";
import { useAjustes } from "../usarAjustes";
import { SERVIDOR } from "../conta";
import { Icone, type NomeIcone } from "../icones";
import { Aviso, Botao, Cartao, Interruptor } from "../ui";
import { ListaDePermissoes, usePermissoes } from "./Permissoes";

const Chave = ({ ligado, aoMudar, rotulo, detalhe }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string; detalhe: string }) => (
  <div className="flex items-center gap-3">
    <div className="min-w-0 flex-1"><div className="text-sm">{rotulo}</div><div className="text-xs text-suave">{detalhe}</div></div>
    <Interruptor ligado={ligado} aoMudar={aoMudar} rotulo={rotulo} />
  </div>
);

/** Ajustes do Vindex, no mesmo espírito dos da Vênus: aparência, atualizações, permissões. */
export function AjustesTela({ aoAtualizar, nova }: { aoAtualizar: (v: InfoVersao) => Promise<void>; nova: InfoVersao | null }) {
  const motor = useMotor();
  const [a, definir] = useAjustes();
  const { lista, pedir } = usePermissoes();
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const app = motor.plataforma === "android" ? "vindex-android" : "vindex-windows";
  const [parte, setParte] = useState<"geral" | "personalizar">(() => { try { return sessionStorage.getItem("vindex.ajustes.parte") === "personalizar" ? "personalizar" : "geral"; } catch { return "geral"; } });
  const trocar = (p: "geral" | "personalizar") => { setParte(p); try { sessionStorage.setItem("vindex.ajustes.parte", p); } catch { /* ok */ } };

  async function verificar() {
    setOcupado(true); setMsg(""); setErro("");
    try {
      const v = await procurarVersao(SERVIDOR, app);
      if (!v) throw new Error("Resposta inesperada do servidor.");
      if (haNovaVersao(BUILD, v.numero)) { setMsg(`Tem versão nova: 1.${v.numero}.`); await aoAtualizar(v); }
      else setMsg(BUILD ? `Você está na versão mais recente (1.${BUILD}).` : "Versão de desenvolvimento: sem comparação.");
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Ajustes" className="flex gap-2">
        {([["geral", "Geral"], ["personalizar", "Personalizar"]] as const).map(([id, r]) => (
          <button key={id} role="tab" aria-selected={parte === id} onClick={() => trocar(id)} className={`min-h-10 rounded-full px-5 text-sm transition ${parte === id ? "bg-neon/15 text-neon" : "border border-borda text-suave"}`}>{r}</button>
        ))}
      </div>
      {parte === "personalizar" && <Cartao titulo="Personalizar o Vindex" acao={<button type="button" onClick={() => definir({ cor: AJUSTES_PADRAO.cor, corPersonalizada: AJUSTES_PADRAO.corPersonalizada, formato: AJUSTES_PADRAO.formato, estilo: AJUSTES_PADRAO.estilo, icones: AJUSTES_PADRAO.icones })} className="min-h-9 rounded-lg px-2 text-xs text-suave hover:text-texto">Restaurar padrão</button>}>
        <Previa />

        <Secao titulo="Cor do app" dica="Muda os destaques, botões e brilhos em tudo.">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {CORES.map((c) => (
              <button key={c.id} type="button" onClick={() => definir({ cor: c.id })} aria-pressed={a.cor === c.id}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs transition ${a.cor === c.id ? "border-neon bg-neon/10 text-texto" : "border-borda text-suave hover:bg-white/5"}`}>
                <span className="size-7 rounded-full ring-2 ring-white/10" style={{ background: `linear-gradient(135deg, ${c.destaque}, ${c.secundaria})` }} />
                {c.nome}
              </button>
            ))}
            <button type="button" onClick={() => definir({ cor: COR_PERSONALIZADA })} aria-pressed={a.cor === COR_PERSONALIZADA}
              className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs transition ${a.cor === COR_PERSONALIZADA ? "border-neon bg-neon/10 text-texto" : "border-borda text-suave hover:bg-white/5"}`}>
              <span className="size-7 rounded-full ring-2 ring-white/10" style={{ background: "conic-gradient(#f87171, #fbbf24, #34d399, #22d3ee, #a78bfa, #f472b6, #f87171)" }} />
              Minha cor
            </button>
          </div>
          {a.cor === COR_PERSONALIZADA && <SeletorDeCor valor={a.corPersonalizada} aoMudar={(v) => definir({ corPersonalizada: v })} />}
        </Secao>

        <Secao titulo="Botões" dica="Formato e estilo dos botões principais.">
          <div className="mb-3 grid grid-cols-3 gap-2" role="group" aria-label="Formato dos botões">
            {FORMATOS.map((f) => (
              <button key={f.id} type="button" onClick={() => definir({ formato: f.id })} aria-pressed={a.formato === f.id}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs transition ${a.formato === f.id ? "border-neon bg-neon/10 text-texto" : "border-borda text-suave hover:bg-white/5"}`}>
                <span className="h-5 w-12 border-2 border-current" style={{ borderRadius: f.raio === "9999px" ? "9999px" : f.id === "reto" ? "3px" : "8px" }} />
                {f.nome}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Estilo dos botões">
            {ESTILOS.map((e) => (
              <button key={e.id} type="button" onClick={() => definir({ estilo: e.id })} aria-pressed={a.estilo === e.id}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs transition ${a.estilo === e.id ? "border-neon bg-neon/10 text-texto" : "border-borda text-suave hover:bg-white/5"}`}>
                <span className="h-5 w-12 rounded-md" style={e.id === "solido" ? { background: "var(--color-neon)" } : e.id === "degrade" ? { background: "linear-gradient(135deg, var(--color-neon), var(--color-magenta))" } : { border: "2px solid var(--color-neon)" }} />
                {e.nome}
              </button>
            ))}
          </div>
        </Secao>

        <Secao titulo="Ícones" dica="A espessura e o jeito do traço." ultima>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{ICONES.map((p) => (
            <button key={p.id} type="button" onClick={() => definir({ icones: p.id })} aria-pressed={a.icones === p.id}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-xs transition ${a.icones === p.id ? "border-neon bg-neon/10 text-texto" : "border-borda text-suave hover:bg-white/5"}`}>
              <span className="flex gap-1 text-texto">{(["otimizar", "arquivos", "seguranca"] as NomeIcone[]).map((n) => <PrevIcone key={n} id={p.id} nome={n} />)}</span>{p.nome}
            </button>
          ))}</div>
        </Secao>
      </Cartao>}

      {parte === "geral" && <>
      <Cartao titulo="Atualizações">
        <p className="text-sm">Versão instalada: <b className="num">{BUILD ? `1.${BUILD}` : "desenvolvimento"}</b></p>
        <div className="mt-3 space-y-3">
          <Chave ligado={a.autoAtualizar} aoMudar={(v) => definir({ autoAtualizar: v })} rotulo="Atualizar sozinho" detalhe={motor.recursos.atualizaSozinho ? "Procura versão nova ao abrir e a cada 6 horas, baixa e já abre a instalação." : "Avisa quando tem versão nova e abre o download."} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Botao variante="primario" disabled={ocupado} onClick={() => void verificar()}><Icone nome="atualizar" tam={18} />{ocupado ? "Procurando…" : "Verificar atualizações"}</Botao>
          {nova && <Botao onClick={() => void aoAtualizar(nova)}>Instalar 1.{nova.numero}</Botao>}
        </div>
        {msg && <div className="mt-3"><Aviso tom="ok">{msg}</Aviso></div>}
        {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
        {nova?.notas && <p className="mt-2 whitespace-pre-line text-xs text-suave">{nova.notas}</p>}
      </Cartao>

      <Cartao titulo="Organização">
        <Chave ligado={a.autoOrganizar} aoMudar={(v) => definir({ autoOrganizar: v })} rotulo="Organizar pastas sozinho" detalhe="Arruma por categoria as pastas escolhidas (Downloads e Documentos de início) a cada 6 horas. Você pode desfazer na hora." />
        {motor.recursos.extrair && <Chave ligado={a.autoExtrair} aoMudar={(v) => definir({ autoExtrair: v })} rotulo="Extrair direto ao tocar" detalhe="Ao tocar num arquivo compactado (ZIP, 7z, RAR…) no Explorar, o Vindex já extrai para uma pasta com o nome dele. Desligado, ele mostra o conteúdo e pergunta." />}
      </Cartao>

      {motor.recursos.permissoes && (
        <Cartao titulo="Permissões do Android">{lista ? <ListaDePermissoes lista={lista} pedir={(id) => void pedir(id)} /> : <p className="text-sm text-suave">Conferindo…</p>}</Cartao>
      )}
      </>}
    </div>
  );
}

function PrevIcone({ id, nome }: { id: string; nome: NomeIcone }) {
  const p = ICONES.find((i) => i.id === id)!;
  return <span style={{ ["--icone-traco" as string]: p.traco, ["--icone-ponta" as string]: p.ponta, ["--icone-junta" as string]: p.junta, ["--icone-preench" as string]: p.preench }}><Icone nome={nome} tam={20} /></span>;
}

function Secao({ titulo, dica, children, ultima = false }: { titulo: string; dica: string; children: ReactNode; ultima?: boolean }) {
  return (
    <div className={ultima ? "" : "mb-5"}>
      <div className="mb-2"><div className="text-sm font-medium">{titulo}</div><div className="text-xs text-suave">{dica}</div></div>
      {children}
    </div>
  );
}

/** Mostra na hora como ficam botão, interruptor e ícones com a escolha atual. */
function Previa() {
  const [lig, setLig] = useState(true);
  return (
    <div className="mb-5 rounded-xl border border-borda bg-fundo/60 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-suave">Prévia</div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="primario" type="button"><Icone nome="otimizar" tam={18} />Otimizar</Botao>
        <Botao type="button"><Icone nome="arquivos" tam={18} />Arquivos</Botao>
        <Interruptor ligado={lig} aoMudar={setLig} rotulo="Exemplo de interruptor" />
        <span className="flex gap-2 text-neon"><Icone nome="seguranca" tam={22} /><Icone nome="rede" tam={22} /></span>
      </div>
    </div>
  );
}

/** Escolha de cor própria: matiz, brilho e código, com a cor sempre visível. */
function SeletorDeCor({ valor, aoMudar }: { valor: string; aoMudar: (hex: string) => void }) {
  const [h, s, l] = hexParaHsl(valor);
  const [texto, setTexto] = useState(valor);
  const mudar = (hh: number, ss: number, ll: number) => { const hex = hslParaHex(hh, ss, ll); setTexto(hex); aoMudar(hex); };
  const usada = corDoTema({ ...AJUSTES_PADRAO, cor: COR_PERSONALIZADA, corPersonalizada: valor }).destaque;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-borda bg-fundo/60 p-3">
      <div className="flex items-center gap-3">
        <span className="size-10 flex-none rounded-xl ring-2 ring-white/10" style={{ background: usada }} />
        <input value={texto} onChange={(e) => { setTexto(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) aoMudar(e.target.value.toLowerCase()); }}
          onBlur={() => setTexto(valor)} maxLength={7} spellCheck={false} aria-label="Código da cor" className="num min-h-11 w-28 rounded-xl border border-borda bg-transparent px-3 text-sm uppercase" />
        {usada.toLowerCase() !== valor.toLowerCase() && <span className="text-xs text-suave">Clareei um pouco para ler no fundo escuro.</span>}
      </div>
      <Controle rotulo="Tom" valor={h} max={360} aoMudar={(v) => mudar(v, Math.max(s, 0.4), Math.max(l, 0.5))} fundo="linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" />
      <Controle rotulo="Intensidade" valor={Math.round(s * 100)} max={100} aoMudar={(v) => mudar(h, v / 100, l)} fundo={`linear-gradient(90deg, ${hslParaHex(h, 0, l)}, ${hslParaHex(h, 1, l)})`} />
      <Controle rotulo="Brilho" valor={Math.round(l * 100)} min={50} max={90} aoMudar={(v) => mudar(h, s, v / 100)} fundo={`linear-gradient(90deg, ${hslParaHex(h, s, 0.5)}, ${hslParaHex(h, s, 0.9)})`} />
    </div>
  );
}

function Controle({ rotulo, valor, aoMudar, fundo, min = 0, max }: { rotulo: string; valor: number; aoMudar: (v: number) => void; fundo: string; min?: number; max: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-suave">{rotulo}</span>
      <input type="range" min={min} max={max} value={Math.min(Math.max(valor, min), max)} onChange={(e) => aoMudar(Number(e.target.value))} aria-label={rotulo}
        className="h-3 w-full cursor-pointer appearance-none rounded-full" style={{ background: fundo }} />
    </label>
  );
}
