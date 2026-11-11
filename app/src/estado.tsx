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
export function usePastas() {
  const [pastas, setPastas] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(pastas)); } catch { /* ok */ } }, [pastas]);
  return { pastas, adicionar: (p: string) => setPastas((l) => (l.includes(p) ? l : [...l, p])), remover: (p: string) => setPastas((l) => l.filter((x) => x !== p)) };
}
