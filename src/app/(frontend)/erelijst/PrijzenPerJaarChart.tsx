import type { PrijsJaar } from '@/lib/erelijst'

// Gestapelde staafgrafiek van prijzen per jaar (titels/bekers/referendumprijzen) — puur SVG, geen
// libraries, zelfde aanpak als Sparkline.tsx. Vaste, niet-clubgebonden kleurenreeks (blauw/oranje/
// aqua) zodat "wat is wat" op elke clubpagina hetzelfde blijft; de hoogte van elke balk (en het
// getal erboven) maakt topjaren in één oogopslag zichtbaar, ook zonder te hoeven hoveren.
const SERIES = [
  { key: 'titels' as const, kleur: '#3987e5', label: 'Kampioenschappen' },
  { key: 'bekers' as const, kleur: '#d95926', label: 'Bekers' },
  { key: 'referendumprijzen' as const, kleur: '#199e70', label: 'Referendumprijzen' },
]

const BAR_W = 18
const GAP = 4
const H = 130
const PAD_TOP = 22
const PAD_BOTTOM = 22

export function PrijzenPerJaarChart({ data }: { data: PrijsJaar[] }) {
  if (data.length === 0) return null

  const max = Math.max(1, ...data.map((d) => d.titels + d.bekers + d.referendumprijzen))
  const usableH = H - PAD_TOP - PAD_BOTTOM
  const baseline = H - PAD_BOTTOM
  const W = data.length * (BAR_W + GAP) - GAP + 8

  return (
    <div className="erl-chart">
      <div className="erl-chart-legende">
        {SERIES.map((s) => (
          <span key={s.key} className="erl-chart-legende-item">
            <span className="erl-chart-swatch" style={{ background: s.kleur }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
      <div className="erl-chart-scroll">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aantal prijzen per jaar">
          <line x1={2} x2={W - 2} y1={baseline} y2={baseline} stroke="var(--line)" strokeWidth={1} />
          {data.map((d, i) => {
            const totaal = d.titels + d.bekers + d.referendumprijzen
            const x = 4 + i * (BAR_W + GAP)
            const totaalH = (totaal / max) * usableH
            const topY = baseline - totaalH
            const toonJaarLabel = i === 0 || i === data.length - 1 || d.jaar % 5 === 0

            let cum = 0
            const segmenten = SERIES.map((s) => {
              const n = d[s.key]
              if (n === 0) return null
              const segH = (n / max) * usableH
              const segY = baseline - cum - segH
              cum += segH
              // 2px surface-gap tussen aansluitende segmenten (zie dataviz-conventie).
              return { key: s.key, kleur: s.kleur, y: segY, h: Math.max(0, segH - 2) }
            }).filter((s): s is NonNullable<typeof s> => s !== null)

            // Eén samengestelde string i.p.v. meerdere JSX-expressies naast elkaar — React splitst
            // aangrenzende tekst-expressies bij SSR met comment-markers, wat een client/server-
            // hydratatiemismatch gaf binnen een SVG <title> (die tolereert dat niet zoals HTML-tags).
            const titleTekst =
              totaal > 0
                ? `${d.jaar}: ${totaal} prijs${totaal === 1 ? '' : 'en'} (${d.titels}× kampioen, ${d.bekers}× beker, ${d.referendumprijzen}× referendumprijs)`
                : `${d.jaar}: geen prijzen`

            return (
              <g key={d.jaar}>
                <title>{titleTekst}</title>
                {/* Onzichtbaar hit-gebied over de volledige kolom, zodat hover ook op lage/lege balken werkt. */}
                <rect x={x} y={PAD_TOP} width={BAR_W} height={usableH} fill="transparent" />
                {segmenten.map((s) => (
                  <rect key={s.key} x={x} y={s.y} width={BAR_W} height={s.h} rx={2} fill={s.kleur} />
                ))}
                {totaal > 0 && (
                  <text x={x + BAR_W / 2} y={Math.max(10, topY - 4)} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--txt)">
                    {totaal}
                  </text>
                )}
                {toonJaarLabel && (
                  <text x={x + BAR_W / 2} y={H - 6} textAnchor="middle" fontSize={8} fill="var(--dim)">
                    {d.jaar}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
