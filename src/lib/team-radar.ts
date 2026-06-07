import type { Payload, Where } from 'payload'

import { loadMatchThrowData } from './match-engine'
import { seasonClause } from './seasons'
import { readSimpleScore } from './simple-score'

// Ploeg-radar per reeks: aggregeert per ploeg de seizoensbrede aanvals- en verdedigingscijfers,
// zodat twee ploegen onderling én met het reeks-gemiddelde vergeleken kunnen worden.
export interface TeamRadar {
  teamId: number
  teamName: string
  matches: number
  throws: number
  goals: number
  points: number
  /** Worpen per wedstrijd. */
  throwsPerMatch: number
  /** Doelpunten per wedstrijd. */
  goalsPerMatch: number
  /** Punten per wedstrijd. */
  pointsPerMatch: number
  /** Conversie — doelpunten per doelpoging (0..1). */
  conversion: number
  /** Gemiddelde worpafstand (m). */
  avgDistance: number
  /** Vangsten per wedstrijd (verdediging). */
  catchesPerMatch: number
}

// Eén wedstrijdresultaat (op basis van de geregistreerde worpdata) — voor vorm & onderlinge duels.
export interface TeamMatchResult {
  date: string
  homeId: number
  awayId: number
  homePts: number
  awayPts: number
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildTeamRadar(payload: Payload, reeks: string, seizoen?: string | null, matchFilter?: Where | null): Promise<{ teams: TeamRadar[]; results: TeamMatchResult[] }> {
  const teamsRes = await payload
    .find({ collection: 'teams', where: { reeks: { equals: reeks } }, depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamName = new Map<number, string>(teamsRes.docs.map((t) => [t.id, t.name as string]))
  const teamIds = teamsRes.docs.map((t) => t.id)
  if (teamIds.length === 0) return { teams: [], results: [] }

  // Speler → ploeg (voor de vangsten-toewijzing).
  const playerTeam = new Map<number, number>()
  const playerIds: number[] = []
  const playersRes = await payload
    .find({ collection: 'players', where: { team: { in: teamIds } }, depth: 0, limit: 4000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  for (const p of playersRes.docs) {
    const tid = rel((p as { team?: unknown }).team)
    if (tid != null) playerTeam.set(p.id as number, tid)
    playerIds.push(p.id as number)
  }

  const matchRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ reeks: { equals: reeks } }, { status: { equals: 'finished' } }, ...seasonClause(seizoen), ...(matchFilter ? [matchFilter] : [])] },
      sort: 'date',
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  // matches = alle gespeelde wedstrijden (worpen óf geïmporteerde eindstand); recMatches = enkel
  // gedetailleerd opgenomen (worp)wedstrijden — voor de worp-gebaseerde gemiddelden.
  type Acc = { matches: Set<number>; recMatches: Set<number>; throws: number; throwGoals: number; goals: number; goalAttempts: number; points: number; distSum: number; distN: number; catches: number }
  const agg = new Map<number, Acc>()
  const get = (id: number): Acc => {
    let a = agg.get(id)
    if (!a) {
      a = { matches: new Set(), recMatches: new Set(), throws: 0, throwGoals: 0, goals: 0, goalAttempts: 0, points: 0, distSum: 0, distN: 0, catches: 0 }
      agg.set(id, a)
    }
    return a
  }

  const results: TeamMatchResult[] = []
  for (const m of matches) {
    const matchId = (m as { id: number }).id
    const homeId = rel((m as { homeTeam?: unknown }).homeTeam)
    const awayId = rel((m as { awayTeam?: unknown }).awayTeam)
    if (homeId == null || awayId == null || !teamName.has(homeId) || !teamName.has(awayId)) continue
    // Elke afgelopen wedstrijd telt als "gespeeld" voor beide ploegen.
    get(homeId).matches.add(matchId)
    get(awayId).matches.add(matchId)
    let homePts = 0
    let awayPts = 0

    // Gedetailleerde worpdata (indien opgenomen).
    try {
      const { stat } = await loadMatchThrowData(payload, matchId)
      if (stat.length) {
        get(homeId).recMatches.add(matchId)
        get(awayId).recMatches.add(matchId)
      }
      for (const t of stat) {
        const tid = t.teamSide === 'home' ? homeId : awayId
        const a = get(tid)
        a.throws += 1
        if (t.isLastThrow) a.goalAttempts += 1
        if (t.outcome === 'goal') {
          a.throwGoals += 1
          a.goals += 1
          const pts = t.type === 'rug' ? 2 : 1
          a.points += pts
          if (t.teamSide === 'home') homePts += pts
          else awayPts += pts
        }
        if (typeof t.distance === 'number') {
          a.distSum += t.distance
          a.distN += 1
        }
      }
    } catch {
      /* geen worpdata */
    }

    // Geïmporteerde/snel-genoteerde eindstand (geen worpdetail).
    for (const g of readSimpleScore(m as { simpleScore?: unknown }).goals) {
      const tid = g.side === 'home' ? homeId : awayId
      const a = get(tid)
      a.goals += 1
      a.points += g.points
      if (g.side === 'home') homePts += g.points
      else awayPts += g.points
    }

    results.push({ date: String((m as { date?: unknown }).date ?? ''), homeId, awayId, homePts, awayPts })
  }

  // Vangsten per ploeg (verdediging): tegenstander-worpen gevangen door eigen spelers.
  if (playerIds.length) {
    const catchRes = await payload
      .find({ collection: 'throws', where: { caughtBy: { in: playerIds } }, depth: 0, limit: 12000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const tw of catchRes.docs) {
      const cid = rel((tw as { caughtBy?: unknown }).caughtBy)
      const tid = cid != null ? playerTeam.get(cid) : null
      if (tid != null) get(tid).catches += 1
    }
  }

  const teams: TeamRadar[] = [...agg.entries()].map(([teamId, a]) => {
    const mc = a.matches.size || 1
    const rmc = a.recMatches.size || 1 // worp-gebaseerde gemiddelden over opgenomen wedstrijden
    return {
      teamId,
      teamName: teamName.get(teamId) ?? '—',
      matches: a.matches.size,
      throws: a.throws,
      goals: a.goals,
      points: a.points,
      throwsPerMatch: Math.round((a.throws / rmc) * 10) / 10,
      goalsPerMatch: Math.round((a.goals / mc) * 10) / 10,
      pointsPerMatch: Math.round((a.points / mc) * 10) / 10,
      conversion: a.goalAttempts ? Math.round(Math.min(1, a.throwGoals / a.goalAttempts) * 100) / 100 : 0,
      avgDistance: a.distN ? Math.round((a.distSum / a.distN) * 10) / 10 : 0,
      catchesPerMatch: Math.round((a.catches / rmc) * 10) / 10,
    }
  })

  teams.sort((x, y) => y.pointsPerMatch - x.pointsPerMatch || y.goalsPerMatch - x.goalsPerMatch)
  return { teams, results }
}
