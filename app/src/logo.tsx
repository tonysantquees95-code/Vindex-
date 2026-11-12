import { useId } from "react";

/**
 * O V do Vindex em 3D com um escudo de luz por trás (o mesmo desenho do ícone do app), como o orbe da Vênus: um tubo com luz e sombra, brilho atrás e uma pulsação lenta, como se estivesse vivo.
 * Acompanha a cor do app (--color-neon e --color-magenta). Quem pede menos movimento no aparelho recebe o V parado.
 */
export function LogoVivo({ tam = 40, className = "" }: { tam?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={`logo-vivo inline-block flex-none ${className}`} style={{ width: tam * 124 / 152, height: tam }} role="img" aria-label="Vindex">
      <svg viewBox="-12 -26 124 152" width={tam * 124 / 152} height={tam} overflow="visible">
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
        <circle className="logo-vivo-brilho" cx="50" cy="50" r="62" fill={`url(#g${id})`} />
        {/* escudo de luz por trás do V: remete a proteção */}
        <g fill="none" strokeLinejoin="round">
          <path d="M50.0 -24.0 C74.7 -11.3 95.3 -6.7 110.0 -6.7 V46.0 C110.0 82.7 84.7 109.3 50.0 124.0 C15.3 109.3 -10.0 82.7 -10.0 46.0 V-6.7 C4.7 -6.7 25.3 -11.3 50.0 -24.0Z" stroke="var(--color-neon)" strokeWidth="6" opacity=".7" style={{ filter: "blur(2.4px)" }} />
          <path d="M50.0 -24.0 C74.7 -11.3 95.3 -6.7 110.0 -6.7 V46.0 C110.0 82.7 84.7 109.3 50.0 124.0 C15.3 109.3 -10.0 82.7 -10.0 46.0 V-6.7 C4.7 -6.7 25.3 -11.3 50.0 -24.0Z" stroke="color-mix(in srgb, var(--color-neon) 40%, #fff)" strokeWidth="2.4" />
        </g>
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
