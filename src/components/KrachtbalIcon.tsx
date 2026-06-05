import type { CSSProperties } from 'react'

import type { KrachtbalKleur } from '@/lib/reeksen'

// Een krachtbal is een glanzende leren medicijnbal. De leren panelen lopen samen in een kleine
// rozet onderaan (de bal staat iets voorovergekanteld, zoals op de foto). Er bestaat geen
// Unicode-emoji voor, dus tekenen we hem als klein SVG-icoon dat als een emoji naast tekst staat.
//
// De balkleur hangt af van de categorie (KVKBF): dames = rood, heren = wit, U12/U14 = geel,
// U16/U18 = blauw. Geef `kleur` mee (afgeleid uit de reeks via `krachtbalKleur`).
const PALETTE: Record<KrachtbalKleur, { hi: string; mid: string; edge: string; seam: string; ring: string }> = {
  wit: { hi: '#ffffff', mid: '#f1f3f1', edge: '#bcc1bf', seam: '#8d928e', ring: '#9a9f9c' },
  rood: { hi: '#ffd7cf', mid: '#e23b3b', edge: '#9e1f1f', seam: '#7e1818', ring: '#8e1a1a' },
  geel: { hi: '#fff4c2', mid: '#f3c220', edge: '#bd8e0c', seam: '#8f6c08', ring: '#a87d0a' },
  blauw: { hi: '#d3e3ff', mid: '#2f74d0', edge: '#184a96', seam: '#143a78', ring: '#1a4283' },
}

export function KrachtbalIcon({
  size = '1.1em',
  kleur = 'wit',
  className,
  style,
}: {
  size?: string | number
  kleur?: KrachtbalKleur
  className?: string
  style?: CSSProperties
}) {
  const c = PALETTE[kleur]
  // Per kleur een eigen gradient-id zodat meerdere ballen (verschillende kleuren) op één pagina
  // elkaars vulling niet overschrijven (gedeelde SVG-id's verwijzen anders naar de eerste def).
  const lid = `kbLeather-${kleur}`
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} role="img" aria-label={`krachtbal (${kleur})`}>
      <defs>
        {/* Glanzend leer: lichte tint in het centrum, donkerder naar de rand. */}
        <radialGradient id={lid} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={c.hi} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.edge} />
        </radialGradient>
        <radialGradient id="kbGloss" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill={`url(#${lid})`} stroke={c.ring} strokeWidth="1" />
      {/* Leren panelen die samenkomen in een rozet onderaan, zodat de bal als een 3D-medicijnbal
          leest (geen ui-schillen). */}
      <g fill="none" stroke={c.seam} strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <path d="M13 17.4 Q6.5 12 7.6 2.9" />
        <path d="M13 17.4 Q11.5 9 12.4 1.7" />
        <path d="M13 17.4 Q16.5 8.5 17.6 3.4" />
        <path d="M13 17.4 Q20 12.5 21.7 9.5" />
        <path d="M13 17.4 Q6 15 2.6 11.2" />
      </g>
      {/* Kleine rozet onderaan waar de panelen samenkomen. */}
      <circle cx="13" cy="17.4" r="1.5" fill="none" stroke={c.seam} strokeWidth="1.2" opacity="0.85" />
      {/* Blinkende glans: een felle specular hotspot + een zachtere veeg. */}
      <ellipse cx="9" cy="7.4" rx="4" ry="2.7" fill="url(#kbGloss)" />
      <ellipse cx="8" cy="6.3" rx="1.6" ry="1.05" fill="#ffffff" opacity="0.95" />
    </svg>
  )
}
