// Het wedkantoor in de kelder van het virtuele stadion: de schermen tonen de statistieken van de
// pronostiek, en het bonusrad hangt aan de muur (daar draai je gratis, voor de fun — het echte rad
// staat op /pronostiek/rad).
//
// Puur: krijgt de gescoorde wedstrijden (zoals de pronostiekstand ze bouwt) en de toestand van het
// rad, en vat alles samen voor de schermen. Alles is afgeleid, niets wordt apart bewaard.

import { buildPredictionLeaderboard, rankLeaderboard, type PredEntry, type ScoreGuess } from './prediction-score'
import { RAD_SEGMENTS, type RadSegment } from './pronostiek-rad'

export type WedkantoorStats = {
  seizoen: string
  deelnemers: number
  wedstrijden: number
  voorspellingen: number
  exact: number
  /** Percentage exacte voorspellingen (0–100, afgerond). */
  exactPct: number
  /** Gemiddeld aantal punten per voorspelling (1 decimaal). */
  gemPunten: number
  top: { rank: number; naam: string; punten: number; voorspellingen: number; exact: number }[]
  /** Uitblinkers: meeste exacte uitslagen, meest actief, meest "dichtst bij". */
  scherpste: { naam: string; aantal: number } | null
  actiefste: { naam: string; aantal: number } | null
  dichtste: { naam: string; aantal: number } | null
  /** De vaakst voorspelde uitslag, bv. "12 – 10" (en hoe vaak). */
  populairst: { uitslag: string; aantal: number } | null
  /** Wie dit weekend aan het echte rad mag draaien (de top van vorig weekend). */
  radWinnaars: string[]
  /** De kans per vermenigvuldiger op het rad (in %, afgerond). */
  radKansen: { mult: number; pct: number }[]
  ik: { rank: number; punten: number } | null
}

/** De kans per (unieke) vermenigvuldiger: de som van de gewichten van zijn taartpunten. */
export function radKansen(segs: RadSegment[] = RAD_SEGMENTS): { mult: number; pct: number }[] {
  const totaal = segs.reduce((a, s) => a + s.weight, 0) || 1
  const per = new Map<number, number>()
  for (const s of segs) per.set(s.mult, (per.get(s.mult) ?? 0) + s.weight)
  return [...per].map(([mult, w]) => ({ mult, pct: Math.round((w / totaal) * 100) })).sort((a, b) => a.mult - b.mult)
}

export function vatPronostiekSamen(
  seizoen: string,
  wedstrijden: { actual: ScoreGuess; preds: PredEntry[] }[],
  rad: { winnaars: string[] },
  ik: number | null,
): WedkantoorStats {
  const rijen = rankLeaderboard(buildPredictionLeaderboard(wedstrijden))
  const voorspellingen = rijen.reduce((a, r) => a + r.predictions, 0)
  const exact = rijen.reduce((a, r) => a + r.exact, 0)
  const punten = rijen.reduce((a, r) => a + r.points, 0)
  const beste = (sleutel: 'exact' | 'predictions' | 'closest') => {
    const r = [...rijen].sort((a, b) => b[sleutel] - a[sleutel] || b.points - a.points)[0]
    return r && r[sleutel] > 0 ? { naam: r.name, aantal: r[sleutel] } : null
  }
  const uitslagen = new Map<string, number>()
  for (const w of wedstrijden) for (const p of w.preds) uitslagen.set(`${p.home} – ${p.away}`, (uitslagen.get(`${p.home} – ${p.away}`) ?? 0) + 1)
  const pop = [...uitslagen].sort((a, b) => b[1] - a[1])[0]
  const mij = ik != null ? rijen.find((r) => r.userId === ik) : undefined
  return {
    seizoen,
    deelnemers: rijen.length,
    wedstrijden: wedstrijden.length,
    voorspellingen,
    exact,
    exactPct: voorspellingen ? Math.round((exact / voorspellingen) * 100) : 0,
    gemPunten: voorspellingen ? Math.round((punten / voorspellingen) * 10) / 10 : 0,
    top: rijen.slice(0, 10).map((r) => ({ rank: r.rank, naam: r.name, punten: Math.round(r.points), voorspellingen: r.predictions, exact: r.exact })),
    scherpste: beste('exact'),
    actiefste: beste('predictions'),
    dichtste: beste('closest'),
    populairst: pop ? { uitslag: pop[0], aantal: pop[1] } : null,
    radWinnaars: rad.winnaars.slice(0, 10),
    radKansen: radKansen(),
    ik: mij ? { rank: mij.rank, punten: Math.round(mij.points) } : null,
  }
}

/** Een lege samenvatting (voor er iets geladen is, of als er nog geen voorspellingen zijn). */
export const legeWedkantoorStats = (seizoen = ''): WedkantoorStats => vatPronostiekSamen(seizoen, [], { winnaars: [] }, null)
