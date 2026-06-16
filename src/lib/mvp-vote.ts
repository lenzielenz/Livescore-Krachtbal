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

// ── Seizoens-fanaward ("Publiekslievelingen") ─────────────────────────────────────────────────
// Hoe vaak werd een speler over het seizoen tot held van de match verkozen, en hoeveel stemmen
// kreeg hij in totaal. Eén stem-document per supporter per wedstrijd → groepeer per wedstrijd,
// bepaal de winnaar (geen winst bij gelijkstand), en tel winsten + stemmen per speler op.

export interface MvpVoteRow {
  matchId: number
  playerId: number
  name: string
  shirtNumber: number | null
}

export interface MvpAward {
  playerId: number
  name: string
  shirtNumber: number | null
  /** Aantal wedstrijden waarin deze speler held van de match werd. */
  wins: number
  /** Totaal aantal stemmen over het seizoen. */
  votes: number
}

export function seasonMvpAwards(rows: MvpVoteRow[]): MvpAward[] {
  // Per wedstrijd: stemmen per speler tellen + naam/rugnummer onthouden.
  const perMatch = new Map<number, Map<number, { count: number; name: string; shirtNumber: number | null }>>()
  for (const r of rows) {
    if (!Number.isFinite(r.matchId) || !Number.isFinite(r.playerId)) continue
    let m = perMatch.get(r.matchId)
    if (!m) { m = new Map(); perMatch.set(r.matchId, m) }
    const e = m.get(r.playerId) ?? { count: 0, name: r.name, shirtNumber: r.shirtNumber }
    e.count += 1
    if (r.name) e.name = r.name
    if (r.shirtNumber != null) e.shirtNumber = r.shirtNumber
    m.set(r.playerId, e)
  }

  const awards = new Map<number, MvpAward>()
  const bump = (playerId: number, name: string, shirtNumber: number | null) => {
    const a = awards.get(playerId) ?? { playerId, name, shirtNumber, wins: 0, votes: 0 }
    if (name) a.name = name
    if (shirtNumber != null) a.shirtNumber = shirtNumber
    awards.set(playerId, a)
    return a
  }

  for (const m of perMatch.values()) {
    let maxCount = 0
    for (const e of m.values()) maxCount = Math.max(maxCount, e.count)
    const leaders: number[] = []
    for (const [pid, e] of m.entries()) {
      bump(pid, e.name, e.shirtNumber).votes += e.count
      if (e.count > 0 && e.count === maxCount) leaders.push(pid)
    }
    // Winst enkel bij een duidelijke (niet-gedeelde) koppositie.
    if (maxCount > 0 && leaders.length === 1) {
      const pid = leaders[0]
      const e = m.get(pid)!
      bump(pid, e.name, e.shirtNumber).wins += 1
    }
  }

  return [...awards.values()].sort(
    (a, b) => b.wins - a.wins || b.votes - a.votes || a.name.localeCompare(b.name),
  )
}
