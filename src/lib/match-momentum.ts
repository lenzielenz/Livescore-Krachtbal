// ── Wedstrijdverloop ("momentum") ────────────────────────────────────────────────────────────────
// Bouwt uit de tijdlijn een cumulatief scoreverloop: de lijn stijgt bij een thuisdoelpunt en daalt
// bij een uitdoelpunt. Zo zie je in één grafiek hoe de wedstrijd loopt. Pure functie → los testbaar.

import type { TimelineItem } from './match-engine'

export interface MomentumPoint {
  /** Doorlopende matchtijd in seconden (helften aaneengeschakeld). */
  t: number
  home: number
  away: number
  /** Verschil thuis − uit (positief = thuis voor). */
  diff: number
}

// Punten uit een doelpunt-label halen ("Doelpunt +2 …" → 2). Valt terug op 1.
function pointsFromLabel(label: string): number {
  const m = label.match(/\+\s*(\d)/)
  const p = m ? Number(m[1]) : 1
  return Number.isFinite(p) && p > 0 ? p : 1
}

/** Cumulatief scoreverloop uit de tijdlijn (chronologisch). Start altijd op 0–0. */
export function buildMomentum(timeline: TimelineItem[], halfSeconds: number): MomentumPoint[] {
  const dur = halfSeconds > 0 ? halfSeconds : 1500
  const pts: MomentumPoint[] = [{ t: 0, home: 0, away: 0, diff: 0 }]
  let home = 0
  let away = 0
  for (const it of timeline) {
    if (it.kind !== 'goal' || (it.side !== 'home' && it.side !== 'away')) continue
    const p = pointsFromLabel(it.label)
    if (it.side === 'home') home += p
    else away += p
    const t = Math.max(0, (Math.max(1, it.half) - 1) * dur + (it.gameClock || 0))
    pts.push({ t, home, away, diff: home - away })
  }
  return pts
}
