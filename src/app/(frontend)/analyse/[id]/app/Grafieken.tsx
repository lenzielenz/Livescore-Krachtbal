'use client'

// Kleine, scherpe grafieken voor de app-analyse: verdelingen als balken, reeksen als staafjes.

const NAMEN: Record<string, string> = {
  nek: 'Nek',
  rug: 'Rug',
  kort: 'Kort',
  middel: 'Middel',
  lang: 'Lang',
  strak: 'Strak',
  normaal: 'Normaal',
  hoog: 'Hoog',
  links: 'Links',
  rechts: 'Rechts',
  rechtdoor: 'Rechtdoor',
  achteruit: 'Achteruit',
  vooruit: 'Vooruit',
  zijwaarts: 'Zijwaarts',
  stilstand: 'Stilstand',
  grond: 'Grond',
  buiten: 'Buiten',
  caught: 'Gevangen',
  goal: 'Doelpunt',
  onbekend: 'Onbekend',
}

const naam = (k: string) =>
  k
    .split('|')
    .map((d) => NAMEN[d] ?? d.replace(/_/g, ' '))
    .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
    .join(' · ')

export function Balken({
  titel,
  verdeling,
  kleur,
}: {
  titel: string
  verdeling?: Record<string, { n: number; pct: number }>
  kleur: string
}) {
  const ruw = Object.entries(verdeling ?? {}).filter(([, v]) => v && ((Number.isFinite(v.pct) && v.pct > 0) || v.n > 0))
  if (ruw.length === 0) return null
  // Ontbreekt het percentage (zoals bij de zones), dan rekenen we het uit de aantallen.
  const totaal = ruw.reduce((s, [, v]) => s + (v.n || 0), 0)
  const rijen = ruw
    .map(([k, v]) => [k, { n: v.n, pct: Number.isFinite(v.pct) ? v.pct : totaal ? (100 * (v.n || 0)) / totaal : 0 }] as const)
    .sort((a, b) => b[1].pct - a[1].pct)
  return (
    <div className="gr-balken">
      <h4>{titel}</h4>
      {rijen.map(([k, v]) => (
        <div key={k} className="gr-rij">
          <span className="gr-label">{naam(k)}</span>
          <span className="gr-spoor">
            <span className="gr-vul" style={{ width: `${Math.max(2, Math.min(100, v.pct))}%`, background: kleur }} />
          </span>
          <span className="gr-waarde">{Math.round(v.pct)}%{v.n ? <small> · {v.n}</small> : null}</span>
        </div>
      ))}
    </div>
  )
}

export function Staafjes({ titel, waarden, kleur }: { titel: string; waarden: number[]; kleur: string }) {
  const geldig = waarden.filter((x) => Number.isFinite(x))
  if (geldig.length === 0) return null
  // Een kort fragment heeft één of twee minuten: dan is één getal duidelijker dan een grafiek.
  if (waarden.length < 3) {
    return (
      <div className="gr-staafjes">
        <h4>{titel}</h4>
        <p className="gr-getal" style={{ color: kleur }}>{geldig.map((x) => x.toFixed(1).replace('.', ',')).join(' · ')}</p>
      </div>
    )
  }
  const max = Math.max(...geldig, 1)
  const b = 100 / waarden.length
  return (
    <div className="gr-staafjes">
      <h4>{titel}</h4>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={titel}>
        {waarden.map((w, i) => {
          const h = Number.isFinite(w) ? (w / max) * 36 : 0
          return (
            <rect key={i} x={i * b + b * 0.12} y={40 - h} width={b * 0.76} height={h} rx={0.8} fill={kleur}>
              <title>{`Minuut ${i + 1}: ${Number.isFinite(w) ? w.toFixed(1) : '–'}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="gr-as">
        <span>min 1</span>
        <span>{waarden.length > 1 ? `min ${waarden.length}` : ''}</span>
      </div>
    </div>
  )
}
