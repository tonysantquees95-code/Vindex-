import { useState } from "react";
import { useMotor } from "./estado";
import { Aviso } from "./ui";
import { Arquivos } from "./telas/Arquivos";
import { Painel } from "./telas/Painel";
import { RegrasTela } from "./telas/Regras";

const ABAS = [
  { id: "painel", rotulo: "Painel", tela: Painel },
  { id: "arquivos", rotulo: "Arquivos", tela: Arquivos },
  { id: "regras", rotulo: "Regras", tela: RegrasTela }
] as const;

export function App() {
  const motor = useMotor();
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("painel");
  const Atual = ABAS.find((a) => a.id === aba)!.tela;
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-neon/15 text-neon brilho">V</span><div><div className="text-lg font-semibold leading-tight tracking-wide">Vindex</div><div className="text-[11px] text-suave">Vetorial Tech</div></div></div>
        <nav aria-label="Seções" className="hidden gap-1 sm:flex">{ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`min-h-10 rounded-xl px-4 text-sm ${aba === a.id ? "bg-neon/15 text-neon" : "text-suave hover:text-texto"}`}>{a.rotulo}</button>)}</nav>
      </header>
      {motor.plataforma === "demonstracao" && <div className="mb-3"><Aviso>Modo demonstração: os números são de exemplo. Instale o Vindex no Windows ou no Android para ler o seu aparelho de verdade.</Aviso></div>}
      <main className="flex-1"><Atual /></main>
      <nav aria-label="Seções" className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t border-borda bg-fundo/95 backdrop-blur sm:hidden">{ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`min-h-14 text-sm ${aba === a.id ? "text-neon" : "text-suave"}`}>{a.rotulo}</button>)}</nav>
    </div>
  );
}
