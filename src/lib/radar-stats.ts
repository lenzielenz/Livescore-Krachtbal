import type { Payload } from 'payload'

import { loadMatchThrowData } from './match-engine'

// Match-gerelateerde radar-statistiek per speler (seizoen, per reeks). De assen zijn
// krachtbal-specifiek: aanval (worpvolume), succesvolle aanvallen (conversie), worpafstand,
// forceren (worpen > 12 m die NIET de laatste worp zijn), flankspel (links/rechts i.p.v.
// midden) en verdediging (vangsten). Admin/analyse-only (force-dynamic).

// Een worp telt als "geforceerd" als ze van verder dan deze afstand komt en niet de
// afrondende (laatste) worp van het balbezit is.
export const FORCE_DISTANCE_M = 12

export interface RadarPlayer {
  playerId: number
  name: string
  shirtNumber: number
  teamId: number | null
  teamName: string
  matches: number
  /** Aanval — worpen per wedstrijd. */
  throwsPerMatch: number
  /** Succesvolle aanvallen — conversie (doelpunten / doelpogingen), 0..1. */
  conversion: number
  /** Worpafstand — gemiddelde afstand (m). */
  avgDistance: number
  /** Forceren — geforceerde worpen (> 12 m, niet de laatste) per wedstrijd. */
  forcedPerMatch: number
  /** Links werpen — aandeel worpen naar de linkerzone, 0..1. */
  linksShare: number
  /** Rechts werpen — aandeel worpen naar de rechterzone, 0..1. */
  rechtsShare: number
  /** Verdediging — vangsten per wedstrijd. */
  catchesPerMatch: number
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildRadarStats(payload: Payload, reeks: string): Promise<RadarPlayer[]> {
  const teamsRes = await payload
    .find({ collection: 'teams', where: { reeks: { equals: reeks } }, depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamName = new Map<number, string>(teamsRes.docs.map((t) => [t.id, t.name as string]))
  const teamIds = teamsRes.docs.map((t) => t.id)
  const playerTeam = new Map<number, number>()
  const playerIds: number[] = []
  if (teamIds.length) {
    const playersRes = await payload
      .find({ collection: 'players', where: { team: { in: teamIds } }, depth: 0, limit: 2000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const p of playersRes.docs) {
      const tid = rel((p as { team?: unknown }).team)
      if (tid != null) playerTeam.set(p.id as number, tid)
      playerIds.push(p.id as number)
    }
  }

  const matchRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ reeks: { equals: reeks } }, { status: { equals: 'finished' } }] },
      sort: 'date',
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  type Acc = {
    playerId: number
    name: string
    shirt: number
    matches: Set<number>
    throws: number
    goals: number
    goalAttempts: number
    forced: number
    links: number
    rechts: number
    zoned: number
    distSum: number
    distN: number
    catches: number
  }
  const agg = new Map<number, Acc>()
  const get = (id: number, name: string, shirt: number): Acc => {
    let a = agg.get(id)
    if (!a) {
      a = { playerId: id, name, shirt, matches: new Set(), throws: 0, goals: 0, goalAttempts: 0, forced: 0, links: 0, rechts: 0, zoned: 0, distSum: 0, distN: 0, catches: 0 }
      agg.set(id, a)
    }
    return a
  }

  for (const m of matches) {
    const matchId = (m as { id: number }).id
    let stat
    try {
      ;({ stat } = await loadMatchThrowData(payload, matchId))
    } catch {
      continue
    }
    for (const t of stat) {
      if (!t.playerId) continue
      const a = get(t.playerId, t.playerName, t.shirtNumber)
      a.matches.add(matchId)
      a.throws += 1
      if (t.isLastThrow) a.goalAttempts += 1
      if (t.outcome === 'goal') a.goals += 1
      if (typeof t.distance === 'number') {
        a.distSum += t.distance
        a.distN += 1
        if (t.distance > FORCE_DISTANCE_M && !t.isLastThrow) a.forced += 1
      }
      if (t.zone) {
        a.zoned += 1
        if (t.zone === 'links') a.links += 1
        else if (t.zone === 'rechts') a.rechts += 1
      }
    }
  }

  // Verdediging: vangsten per speler (tegenstander-worpen die zij vingen).
  if (playerIds.length) {
    const catchRes = await payload
      .find({ collection: 'throws', where: { caughtBy: { in: playerIds } }, depth: 0, limit: 8000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const tw of catchRes.docs) {
      const cid = rel((tw as { caughtBy?: unknown }).caughtBy)
      if (cid == null) continue
      const a = agg.get(cid)
      if (a) a.catches += 1
    }
  }

  const players: RadarPlayer[] = [...agg.values()].map((a) => {
    const mc = a.matches.size || 1
    const tid = playerTeam.get(a.playerId) ?? null
    return {
      playerId: a.playerId,
      name: a.name,
      shirtNumber: a.shirt,
      teamId: tid,
      teamName: tid != null ? (teamName.get(tid) ?? '—') : '—',
      matches: a.matches.size,
      throwsPerMatch: Math.round((a.throws / mc) * 10) / 10,
      conversion: a.goalAttempts ? Math.round((a.goals / a.goalAttempts) * 100) / 100 : 0,
      avgDistance: a.distN ? Math.round((a.distSum / a.distN) * 10) / 10 : 0,
      forcedPerMatch: Math.round((a.forced / mc) * 10) / 10,
      linksShare: a.zoned ? Math.round((a.links / a.zoned) * 100) / 100 : 0,
      rechtsShare: a.zoned ? Math.round((a.rechts / a.zoned) * 100) / 100 : 0,
      catchesPerMatch: Math.round((a.catches / mc) * 10) / 10,
    }
  })

  // Standaard gesorteerd op aanvalsvolume (relevante eerste keuze in de speler-dropdown).
  players.sort((x, y) => y.throwsPerMatch - x.throwsPerMatch || y.conversion - x.conversion)
  return players
}
