import type { CSSProperties } from 'react'

// Een krachtbal is geen voetbal: een zware, bruine leren bal die je werpt. Er bestaat geen
// Unicode-emoji voor, dus tekenen we hem als klein SVG-icoon (bruin leer met naden) dat als
// een emoji naast tekst staat.
export function KrachtbalIcon({ size = '1.1em', className, style }: { size?: string | number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} role="img" aria-label="krachtbal">
      <defs>
        <radialGradient id="kbBall" cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#c98a4f" />
          <stop offset="50%" stopColor="#9a5526" />
          <stop offset="100%" stopColor="#5e2f12" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#kbBall)" stroke="#3a1d0c" strokeWidth="0.8" />
      {/* Leren naden */}
      <g fill="none" stroke="#3a1d0c" strokeWidth="0.85" strokeLinecap="round" opacity="0.65">
        <path d="M3.2 9.2 Q12 12.6 20.8 9.2" />
        <path d="M3.2 14.8 Q12 11.4 20.8 14.8" />
        <path d="M12 1.9 Q9.2 12 12 22.1" />
      </g>
      {/* Glans */}
      <ellipse cx="8.6" cy="7.8" rx="3.1" ry="2" fill="#ffffff" opacity="0.18" />
    </svg>
  )
}
