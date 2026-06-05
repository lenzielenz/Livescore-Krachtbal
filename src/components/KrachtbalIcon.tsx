import type { CSSProperties } from 'react'

// Een krachtbal is een lichte (crème/wit) leren werpbal met verticale leren panelen die in een
// punt samenkomen boven- en onderaan (zoals een ouderwetse lederen bal). Er bestaat geen
// Unicode-emoji voor, dus tekenen we hem als klein SVG-icoon dat als een emoji naast tekst staat.
export function KrachtbalIcon({ size = '1.1em', className, style }: { size?: string | number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} role="img" aria-label="krachtbal">
      <defs>
        <radialGradient id="kbLeather" cx="38%" cy="30%" r="82%">
          <stop offset="0%" stopColor="#f7f3e8" />
          <stop offset="55%" stopColor="#ddd6c4" />
          <stop offset="100%" stopColor="#aba190" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#kbLeather)" stroke="#9a9082" strokeWidth="0.7" />
      {/* Verticale leren panelen (meridianen die boven- en onderaan samenkomen). */}
      <g fill="none" stroke="#8c8475" strokeWidth="0.75" strokeLinecap="round" opacity="0.8">
        <path d="M12 1.7 L12 22.3" />
        <path d="M12 1.7 Q8 12 12 22.3" />
        <path d="M12 1.7 Q16 12 12 22.3" />
        <path d="M12 1.7 Q4.7 12 12 22.3" />
        <path d="M12 1.7 Q19.3 12 12 22.3" />
      </g>
      {/* Zachte glans linksboven. */}
      <ellipse cx="8.6" cy="7.6" rx="3" ry="1.9" fill="#ffffff" opacity="0.28" />
    </svg>
  )
}
