import type { Payload, Where } from 'payload'

import { seasonClause } from './seasons'

// "Superster"-klassement per reeks: wie scoorde het meest (doelpunten + punten) en wie gooide de
// meeste rugworpen (+2). Telt zowel de gedetailleerde worpen (throws, outcome 'goal') als de
// snelscore-doelpunten (matches.simpleScore.goals) mee, zodat ook jeugdwedstrijden die met de
// basis-aantekentafel gescoord werden, meetellen. Server-side (kan zwaar zijn → force-dynamic).

export interface Superstar {
  playerId: number
  name: string
  shirtNumber: number | null
  teamName: string
  goals: number
  rug: number
  nek: number
  points: number
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildSuperstars(
  payload: Payload,
  reeks: string,
  seizoen?: string | null,
  matchFilter?: Where | null,
): Promise<Superstar[]> {
  // Ploegen van de reeks → spelers (naam, rugnummer, ploegnaam).
  const teamsRes = await payload
    .find({ collection: 'teams', where: { reeks: { equals: reeks } }, depth: 0, limit: 300 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamName = new Map<number, string>(teamsRes.docs.map((t) => [t.id, t.name as string]))
  const teamIds = teamsRes.docs.map((t) => t.id)
  const player = new Map<number, { name: string; shirt: number | null; teamName: string }>()
  if (teamIds.length) {
    const playersRes = await payload
      .find({ collection: 'players', where: { team: { in: teamIds } }, depth: 0, limit: 4000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const p of playersRes.docs) {
      const tid = rel((p as { team?: unknown }).team)
      player.set(p.id as number, {
        name: String((p as { name?: unknown }).name ?? '—'),
        shirt: typeof (p as { shirtNumber?: unknown }).shirtNumber === 'number' ? (p as { shirtNumber: number }).shirtNumber : null,
        teamName: tid != null ? (teamName.get(tid) ?? '—') : '—',
      })
    }
  }

  // Afgelopen wedstrijden van de reeks (geen demo/analyse-only).
  const matchRes = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { reeks: { equals: reeks } },
          { status: { equals: 'finished' } },
          { isDemo: { not_equals: true } },
          { analyseOnly: { not_equals: true } },
          ...seasonClause(seizoen),
          ...(matchFilter ? [matchFilter] : []),
        ],
      },
      depth: 0,
      limit: 1000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matchIds = matchRes.docs.map((m) => (m as { id: number }).id)

  const agg = new Map<number, Superstar>()
  const bump = (pid: number, pts: 1 | 2, fallbackName?: string, fallbackShirt?: number | null) => {
    let s = agg.get(pid)
    if (!s) {
      const info = player.get(pid)
      s = {
        playerId: pid,
        name: info?.name ?? fallbackName ?? '—',
        shirtNumber: info?.shirt ?? fallbackShirt ?? null,
        teamName: info?.teamName ?? '—',
        goals: 0,
        rug: 0,
        nek: 0,
        points: 0,
      }
      agg.set(pid, s)
    }
    s.goals += 1
    s.points += pts
    if (pts === 2) s.rug += 1
    else s.nek += 1
  }

  // 1) Gedetailleerde worpen die scoorden.
  if (matchIds.length) {
    const throwsRes = await payload
      .find({
        collection: 'throws',
        where: { and: [{ match: { in: matchIds } }, { outcome: { equals: 'goal' } }] },
        depth: 0,
        limit: 20000,
      })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const t of throwsRes.docs) {
      const pid = rel((t as { player?: unknown }).player)
      if (pid == null) continue
      bump(pid, (t as { type?: string }).type === 'rug' ? 2 : 1)
    }
  }

  // 2) Snelscore-doelpunten (basis-aantekentafel) met een gekende scorer.
  for (const m of matchRes.docs) {
    const ss = (m as { simpleScore?: unknown }).simpleScore as { goals?: unknown } | null
    const goals = Array.isArray(ss?.goals) ? (ss?.goals as Record<string, unknown>[]) : []
    for (const g of goals) {
      const pid = Number(g.scorerId)
      if (!Number.isFinite(pid) || pid <= 0) continue
      const pts = Number(g.points) === 2 ? 2 : 1
      bump(pid, pts, typeof g.scorerName === 'string' ? g.scorerName : undefined, typeof g.scorerNumber === 'number' ? g.scorerNumber : null)
    }
  }

  return [...agg.values()].sort((a, b) => b.points - a.points || b.goals - a.goals || b.rug - a.rug || a.name.localeCompare(b.name))
}
