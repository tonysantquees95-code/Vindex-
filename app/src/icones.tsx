import type { CSSProperties, ReactElement, SVGProps } from "react";

/** Ícones de linha, como os da Vênus: traço, ponta, junta e preenchimento vêm das variáveis CSS do pacote escolhido nos Ajustes. */
const estilo: CSSProperties = {
  strokeWidth: "var(--icone-traco, 1.7)",
  strokeLinecap: "var(--icone-ponta, round)" as CSSProperties["strokeLinecap"],
  strokeLinejoin: "var(--icone-junta, round)" as CSSProperties["strokeLinejoin"],
  fillOpacity: "var(--icone-preench, 0)" as unknown as number,
};

function Svg({ children, tam = 24, style, ...r }: SVGProps<SVGSVGElement> & { tam?: number }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" aria-hidden {...r} style={{ ...estilo, ...style }}>{children}</svg>;
}
const L = { fill: "none" } as const;

export type NomeIcone = "painel" | "otimizar" | "arquivos" | "regras" | "descompactar" | "seguranca" | "conta" | "ajustes" | "menu" | "fechar" | "atualizar" | "rede";

const DESENHOS: Record<NomeIcone, ReactElement> = {
  painel: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="4.5" rx="2" {...L} /><rect x="13.5" y="11" width="7" height="9.5" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" {...L} /></>,
  otimizar: <path d="M13 2.8 5.5 13.2h5.2L9.9 21.2 18.5 10h-5.4z" />,
  arquivos: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  regras: <g {...L}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></g>,
  descompactar: <g><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" /><path d="M4 8.5 12 13l8-4.5M12 13v7" {...L} /></g>,
  seguranca: <path d="M12 3 5 5.8v5.6c0 4.2 2.9 7.6 7 9.1 4.1-1.5 7-4.9 7-9.1V5.8z" />,
  conta: <g><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" {...L} /></g>,
  ajustes: <g {...L}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></g>,
  menu: <path d="M4 7h16M4 12h16M4 17h10" {...L} />,
  fechar: <path d="M6 6l12 12M18 6 6 18" {...L} />,
  atualizar: <g {...L}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.6h-4.6" /></g>,
  rede: <g {...L}><path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a8 8 0 0 1 11 0M9.4 16a4 4 0 0 1 5.2 0" /><circle cx="12" cy="19" r="1" /></g>,
};

export function Icone({ nome, tam = 24, className }: { nome: NomeIcone; tam?: number; className?: string }) {
  return <Svg tam={tam} className={className}>{DESENHOS[nome]}</Svg>;
}
