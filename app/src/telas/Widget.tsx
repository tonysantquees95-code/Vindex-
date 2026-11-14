import { useCallback, useEffect, useRef, useState } from "react";
import { useMotor } from "../estado";
import { bytes, tomDoUso } from "../formato";
import type { Diagnostico } from "../ponte";

const COR = { ok: "#34d399", aviso: "#fbbf24", erro: "#f87171" } as const;

function Barra({ rotulo, valor, texto }: { rotulo: string; valor: number; texto: string }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px]"><span className="text-white/70">{rotulo}</span><span className="font-bold tabular-nums">{texto}</span></div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-all" style={{ width: v + "%", background: COR[tomDoUso(v)] }} /></div>
    </div>
  );
}

/** Janelinha sempre visível (Windows): CPU, RAM, temperatura e bateria ao vivo, com "Liberar RAM". Arraste pelo topo. */
export function Widget() {
  const motor = useMotor();
  const [d, setD] = useState<Diagnostico | null>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const lendo = useRef(false);

  const ler = useCallback(async () => {
    if (lendo.current) return;
    lendo.current = true;
    try { setD(await motor.diagnostico(1)); } catch { /* tenta de novo no próximo ciclo */ } finally { lendo.current = false; }
  }, [motor]);
  useEffect(() => { void ler(); const t = setInterval(() => void ler(), 2500); return () => clearInterval(t); }, [ler]);
  useEffect(() => { document.body.style.background = "#070b14"; document.body.style.overflow = "hidden"; }, []);

  const liberar = async () => {
    setOcupado(true); setMsg("");
    try { const r = await motor.otimizarMemoria(); setMsg(r.suportado ? (r.liberado_bytes > 0 ? `Voltaram ${bytes(r.liberado_bytes)} de RAM` : "RAM já estava enxuta") : r.nota); await ler(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(false); setTimeout(() => setMsg(""), 4000); }
  };
  const fechar = async () => { try { const { getCurrentWindow } = await import("@tauri-apps/api/window"); await getCurrentWindow().close(); } catch { window.close(); } };

  const cpu = d ? Math.min(100, d.cpu_uso / Math.max(1, d.cpu_nucleos)) : 0;
  const temp = d?.temperatura_max;
  return (
    <div className="flex h-dvh select-none flex-col border border-cyan-300/30 bg-[#070b14] text-white" style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}>
      <div data-tauri-drag-region className="flex cursor-move items-center justify-between px-3 py-1.5 text-[11px] font-bold tracking-wide text-cyan-200">
        <span data-tauri-drag-region>VINDEX · DESEMPENHO</span>
        <button aria-label="Fechar widget" className="px-1 text-white/60 hover:text-white" onClick={() => void fechar()}>✕</button>
      </div>
      <div className="flex-1 px-3 pt-1">
        {!d ? <p className="text-xs text-white/60">Lendo o hardware…</p> : (
          <>
            <Barra rotulo="CPU" valor={cpu} texto={`${cpu.toFixed(0)}%`} />
            <Barra rotulo="RAM" valor={d.memoria.percentual} texto={`${d.memoria.percentual.toFixed(0)}% · ${bytes(d.memoria.usada)}`} />
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-white/70">Temperatura</span>
              <span className="font-bold tabular-nums" style={{ color: temp == null ? undefined : COR[tomDoUso(temp)] }}>{temp == null ? "indisponível" : `${temp.toFixed(0)} °C`}</span>
            </div>
            {d.bateria && <div className="mb-1 flex justify-between text-[11px]"><span className="text-white/70">Bateria</span><span className="font-bold tabular-nums">{d.bateria.nivel.toFixed(0)}%</span></div>}
          </>
        )}
      </div>
      <div className="px-3 pb-2">
        <button disabled={ocupado} onClick={() => void liberar()} className="w-full rounded-lg bg-cyan-300 py-1.5 text-xs font-extrabold text-[#04121c] disabled:opacity-60">{ocupado ? "Liberando…" : msg || "Liberar RAM"}</button>
      </div>
    </div>
  );
}
