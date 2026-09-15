// Decoratieve achtergrond voor het hoofdcijfer: dezelfde veldtekening als FieldSchema.tsx
// (mat-gradiënt, maaibanen, doellijn, vrijeworplijn, derden), maar herkleurd naar het
// ijsblauwe/donkere thema van de site in plaats van het echte grasgroen — dit is geen
// speelveld om op te tikken, enkel een herkenbare achtergrond waar de cijfers op rusten.
export function RecapFieldBackdrop() {
  return (
    <svg className="recap-field-bg" viewBox="0 0 140 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="rf-turf" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#254876" />
          <stop offset="0.55" stopColor="#152a4d" />
          <stop offset="1" stopColor="#0a1730" />
        </linearGradient>
        <pattern id="rf-mow" patternUnits="userSpaceOnUse" width="140" height="18">
          <rect width="140" height="9" fill="#ffffff" opacity="0.05" />
        </pattern>
        <radialGradient id="rf-vig" cx="0.5" cy="0.25" r="0.85">
          <stop offset="0.45" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <rect width="140" height="210" fill="url(#rf-turf)" />
      <rect width="140" height="210" fill="url(#rf-mow)" />
      {/* Doelgebied bovenaan, in de accentkleur in plaats van ploegkleur. */}
      <rect x="0" y="0" width="140" height="42" fill="#6fb2ff" opacity="0.16" />
      <line x1="0" y1="42" x2="140" y2="42" stroke="#dce8fb" strokeWidth="1.6" strokeOpacity="0.85" />
      <line x1="-6" y1="42" x2="0" y2="42" stroke="#dce8fb" strokeWidth="1.6" strokeOpacity="0.85" />
      <line x1="140" y1="42" x2="146" y2="42" stroke="#dce8fb" strokeWidth="1.6" strokeOpacity="0.85" />
      {/* Vrijeworplijn */}
      <line x1="0" y1="82" x2="140" y2="82" stroke="#dce8fb" strokeWidth="1" strokeOpacity="0.5" />
      {/* Zone-derden */}
      <line x1="46.6" y1="0" x2="46.6" y2="210" stroke="#dce8fb" strokeWidth="0.6" strokeDasharray="2 4" strokeOpacity="0.4" />
      <line x1="93.3" y1="0" x2="93.3" y2="210" stroke="#dce8fb" strokeWidth="0.6" strokeDasharray="2 4" strokeOpacity="0.4" />
      {/* Zijlijnen */}
      <rect x="0.8" y="0.8" width="138.4" height="208.4" fill="none" stroke="#dce8fb" strokeOpacity="0.32" strokeWidth="1.2" />
      <rect width="140" height="210" fill="url(#rf-vig)" />
    </svg>
  )
}
