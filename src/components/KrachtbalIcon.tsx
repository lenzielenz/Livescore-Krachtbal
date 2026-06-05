import type { CSSProperties } from 'react'

// Een krachtbal is een glanzende, lichte (crème/wit) leren medicijnbal. De leren panelen lopen
// samen in een kleine rozet onderaan (de bal staat iets voorovergekanteld, zoals op de foto).
// Er bestaat geen Unicode-emoji voor, dus tekenen we hem als klein SVG-icoon dat als een emoji
// naast tekst staat.
export function KrachtbalIcon({ size = '1.1em', className, style }: { size?: string | number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} role="img" aria-label="krachtbal">
      <defs>
        {/* Glanzend wit leer: helder wit met een lichte koele schaduw aan de rand. */}
        <radialGradient id="kbLeather" cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f1f3f1" />
          <stop offset="100%" stopColor="#bcc1bf" />
        </radialGradient>
        <radialGradient id="kbGloss" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#kbLeather)" stroke="#9a9f9c" strokeWidth="1" />
      {/* Leren panelen die samenkomen in een rozet onderaan, zodat de bal als een 3D-medicijnbal
          leest (geen ui-schillen). */}
      <g fill="none" stroke="#8d928e" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <path d="M13 17.4 Q6.5 12 7.6 2.9" />
        <path d="M13 17.4 Q11.5 9 12.4 1.7" />
        <path d="M13 17.4 Q16.5 8.5 17.6 3.4" />
        <path d="M13 17.4 Q20 12.5 21.7 9.5" />
        <path d="M13 17.4 Q6 15 2.6 11.2" />
      </g>
      {/* Kleine rozet onderaan waar de panelen samenkomen. */}
      <circle cx="13" cy="17.4" r="1.5" fill="none" stroke="#8d928e" strokeWidth="1.2" opacity="0.85" />
      {/* Blinkende glans: een felle specular hotspot + een zachtere veeg. */}
      <ellipse cx="9" cy="7.4" rx="4" ry="2.7" fill="url(#kbGloss)" />
      <ellipse cx="8" cy="6.3" rx="1.6" ry="1.05" fill="#ffffff" opacity="0.95" />
    </svg>
  )
}
