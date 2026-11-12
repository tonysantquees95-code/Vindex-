import { useId } from "react";

/**
 * O V do Vindex em 3D, como o orbe da Vênus: um tubo com luz e sombra, brilho atrás e uma pulsação lenta, como se estivesse vivo.
 * Acompanha a cor do app (--color-neon e --color-magenta). Quem pede menos movimento no aparelho recebe o V parado.
 */
export function LogoVivo({ tam = 40, className = "" }: { tam?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={`logo-vivo inline-block flex-none ${className}`} style={{ width: tam, height: tam }} role="img" aria-label="Vindex">
      <svg viewBox="0 0 100 100" width={tam} height={tam} overflow="visible">
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-neon)" />
            <stop offset="1" stopColor="var(--color-magenta)" />
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="color-mix(in srgb, var(--color-neon) 35%, #000)" />
            <stop offset="1" stopColor="color-mix(in srgb, var(--color-magenta) 35%, #000)" />
          </linearGradient>
          <radialGradient id={`g${id}`} cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor="var(--color-neon)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--color-neon)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="logo-vivo-brilho" cx="50" cy="48" r="50" fill={`url(#g${id})`} />
        <ellipse cx="50" cy="94" rx="20" ry="3.6" fill="#000" opacity=".55" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 20 50 76 78 20" stroke={`url(#s${id})`} strokeWidth="21" transform="translate(2.5 4)" />
          <path d="M22 20 50 76 78 20" stroke={`url(#f${id})`} strokeWidth="19" />
          <path d="M21 17 49 72 M79 17 55 66" stroke="#fff" strokeWidth="4.2" opacity=".42" />
        </g>
      </svg>
    </span>
  );
}
