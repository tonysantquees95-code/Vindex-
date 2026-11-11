import type { ButtonHTMLAttributes, ReactNode } from "react";
import { tomDoUso } from "./formato";

const COR = { ok: "#34d399", aviso: "#fbbf24", erro: "#f87171" } as const;

export function Cartao({ titulo, acao, children, className = "" }: { titulo?: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-borda bg-painel/80 p-4 backdrop-blur ${className}`}>
      {(titulo || acao) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-suave">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function Botao({ variante = "suave", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "suave" | "perigo" }) {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:opacity-40";
  const v = variante === "primario" ? "bg-neon/90 text-fundo hover:bg-neon" : variante === "perigo" ? "border border-erro/40 text-erro hover:bg-erro/10" : "border border-borda text-texto hover:bg-white/5";
  return <button className={`${base} ${v} ${className}`} {...p} />;
}

export function Aviso({ tom = "aviso", children }: { tom?: "ok" | "aviso" | "erro"; children: ReactNode }) {
  const t = tom === "ok" ? "border-ok/30 bg-ok/10 text-ok" : tom === "erro" ? "border-erro/30 bg-erro/10 text-erro" : "border-aviso/30 bg-aviso/10 text-aviso";
  return <div role={tom === "erro" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${t}`}>{children}</div>;
}

/** Velocímetro em arco (240°) com valor de 0 a 100. */
export function Velocimetro({ valor, rotulo, detalhe, unidade = "%" }: { valor: number; rotulo: string; detalhe?: string; unidade?: string }) {
  const v = Math.max(0, Math.min(100, valor));
  const cor = COR[tomDoUso(v)];
  const R = 52, C = 2 * Math.PI * R, arco = C * (240 / 360);
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${rotulo}: ${Math.round(v)}${unidade}`}>
      <svg viewBox="0 0 140 120" className="w-full max-w-[170px]">
        <g transform="rotate(150 70 70)" fill="none" strokeLinecap="round" strokeWidth="11">
          <circle cx="70" cy="70" r={R} stroke="#1c2740" strokeDasharray={`${arco} ${C}`} />
          <circle cx="70" cy="70" r={R} stroke={cor} strokeDasharray={`${(arco * v) / 100} ${C}`} style={{ filter: `drop-shadow(0 0 6px ${cor})`, transition: "stroke-dasharray .6s ease" }} />
        </g>
        <text x="70" y="72" textAnchor="middle" className="num" fill="#e6ecf8" fontSize="26" fontWeight="600">{Math.round(v)}<tspan fontSize="12" fill="#8a97b3">{unidade}</tspan></text>
        <text x="70" y="92" textAnchor="middle" fill="#8a97b3" fontSize="10">{rotulo}</text>
      </svg>
      {detalhe && <div className="num -mt-2 text-xs text-suave">{detalhe}</div>}
    </div>
  );
}

/** Gráfico de linha simples (histórico em tempo real). */
export function Grafico({ series, altura = 90 }: { series: { nome: string; cor: string; valores: number[] }[]; altura?: number }) {
  const W = 300;
  const max = 100;
  const caminho = (vs: number[]) => vs.map((v, i) => `${i === 0 ? "M" : "L"}${(i / Math.max(1, vs.length - 1)) * W},${altura - (Math.min(max, v) / max) * (altura - 4) - 2}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${altura}`} preserveAspectRatio="none" className="h-24 w-full rounded-lg bg-black/20">
        {[25, 50, 75].map((g) => <line key={g} x1="0" x2={W} y1={altura - (g / max) * altura} y2={altura - (g / max) * altura} stroke="#1c2740" strokeDasharray="3 4" />)}
        {series.map((s) => s.valores.length > 1 && <path key={s.nome} d={caminho(s.valores)} fill="none" stroke={s.cor} strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${s.cor})` }} />)}
      </svg>
      <div className="mt-1 flex gap-3 text-[11px] text-suave">{series.map((s) => <span key={s.nome} className="flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: s.cor }} />{s.nome}</span>)}</div>
    </div>
  );
}

export function Barra({ valor, rotulo }: { valor: number; rotulo: string }) {
  const cor = COR[tomDoUso(valor)];
  return <div role="progressbar" aria-label={rotulo} aria-valuenow={Math.round(valor)} className="h-2 overflow-hidden rounded-full bg-borda"><div className="h-full rounded-full" style={{ width: `${Math.min(100, valor)}%`, background: cor, transition: "width .5s" }} /></div>;
}
