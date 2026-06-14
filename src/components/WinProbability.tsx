'use client'

import type { TimelineItem } from '@/lib/match-engine'
import { goalPointsFromLabel } from '@/lib/use-live-stream'
import { winProbability } from '@/lib/win-probability'
import './win-probability.css'

// Live winstkans-balk onder het scorebord. Rekent volledig client-side uit de live stand + klok
// (geen extra API-call) en beweegt zo mee met elke tik en elk doelpunt. Toont thuis/gelijk/uit-kans,
// de verwachte eindstand en een momentumcurve (cumulatieve voorsprong) uit de bestaande tijdlijn.

type Side = 'home' | 'away'

export function WinProbability({
  score,
  currentHalf,
  clockSeconds,
  halfSeconds,
  ratePerMin,
  status,
  homeColor,
  awayColor,
  timeline,
}: {
  score: { home: number; away: number }
  currentHalf: number
  clockSeconds: number
  halfSeconds: number
  ratePerMin: number
  status: string
  homeColor: string
  awayColor: string
  timeline: TimelineItem[]
}) {
  if (status !== 'live') return null

  const totalSec = halfSeconds * 2
  const elapsedSec = (Math.max(1, currentHalf) - 1) * halfSeconds + Math.min(clockSeconds, halfSeconds)
  const p = winProbability({ scoreHome: score.home, scoreAway: score.away, elapsedSec, totalSec, ratePerMin })

  // Percentages die exact tot 100 sommeren.
  const homePct = Math.round(p.home * 100)
  const awayPct = Math.round(p.away * 100)
  const drawPct = Math.max(0, 100 - homePct - awayPct)

  // Momentumcurve: cumulatieve voorsprong (thuis − uit) per doelpunt, chronologisch.
  const goals = timeline.filter((i) => i.kind === 'goal' && i.side)
  let lead = 0
  const series = [0, ...goals.map((g) => (lead += (g.side === 'home' ? 1 : -1) * goalPointsFromLabel(g.label)))]
  const span = Math.max(2, ...series.map((v) => Math.abs(v)))
  const W = 100
  const H = 28
  const path =
    series.length > 1
      ? series
          .map((v, i) => {
            const x = (i / (series.length - 1)) * W
            const y = H / 2 - (v / span) * (H / 2 - 2)
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
          })
          .join(' ')
      : null
  const momentumSide: Side | null = lead > 0 ? 'home' : lead < 0 ? 'away' : null

  return (
    <div className="wp" style={{ ['--wp-home' as string]: homeColor, ['--wp-away' as string]: awayColor }}>
      <div className="wp-head">
        <span className="wp-title">Live winstkans</span>
        <span className="wp-exp" title="Verwachte eindstand op basis van het huidige scoretempo">
          Verdiende stand <b>{p.expHome}</b>–<b>{p.expAway}</b>
        </span>
      </div>

      <div
        className="wp-bar"
        role="img"
        aria-label={`Winstkans: thuis ${homePct}%, gelijk ${drawPct}%, uit ${awayPct}%`}
      >
        <span className="wp-seg home" style={{ width: `${homePct}%` }} />
        <span className="wp-seg draw" style={{ width: `${drawPct}%` }} />
        <span className="wp-seg away" style={{ width: `${awayPct}%` }} />
      </div>

      <div className="wp-legend">
        <span className="wp-lg home">{homePct}%</span>
        <span className="wp-lg draw">gelijk {drawPct}%</span>
        <span className="wp-lg away">{awayPct}%</span>
      </div>

      {path && (
        <div className="wp-momentum">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <line className="wp-mid" x1="0" y1={H / 2} x2={W} y2={H / 2} />
            <path className={`wp-curve ${momentumSide ?? ''}`} d={path} />
          </svg>
          <span className="wp-momentum-lbl">Momentum</span>
        </div>
      )}
    </div>
  )
}
