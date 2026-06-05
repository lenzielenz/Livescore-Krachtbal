import type { Payload } from 'payload'

import { buildMatchStats } from './match-engine'

// Seizoensaggregatie per speler over álle afgelopen wedstrijden van een reeks.
// Telt de per-match statistieken op (buildMatchStats) en bewaart een punten-per-
// match-reeks voor de vormtrend. Admin/analyse-only gebruikt (kan zwaar zijn bij
// veel wedstrijden — daarom enkel server-side, force-dynamic).

export interface SeasonPlayer {
  playerId: number
  name: string
  shirtNumber: number
  teamId: number | null
  teamName: string
  matches: number
  throws: number
  goals: number
  points: number
  nek: number
  rug: number
  goalAttempts: number
  conversion: number
  lost: number
  score: number
  zones: { links: number; midden: number; rechts: number }
  avgDistance: number
  maxDistance: number
  /** Punten per gespeelde wedstrijd (chronologisch) — voor de vormcurve. */
  trend: { date: string; points: number }[]
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildSeasonStats(payload: Payload, reeks: string): Promise<SeasonPlayer[]> {
  // Ploegen van de reeks → speler → ploegnaam.
  const teamsRes = await payload
    .find({ collection: 'teams', where: { reeks: { equals: reeks } }, depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamName = new Map<number, string>(teamsRes.docs.map((t) => [t.id, t.name as string]))
  const teamIds = teamsRes.docs.map((t) => t.id)
  const playerTeam = new Map<number, number>()
  if (teamIds.length) {
    const playersRes = await payload
      .find({ collection: 'players', where: { team: { in: teamIds } }, depth: 0, limit: 2000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const p of playersRes.docs) {
      const tid = rel((p as { team?: unknown }).team)
      if (tid != null) playerTeam.set(p.id as number, tid)
    }
  }

  // Afgelopen wedstrijden van de reeks, chronologisch (oud → nieuw) voor de trend.
  const matchRes = await payload
    .find({ collection: 'matches', where: { and: [{ reeks: { equals: reeks } }, { status: { equals: 'finished' } }] }, sort: 'date', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  const agg = new Map<number, SeasonPlayer>()
  const distAcc = new Map<number, { sum: number; n: number }>()

  for (const m of matches) {
    const matchId = (m as { id: number }).id
    const date = String((m as { date?: unknown }).date ?? '')
    let stats
    try {
      ;({ stats } = await buildMatchStats(payload, matchId))
    } catch {
      continue
    }
    for (const p of stats.players) {
      if (p.throws === 0) continue
      let s = agg.get(p.playerId)
      if (!s) {
        const tid = playerTeam.get(p.playerId) ?? null
        s = {
          playerId: p.playerId,
          name: p.playerName,
          shirtNumber: p.shirtNumber,
          teamId: tid,
          teamName: tid != null ? (teamName.get(tid) ?? '—') : '—',
          matches: 0,
          throws: 0,
          goals: 0,
          points: 0,
          nek: 0,
          rug: 0,
          goalAttempts: 0,
          conversion: 0,
          lost: 0,
          score: 0,
          zones: { links: 0, midden: 0, rechts: 0 },
          avgDistance: 0,
          maxDistance: 0,
          trend: [],
        }
        agg.set(p.playerId, s)
        distAcc.set(p.playerId, { sum: 0, n: 0 })
      }
      s.matches += 1
      s.throws += p.throws
      s.goals += p.goals.total
      s.points += p.goals.points
      s.nek += p.goals.nek
      s.rug += p.goals.rug
      s.goalAttempts += p.goalAttempts
      s.lost += p.lost
      s.score += p.score
      s.zones.links += p.zones.links
      s.zones.midden += p.zones.midden
      s.zones.rechts += p.zones.rechts
      if (p.distance.max > s.maxDistance) s.maxDistance = p.distance.max
      // Gewogen seizoensgemiddelde van de worpafstand (benadering op throws).
      if (p.distance.avg > 0) {
        const d = distAcc.get(p.playerId)!
        d.sum += p.distance.avg * p.throws
        d.n += p.throws
      }
      s.trend.push({ date, points: p.goals.points })
    }
  }

  for (const [id, s] of agg) {
    s.conversion = s.goalAttempts ? Math.round((s.goals / s.goalAttempts) * 100) / 100 : 0
    const d = distAcc.get(id)!
    s.avgDistance = d.n ? Math.round((d.sum / d.n) * 10) / 10 : 0
  }

  return [...agg.values()].sort((a, b) => b.points - a.points || b.goals - a.goals || b.throws - a.throws)
}
