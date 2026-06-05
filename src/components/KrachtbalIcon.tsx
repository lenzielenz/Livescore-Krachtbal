import type { CSSProperties } from 'react'

// Een krachtbal is een lichte (crème/wit) leren werpbal met verticale leren panelen die in een
// punt samenkomen boven- en onderaan (zoals een ouderwetse lederen bal). Er bestaat geen
// Unicode-emoji voor, dus tekenen we hem als klein SVG-icoon dat als een emoji naast tekst staat.
export function KrachtbalIcon({ size = '1.1em', className, style }: { size?: string | number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} role="img" aria-label="krachtbal">
      <defs>
        {/* Glanzend wit leer: helder wit met een lichte koele schaduw aan de rand. */}
        <radialGradient id="kbLeather" cx="36%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#f4f5f3" />
          <stop offset="100%" stopColor="#c4c8c6" />
        </radialGradient>
        <radialGradient id="kbGloss" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#kbLeather)" stroke="#a9adab" strokeWidth="0.7" />
      {/* Verticale leren panelen (meridianen die boven- en onderaan samenkomen). */}
      <g fill="none" stroke="#9aa09c" strokeWidth="0.7" strokeLinecap="round" opacity="0.7">
        <path d="M12 1.7 L12 22.3" />
        <path d="M12 1.7 Q8 12 12 22.3" />
        <path d="M12 1.7 Q16 12 12 22.3" />
        <path d="M12 1.7 Q4.7 12 12 22.3" />
        <path d="M12 1.7 Q19.3 12 12 22.3" />
      </g>
      {/* Blinkende glans: een felle specular hotspot + een zachtere veeg. */}
      <ellipse cx="8.4" cy="7.2" rx="3.6" ry="2.4" fill="url(#kbGloss)" />
      <ellipse cx="7.6" cy="6.4" rx="1.5" ry="1" fill="#ffffff" opacity="0.95" />
    </svg>
  )
}
