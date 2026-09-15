// Decoratieve achtergrond voor het hoofdcijfer: een "doelgebied"-uitsnede van het krachtbalveld
// (zelfde grammatica als FieldSchema.tsx — buiten-zone, mat, doellijn, vrijeworplijn, zone-
// derden), landschap-georiënteerd zodat het volledige doelgebied zichtbaar blijft in een brede
// kaart, en herkleurd naar het ijsblauwe/donkere thema van de site i.p.v. het echte grasgroen.
// Geen speelveld om op te tikken — enkel een herkenbare achtergrond waar de cijfers op rusten.
//
// `variant="gold"` herkleurt hetzelfde veld warmer/goud — het seizoenstotaal moet ernaast staan
// en toch meteen als iets anders aanvoelen dan de wekelijkse recap (ijsblauw).
export function RecapFieldBackdrop({ variant = 'ice' }: { variant?: 'ice' | 'gold' }) {
  const gold = variant === 'gold'
  const turf = gold ? ['#5a4419', '#3a2c14', '#170f08'] : ['#2c5490', '#17305c', '#0a1730']
  const outer = gold ? '#3a2708' : '#3a1018'
  const outerTint = gold ? '#ffd166' : '#ff5d6c'
  const line = gold ? '#ffe9b8' : '#dce8fb'
  const goalTint = gold ? '#ffd166' : '#6fb2ff'
  return (
    <svg className="recap-field-bg" viewBox="0 0 260 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`rf-turf-${variant}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={turf[0]} />
          <stop offset="0.55" stopColor={turf[1]} />
          <stop offset="1" stopColor={turf[2]} />
        </linearGradient>
        <pattern id={`rf-mow-${variant}`} patternUnits="userSpaceOnUse" width="30" height="30" patternTransform="rotate(0)">
          <rect width="30" height="15" fill="#ffffff" opacity="0.05" />
        </pattern>
        <radialGradient id={`rf-vig-${variant}`} cx="0.5" cy="0.2" r="0.9">
          <stop offset="0.4" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id={`rf-glow-${variant}`} cx="0.5" cy="0.16" r="0.6">
          <stop offset="0" stopColor={goalTint} stopOpacity="0.5" />
          <stop offset="1" stopColor={goalTint} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Buiten-zone: de warme rand rond het veld, net als op het echte terrein. */}
      <rect width="260" height="200" fill={outer} />
      <rect width="260" height="200" fill={outerTint} opacity="0.14" />
      {/* Speelveld */}
      <rect x="14" y="14" width="232" height="172" fill={`url(#rf-turf-${variant})`} />
      <rect x="14" y="14" width="232" height="172" fill={`url(#rf-mow-${variant})`} />
      <rect x="14" y="14" width="232" height="172" fill={`url(#rf-glow-${variant})`} />
      {/* Doelgebied — volledig in beeld, bovenaan de uitsnede. */}
      <rect x="14" y="14" width="232" height="50" fill={goalTint} opacity="0.2" />
      <line x1="14" y1="64" x2="246" y2="64" stroke={line} strokeWidth="2" strokeOpacity="0.9" />
      <line x1="4" y1="64" x2="14" y2="64" stroke={line} strokeWidth="2" strokeOpacity="0.9" />
      <line x1="246" y1="64" x2="256" y2="64" stroke={line} strokeWidth="2" strokeOpacity="0.9" />
      {/* Vrijeworplijn */}
      <line x1="14" y1="98" x2="246" y2="98" stroke={line} strokeWidth="1.1" strokeOpacity="0.55" />
      {/* Zone-derden */}
      <line x1="91.3" y1="14" x2="91.3" y2="186" stroke={line} strokeWidth="0.7" strokeDasharray="2.5 5" strokeOpacity="0.42" />
      <line x1="168.7" y1="14" x2="168.7" y2="186" stroke={line} strokeWidth="0.7" strokeDasharray="2.5 5" strokeOpacity="0.42" />
      {/* Zijlijnen */}
      <rect x="14.9" y="14.9" width="230.2" height="170.2" fill="none" stroke={line} strokeOpacity="0.4" strokeWidth="1.4" />
      <rect x="14" y="14" width="232" height="172" fill={`url(#rf-vig-${variant})`} />
    </svg>
  )
}
