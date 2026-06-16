// ── Held van de match (supporterstem) ────────────────────────────────────────────────────────
// Supporters stemmen op hun favoriete speler; deze pure module rangschikt de kandidaten uit de
// rauwe stemtellers (speler-id → aantal). Los testbaar; de opslag/SSE zit in de route + component.

export type MvpSide = 'home' | 'away'

export interface MvpCandidate {
  playerId: number
  name: string
  shirtNumber: number | null
  side: MvpSide
}

export interface MvpStanding extends MvpCandidate {
  votes: number
  /** Aandeel van het totaal (0..100, afgerond). */
  pct: number
  /** Deelt de koppositie (ook bij gelijkstand). */
  leading: boolean
}

export interface MvpResult {
  standings: MvpStanding[]
  total: number
  /** De winnaar bij een duidelijke koppositie; null bij 0 stemmen of een gelijkstand bovenaan. */
  winner: MvpStanding | null
}

/**
 * Rangschik de kandidaten op stemmen (meeste eerst; bij gelijkstand op rugnummer, dan naam).
 * Stemmen voor onbekende spelers (niet in de kandidatenlijst) tellen niet mee.
 */
export function tallyMvp(candidates: MvpCandidate[], totals: Record<string | number, number>): MvpResult {
  const voteOf = (id: number): number => {
    const v = Number(totals?.[id])
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  }
  const total = candidates.reduce((s, c) => s + voteOf(c.playerId), 0)
  const maxVotes = candidates.reduce((m, c) => Math.max(m, voteOf(c.playerId)), 0)

  const standings: MvpStanding[] = candidates
    .map((c) => {
      const votes = voteOf(c.playerId)
      return {
        ...c,
        votes,
        pct: total > 0 ? Math.round((votes / total) * 100) : 0,
        leading: votes > 0 && votes === maxVotes,
      }
    })
    .sort((a, b) => b.votes - a.votes || (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) || a.name.localeCompare(b.name))

  // Eén duidelijke winnaar enkel als er stemmen zijn én de koppositie niet gedeeld wordt.
  const leaders = standings.filter((s) => s.leading)
  const winner = total > 0 && leaders.length === 1 ? leaders[0] : null

  return { standings, total, winner }
}
