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

export type NomeIcone = "painel" | "otimizar" | "arquivos" | "regras" | "descompactar" | "seguranca" | "cofre" | "conta" | "ajustes" | "menu" | "fechar" | "atualizar" | "rede" | "pasta" | "recentes" | "imagens" | "videos" | "audios" | "documentos" | "planilhas" | "apresentacoes" | "compactados" | "instaladores" | "codigo" | "outros" | "apps";

const DESENHOS: Record<NomeIcone, ReactElement> = {
  painel: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="4.5" rx="2" {...L} /><rect x="13.5" y="11" width="7" height="9.5" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" {...L} /></>,
  otimizar: <path d="M13 2.8 5.5 13.2h5.2L9.9 21.2 18.5 10h-5.4z" />,
  arquivos: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  regras: <g {...L}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></g>,
  descompactar: <g><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" /><path d="M4 8.5 12 13l8-4.5M12 13v7" {...L} /></g>,
  seguranca: <path d="M12 3 5 5.8v5.6c0 4.2 2.9 7.6 7 9.1 4.1-1.5 7-4.9 7-9.1V5.8z" />,
  cofre: <g><rect x="4.5" y="10.5" width="15" height="10" rx="2.4" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...L} /><circle cx="12" cy="15.5" r="1.4" {...L} /></g>,
  conta: <g><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" {...L} /></g>,
  ajustes: <g {...L}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></g>,
  menu: <path d="M4 7h16M4 12h16M4 17h10" {...L} />,
  fechar: <path d="M6 6l12 12M18 6 6 18" {...L} />,
  atualizar: <g {...L}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.6h-4.6" /></g>,
  pasta: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  recentes: <g {...L}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>,
  imagens: <g><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" {...L} /><path d="m4.5 17 4.5-4.2 3.2 3 2.6-2.4 4.7 4.3" {...L} /></g>,
  videos: <g><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m10.5 9.4 4.2 2.6-4.2 2.6z" {...L} /></g>,
  audios: <g {...L}><path d="M9 17.5V6.5l9-2v11" /><circle cx="6.8" cy="17.5" r="2.2" /><circle cx="15.8" cy="15.5" r="2.2" /></g>,
  documentos: <g><path d="M6.5 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" /><path d="M13.5 3.5V8H18M8.5 12.5h7M8.5 15.8h5" {...L} /></g>,
  planilhas: <g><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M3.5 14.8h17M9.5 4.5v15" {...L} /></g>,
  apresentacoes: <g><rect x="3.5" y="4.5" width="17" height="11" rx="2" /><path d="M12 15.5v4M8.5 19.5h7M8 12l2.6-2.6 2 2 3-3.4" {...L} /></g>,
  compactados: <g><path d="M5 4.5h14v15H5z" /><path d="M12 4.5v3M12 9.5v1.5M12 13v1.5M10.2 16.5h3.6v3h-3.6z" {...L} /></g>,
  instaladores: <g><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" /><path d="M12 9v6M9.4 12.6 12 15.2l2.6-2.6" {...L} /></g>,
  codigo: <g {...L}><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></g>,
  outros: <g><path d="M6.5 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" /></g>,
  apps: <g {...L}><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><path d="m14.5 14.5 5 5M19.5 14.5l-5 5" /></g>,
  rede: <g {...L}><path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a8 8 0 0 1 11 0M9.4 16a4 4 0 0 1 5.2 0" /><circle cx="12" cy="19" r="1" /></g>,
};

export function Icone({ nome, tam = 24, className }: { nome: NomeIcone; tam?: number; className?: string }) {
  return <Svg tam={tam} className={className}>{DESENHOS[nome]}</Svg>;
}
