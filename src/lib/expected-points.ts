import type { Payload } from 'payload'

import { attackDirForSide, loadMatchThrowData } from './match-engine'
import type { ThrowType } from './krachtbal-rules'

// Verwachte punten (xG-achtig model voor krachtbal).
//
// Een doelpoging = de laatste worp van een balbezit (isLastThrow). Het model leert
// uit de historiek de empirische scoringskans per (worptype × afstandsbucket):
//   kans = doelpunten / doelpogingen in die bucket.
// De verwachte punten van één poging = kans × puntwaarde (nekworp 1, rugworp 2).
// Per speler vergelijken we de werkelijke punten met de verwachte → de afwerker die
// "boven verwachting" scoort, presteert beter dan een gemiddelde speler vanuit
// dezelfde posities. Admin/analyse-only (force-dynamic).

export interface XpBucket {
  type: ThrowType
  distLabel: string
  attempts: number
  goals: number
  /** Empirische scoringskans (0..1) in deze bucket. */
  rate: number
}

export interface XpPlayer {
  playerId: number
  name: string
  shirtNumber: number
  teamId: number | null
  teamName: string
  attempts: number
  goals: number
  /** Werkelijk gescoorde punten uit doelpogingen. */
  points: number
  /** Verwachte punten op basis van het model. */
  xPoints: number
  /** Punten boven (+) of onder (−) verwachting. */
  diff: number
}

/** Canoniek vertrekpunt van een doelpoging (aanval steeds naar onder, doel bij y≈1). */
export interface DangerShot {
  x: number
  y: number
  goal: boolean
}

export interface XpResult {
  players: XpPlayer[]
  buckets: XpBucket[]
  totals: { attempts: number; goals: number; points: number; xPoints: number }
  /** Alle doelpogingen van de reeks, gespiegeld naar één aanvalsrichting — voor de veldkaart. */
  dangerShots: DangerShot[]
}

const pointValue = (type: ThrowType): number => (type === 'rug' ? 2 : 1)

// Vaste afstandsbuckets (m). Een aparte 'onbekend'-bucket vangt worpen zonder afstand.
function distBucket(d: number | null): string {
  if (d == null) return 'onbekend'
  if (d < 5) return '0–5m'
  if (d < 8) return '5–8m'
  if (d < 11) return '8–11m'
  if (d < 14) return '11–14m'
  return '14m+'
}
const DIST_ORDER = ['0–5m', '5–8m', '8–11m', '11–14m', '14m+', 'onbekend']

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildExpectedPoints(payload: Payload, reeks: string): Promise<XpResult> {
  // Ploegen + spelers van de reeks (voor de ploegnaam per speler).
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

  // Verzamel alle doelpogingen (laatste worp van een balbezit).
  type Attempt = { playerId: number; name: string; shirt: number; type: ThrowType; dist: number | null; goal: boolean }
  const attempts: Attempt[] = []
  const dangerShots: DangerShot[] = []
  for (const m of matches) {
    const matchId = (m as { id: number }).id
    let stat
    let shots
    try {
      ;({ stat, shots } = await loadMatchThrowData(payload, matchId))
    } catch {
      continue
    }
    for (const t of stat) {
      if (!t.isLastThrow || !t.playerId) continue
      attempts.push({
        playerId: t.playerId,
        name: t.playerName,
        shirt: t.shirtNumber,
        type: t.type,
        dist: t.distance,
        goal: t.outcome === 'goal',
      })
    }
    // Veldkaart: vertrekpunt van elke doelpoging, gespiegeld naar één aanvalsrichting
    // (doel onderaan, y≈1), zodat beide helften samenvallen tot één gevaarbeeld.
    for (const s of shots) {
      if (!s.isLastThrow) continue
      const dir = attackDirForSide(s.teamSide, s.period)
      dangerShots.push({
        x: dir === 'up' ? s.fromX : 1 - s.fromX,
        y: dir === 'up' ? s.fromY : 1 - s.fromY,
        goal: s.outcome === 'goal',
      })
    }
  }

  // Model: empirische scoringskans per (type × afstandsbucket).
  const bucketAcc = new Map<string, { type: ThrowType; distLabel: string; attempts: number; goals: number }>()
  const keyOf = (type: ThrowType, dist: number | null) => `${type}|${distBucket(dist)}`
  for (const a of attempts) {
    const k = keyOf(a.type, a.dist)
    let b = bucketAcc.get(k)
    if (!b) {
      b = { type: a.type, distLabel: distBucket(a.dist), attempts: 0, goals: 0 }
      bucketAcc.set(k, b)
    }
    b.attempts += 1
    if (a.goal) b.goals += 1
  }
  const rateOf = (type: ThrowType, dist: number | null): number => {
    const b = bucketAcc.get(keyOf(type, dist))
    return b && b.attempts > 0 ? b.goals / b.attempts : 0
  }

  // Per speler: werkelijke vs verwachte punten.
  const agg = new Map<number, XpPlayer>()
  for (const a of attempts) {
    let s = agg.get(a.playerId)
    if (!s) {
      const tid = playerTeam.get(a.playerId) ?? null
      s = {
        playerId: a.playerId,
        name: a.name,
        shirtNumber: a.shirt,
        teamId: tid,
        teamName: tid != null ? (teamName.get(tid) ?? '—') : '—',
        attempts: 0,
        goals: 0,
        points: 0,
        xPoints: 0,
        diff: 0,
      }
      agg.set(a.playerId, s)
    }
    const pv = pointValue(a.type)
    s.attempts += 1
    s.xPoints += rateOf(a.type, a.dist) * pv
    if (a.goal) {
      s.goals += 1
      s.points += pv
    }
  }

  const players = [...agg.values()]
  for (const s of players) {
    s.xPoints = Math.round(s.xPoints * 10) / 10
    s.diff = Math.round((s.points - s.xPoints) * 10) / 10
  }
  players.sort((a, b) => b.diff - a.diff || b.points - a.points || b.attempts - a.attempts)

  const buckets = [...bucketAcc.values()]
    .map((b) => ({ ...b, rate: b.attempts > 0 ? Math.round((b.goals / b.attempts) * 100) / 100 : 0 }))
    .sort((a, b) => a.type.localeCompare(b.type) || DIST_ORDER.indexOf(a.distLabel) - DIST_ORDER.indexOf(b.distLabel))

  const totals = players.reduce(
    (t, p) => ({
      attempts: t.attempts + p.attempts,
      goals: t.goals + p.goals,
      points: t.points + p.points,
      xPoints: Math.round((t.xPoints + p.xPoints) * 10) / 10,
    }),
    { attempts: 0, goals: 0, points: 0, xPoints: 0 },
  )

  return { players, buckets, totals, dangerShots }
}
