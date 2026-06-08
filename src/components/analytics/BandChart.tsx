import './analytics.css'

// Gedeelde "band"-grafiek voor scoringskans per zone/afstand. Vervangt de drie identieke
// BandList-kopieën (speler-, gevaar- en ploegrapport). Premium-upgrade t.o.v. de oude versie:
// de balkbreedte toont het VOLUME (pogingen), de KLEUR de KWALITEIT (conversie, leivan → amber →
// groen), zodat je in één oogopslag "veel + goed" van "veel + zwak" onderscheidt. Toegankelijk
// via een aria-label per balk.

export interface Band {
  label: string
  attempts: number
  goals: number
  conversion: number // 0..1
}

// Conversie (0..1) → kleur op een ingetogen schaal: leigrijs (zwak) → amber → groen (sterk).
function conversionColor(c: number): string {
  const stops = [
    { p: 0, r: 0x6b, g: 0x7a, b: 0x8c }, // leigrijs
    { p: 0.5, r: 0xd6, g: 0xa9, b: 0x3b }, // amber
    { p: 1, r: 0x3e, g: 0xc9, b: 0x8a }, // groen
  ]
  const t = Math.max(0, Math.min(1, c))
  let a = stops[0]
  let b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].p && t <= stops[i + 1].p) {
      a = stops[i]
      b = stops[i + 1]
      break
    }
  }
  const span = b.p - a.p || 1
  const k = (t - a.p) / span
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k)
  return `rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`
}

export function BandChart({
  title,
  hint = 'scoringskans',
  bands,
}: {
  title: string
  hint?: string
  bands: Band[]
}) {
  const max = Math.max(1, ...bands.map((b) => b.attempts))
  return (
    <div className="an-chart ac-band">
      <h3 className="an-chart-title">
        {title} <span className="an-chart-hint">{hint}</span>
      </h3>
      <div className="ac-band-rows">
        {bands.map((b) => {
          const pct = Math.round(b.conversion * 100)
          const w = Math.max(b.attempts ? 6 : 0, Math.round((b.attempts / max) * 100))
          const color = b.attempts ? conversionColor(b.conversion) : 'rgba(255,255,255,0.10)'
          return (
            <div className="ac-band-row" key={b.label}>
              <span className="ac-band-lbl">{b.label}</span>
              <span
                className="ac-band-track"
                role="img"
                aria-label={`${b.label}: ${b.attempts ? `${pct}% conversie, ${b.goals} van ${b.attempts} pogingen` : 'geen pogingen'}`}
              >
                <span className="ac-band-fill" style={{ width: `${w}%`, ['--c' as string]: color }} />
              </span>
              <span className="ac-band-val">
                {b.attempts ? `${pct}%` : '—'} <span className="ac-band-sub">({b.goals}/{b.attempts})</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
