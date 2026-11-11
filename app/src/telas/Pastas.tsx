import { useEffect, useState } from "react";
import { useMotor } from "../estado";
import type { PastaConhecida } from "../ponte";
import { Botao } from "../ui";

/** Seletor das pastas que o Vindex pode olhar (Downloads, Documentos…). Nada fora delas é tocado. */
export function Pastas({ pastas, adicionar, remover }: { pastas: string[]; adicionar: (p: string) => void; remover: (p: string) => void }) {
  const motor = useMotor();
  const [manual, setManual] = useState("");
  const [conhecidas, setConhecidas] = useState<PastaConhecida[]>([]);
  useEffect(() => { void motor.pastasConhecidas().then(setConhecidas).catch(() => undefined); }, [motor]);
  async function escolher() {
    const p = await motor.escolherPasta();
    if (p) adicionar(p);
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" onClick={escolher}>Escolher pasta</Botao>
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { adicionar(manual.trim()); setManual(""); } }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="ou digite o caminho (ex.: C:\Users\você\Downloads)" aria-label="Caminho da pasta" className="min-h-11 min-w-0 flex-1 rounded-xl border border-borda bg-black/20 px-3 text-sm" />
          <Botao type="submit">Adicionar</Botao>
        </form>
      </div>
      {conhecidas.some((c) => !pastas.includes(c.caminho)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-suave">Atalhos:{conhecidas.filter((c) => !pastas.includes(c.caminho)).map((c) => <button key={c.id} onClick={() => adicionar(c.caminho)} className="min-h-8 rounded-full border border-borda px-3 hover:text-texto">+ {c.rotulo}</button>)}</div>
      )}
      {pastas.length === 0 ? <p className="text-sm text-suave">Nenhuma pasta escolhida ainda.</p> : (
        <ul className="space-y-1">{pastas.map((p) => (
          <li key={p} className="flex items-center justify-between gap-2 rounded-xl border border-borda px-3 py-2 text-sm"><span className="min-w-0 break-all">{p}</span><button onClick={() => remover(p)} className="flex-none text-xs text-erro" aria-label={`Tirar ${p}`}>tirar</button></li>
        ))}</ul>
      )}
    </div>
  );
}
