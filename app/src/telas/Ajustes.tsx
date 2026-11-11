import { useState } from "react";
import { useMotor } from "../estado";
import { BUILD, haNovaVersao, procurarVersao, type InfoVersao } from "../atualizacao";
import { CORES, ICONES } from "../ajustes";
import { useAjustes } from "../usarAjustes";
import { SERVIDOR } from "../conta";
import { Icone, type NomeIcone } from "../icones";
import { Aviso, Botao, Cartao } from "../ui";
import { ListaDePermissoes, usePermissoes } from "./Permissoes";

const Chave = ({ ligado, aoMudar, rotulo, detalhe }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string; detalhe: string }) => (
  <div className="flex items-center gap-3">
    <div className="min-w-0 flex-1"><div className="text-sm">{rotulo}</div><div className="text-xs text-suave">{detalhe}</div></div>
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => aoMudar(!ligado)} className={`relative h-8 w-14 flex-none rounded-full transition-colors ${ligado ? "bg-neon" : "bg-white/15"}`}>
      <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-transform ${ligado ? "translate-x-7" : "translate-x-1"}`} />
    </button>
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
      <Cartao titulo="Aparência">
        <div className="mb-1 text-xs text-suave">Cor</div>
        <div className="mb-4 flex flex-wrap gap-2">{CORES.map((c) => (
          <button key={c.id} onClick={() => definir({ cor: c.id })} aria-pressed={a.cor === c.id} aria-label={c.nome} title={c.nome}
            className={`grid size-11 place-items-center rounded-full border-2 ${a.cor === c.id ? "border-texto" : "border-transparent"}`} style={{ background: `linear-gradient(135deg, ${c.destaque}, ${c.secundaria})` }} />
        ))}</div>
        <div className="mb-1 text-xs text-suave">Ícones</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{ICONES.map((p) => (
          <button key={p.id} onClick={() => definir({ icones: p.id })} aria-pressed={a.icones === p.id}
            className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-xs ${a.icones === p.id ? "border-neon text-neon" : "border-borda text-suave"}`}>
            <span className="flex gap-1 text-texto">{(["otimizar", "arquivos", "seguranca"] as NomeIcone[]).map((n) => <PrevIcone key={n} id={p.id} nome={n} />)}</span>{p.nome}
          </button>
        ))}</div>
      </Cartao>

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
      </Cartao>

      {motor.recursos.permissoes && (
        <Cartao titulo="Permissões do Android">{lista ? <ListaDePermissoes lista={lista} pedir={(id) => void pedir(id)} /> : <p className="text-sm text-suave">Conferindo…</p>}</Cartao>
      )}
    </div>
  );
}

function PrevIcone({ id, nome }: { id: string; nome: NomeIcone }) {
  const p = ICONES.find((i) => i.id === id)!;
  return <span style={{ ["--icone-traco" as string]: p.traco, ["--icone-ponta" as string]: p.ponta, ["--icone-junta" as string]: p.junta, ["--icone-preench" as string]: p.preench }}><Icone nome={nome} tam={20} /></span>;
}
