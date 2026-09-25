import type { PrijsJaar } from '@/lib/erelijst'

// Gestapelde staafgrafiek van prijzen per jaar (titels/bekers/referendumprijzen) — puur SVG, geen
// libraries, zelfde aanpak als MomentumChart.tsx (gradient-vullingen via <defs>, een kaart-paneel
// met var(--panel-grad)/var(--card-shadow) zoals overal elders op het platform). Vaste,
// niet-clubgebonden kleurenreeks zodat "wat is wat" op elke clubpagina hetzelfde blijft; het
// topjaar (of de topjaren) krijgt de goud-behandeling die de site elders al gebruikt voor "#1"
// (rangschikking-leider, podium) — dat is letterlijk het antwoord op "wanneer was hun beste jaar".
const SERIES = [
  { key: 'titels' as const, id: 'titels', van: '#6fb4ff', naar: '#2f6fc4', label: 'Kampioenschappen' },
  { key: 'bekers' as const, id: 'bekers', van: '#f0955a', naar: '#c1531f', label: 'Bekers' },
  { key: 'referendumprijzen' as const, id: 'referendum', van: '#3ecf9a', naar: '#158a63', label: 'Referendumprijzen' },
]

const GOUD = '#ffd166'

const BAR_W = 18
const GAP = 5
const H = 138
const PAD_TOP = 26
const PAD_BOTTOM = 22

export function PrijzenPerJaarChart({ data }: { data: PrijsJaar[] }) {
  if (data.length === 0) return null

  const totalen = data.map((d) => d.titels + d.bekers + d.referendumprijzen)
  const max = Math.max(1, ...totalen)
  const topTotaal = Math.max(0, ...totalen)
  const usableH = H - PAD_TOP - PAD_BOTTOM
  const baseline = H - PAD_BOTTOM
  const W = data.length * (BAR_W + GAP) - GAP + 8

  return (
    <div className="erl-chart">
      <div className="erl-chart-legende">
        {SERIES.map((s) => (
          <span key={s.key} className="erl-chart-legende-item">
            <span className="erl-chart-swatch" style={{ background: `linear-gradient(180deg, ${s.van}, ${s.naar})` }} aria-hidden />
            {s.label}
          </span>
        ))}
        {topTotaal > 0 && (
          <span className="erl-chart-legende-item erl-chart-legende-goud">
            <span className="erl-chart-swatch erl-chart-swatch-goud" aria-hidden />
            Topjaar
          </span>
        )}
      </div>
      <div className="erl-chart-scroll">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aantal prijzen per jaar">
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.id} id={`erl-chart-grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.van} />
                <stop offset="100%" stopColor={s.naar} />
              </linearGradient>
            ))}
            <filter id="erl-chart-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="1" stdDeviation="2.2" floodColor="#000" floodOpacity="0.35" />
            </filter>
            <filter id="erl-chart-glow-goud" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor={GOUD} floodOpacity="0.65" />
            </filter>
          </defs>
          <line x1={2} x2={W - 2} y1={baseline} y2={baseline} stroke="var(--line)" strokeWidth={1} />
          {data.map((d, i) => {
            const totaal = d.titels + d.bekers + d.referendumprijzen
            const isTop = totaal > 0 && totaal === topTotaal
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
              return { key: s.key, fill: `url(#erl-chart-grad-${s.id})`, y: segY, h: Math.max(0, segH - 2) }
            }).filter((s): s is NonNullable<typeof s> => s !== null)

            // Eén samengestelde string i.p.v. meerdere JSX-expressies naast elkaar — React splitst
            // aangrenzende tekst-expressies bij SSR met comment-markers, wat een client/server-
            // hydratatiemismatch gaf binnen een SVG <title> (die tolereert dat niet zoals HTML-tags).
            const titleTekst =
              totaal > 0
                ? `${d.jaar}: ${totaal} prijs${totaal === 1 ? '' : 'en'} (${d.titels}× kampioen, ${d.bekers}× beker, ${d.referendumprijzen}× referendumprijs)${isTop ? ' — topjaar' : ''}`
                : `${d.jaar}: geen prijzen`

            return (
              <g key={d.jaar} className="erl-chart-bar">
                <title>{titleTekst}</title>
                {/* Onzichtbaar hit-gebied over de volledige kolom, zodat hover ook op lage/lege balken werkt. */}
                <rect x={x} y={PAD_TOP} width={BAR_W} height={usableH} fill="transparent" />
                {isTop && (
                  <rect
                    x={x - 2}
                    y={topY - 2}
                    width={BAR_W + 4}
                    height={totaalH + 4}
                    rx={5}
                    fill="none"
                    stroke={GOUD}
                    strokeWidth={1.4}
                    opacity={0.85}
                    filter="url(#erl-chart-glow-goud)"
                  />
                )}
                <g filter="url(#erl-chart-glow)">
                  {segmenten.map((s) => (
                    <rect key={s.key} x={x} y={s.y} width={BAR_W} height={s.h} rx={3} fill={s.fill} />
                  ))}
                </g>
                {totaal > 0 && (
                  <text
                    x={x + BAR_W / 2}
                    y={Math.max(11, topY - 6)}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={800}
                    fill={isTop ? GOUD : 'var(--txt)'}
                  >
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
