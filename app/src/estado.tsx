import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { criarMotor, type Motor } from "./ponte";

const Ctx = createContext<Motor | null>(null);

export function ProvedorDoMotor({ children }: { children: ReactNode }) {
  const [motor, setMotor] = useState<Motor | null>(null);
  useEffect(() => { void criarMotor().then(setMotor); }, []);
  if (!motor) return <div className="grid min-h-dvh place-items-center text-suave">Iniciando…</div>;
  return <Ctx.Provider value={motor}>{children}</Ctx.Provider>;
}
export function useMotor(): Motor {
  const m = useContext(Ctx);
  if (!m) throw new Error("Motor não iniciado");
  return m;
}

const CHAVE = "vindex.pastas";
const CHAVE_INICIAL = "vindex.pastas.iniciadas";
export function usePastas() {
  const motor = useMotor();
  const [pastas, setPastas] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? "[]"); } catch { return []; } });
  // primeira vez: já deixa a pasta Downloads escolhida, que é onde a bagunça costuma estar
  useEffect(() => {
    let jaFez = false;
    try { jaFez = localStorage.getItem(CHAVE_INICIAL) === "1"; } catch { /* ok */ }
    if (jaFez || pastas.length) return;
    void motor.pastasConhecidas().then((l) => {
      const d = l.find((p) => p.id === "downloads");
      if (d) setPastas((atual) => (atual.length ? atual : [d.caminho]));
      try { localStorage.setItem(CHAVE_INICIAL, "1"); } catch { /* ok */ }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(pastas)); } catch { /* ok */ } }, [pastas]);
  return { pastas, adicionar: (p: string) => setPastas((l) => (l.includes(p) ? l : [...l, p])), remover: (p: string) => setPastas((l) => l.filter((x) => x !== p)) };
}
