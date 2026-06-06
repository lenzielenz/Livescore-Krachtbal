import type { Payload } from 'payload'

import { attackDirForSide, loadMatchThrowData } from './match-engine'
import type { ThrowType } from './krachtbal-rules'
import { seasonClause } from './seasons'

// Gevaarzone-kaart per speler: vanaf welke vertrekpositie scoort hij het best?
//
// Een doelpoging = de laatste worp van een balbezit. We nemen het VERTREKPUNT (van waar
// hij gooit) en spiegelen alle posities naar één canonieke aanvalsrichting (naar het doel
// onderaan, y≈1), zodat beide helften samenvallen. Per positie weten we of er gescoord werd
// → conversie per zone = "van daar is hij gevaarlijk". Admin/analyse-only (force-dynamic).

export interface DangerShot {
  /** Canoniek vertrekpunt (0..1), aanval steeds naar onder (doel bij y≈1). */
  x: number
  y: number
  /** Canonieke landingsplek (0..1) — waar de bal neerkwam (bij een doelpunt: waar hij scoorde). */
  landX: number
  landY: number
  goal: boolean
  type: ThrowType
}

export interface DangerBand {
  label: string
  attempts: number
  goals: number
  conversion: number
}

export interface PlayerDanger {
  playerId: number
  name: string
  shirtNumber: number
  attempts: number
  goals: number
  conversion: number
  avgDistance: number
  shots: DangerShot[]
  /** Conversie per diepteband (van waar op het veld). */
  depthBands: DangerBand[]
  /** Conversie per breedte-zone. */
  zoneBands: DangerBand[]
}

const band = (label: string): DangerBand => ({ label, attempts: 0, goals: 0, conversion: 0 })
function finalize(b: DangerBand): DangerBand {
  b.conversion = b.attempts ? Math.round((b.goals / b.attempts) * 100) / 100 : 0
  return b
}

export async function buildPlayerDanger(payload: Payload, playerId: number, reeks: string, seizoen?: string | null): Promise<PlayerDanger | null> {
  const player = await payload.findByID({ collection: 'players', id: playerId, depth: 0 }).catch(() => null)
  if (!player) return null

  const matchRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ reeks: { equals: reeks } }, { status: { equals: 'finished' } }, ...seasonClause(seizoen)] },
      sort: 'date',
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  const shots: DangerShot[] = []
  let goals = 0
  let distSum = 0
  let distN = 0

  for (const m of matches) {
    const matchId = (m as { id: number }).id
    let raw
    try {
      ;({ shots: raw } = await loadMatchThrowData(payload, matchId))
    } catch {
      continue
    }
    for (const s of raw) {
      if (s.playerId !== playerId || !s.isLastThrow) continue
      // Spiegel naar canonieke aanval (doel onderaan, y≈1) — zowel het vertrekpunt (van waar
      // hij gooit) als de landingsplek (waar de bal/zijn doelpunt neerkwam).
      const dir = attackDirForSide(s.teamSide, s.period)
      const x = dir === 'up' ? s.fromX : 1 - s.fromX
      const y = dir === 'up' ? s.fromY : 1 - s.fromY
      const landX = dir === 'up' ? s.x : 1 - s.x
      const landY = dir === 'up' ? s.y : 1 - s.y
      const goal = s.outcome === 'goal'
      shots.push({ x, y, landX, landY, goal, type: s.type })
      if (goal) goals += 1
      if (typeof s.distance === 'number') {
        distSum += s.distance
        distN += 1
      }
    }
  }

  // Dieptebanden (op de canonieke y van het vertrekpunt; doel bij y≈1).
  const dNear = band('Dichtbij doel')
  const dMid = band('Middenveld')
  const dFar = band('Ver van doel')
  // Breedte-zones.
  const zL = band('Links')
  const zM = band('Midden')
  const zR = band('Rechts')
  for (const s of shots) {
    const d = s.y >= 0.66 ? dNear : s.y >= 0.4 ? dMid : dFar
    d.attempts += 1
    if (s.goal) d.goals += 1
    const z = s.x < 1 / 3 ? zL : s.x > 2 / 3 ? zR : zM
    z.attempts += 1
    if (s.goal) z.goals += 1
  }

  const attempts = shots.length
  return {
    playerId,
    name: String((player as { name?: unknown }).name ?? '—'),
    shirtNumber: Number((player as { shirtNumber?: unknown }).shirtNumber ?? 0),
    attempts,
    goals,
    conversion: attempts ? Math.round((goals / attempts) * 100) / 100 : 0,
    avgDistance: distN ? Math.round((distSum / distN) * 10) / 10 : 0,
    shots,
    depthBands: [dNear, dMid, dFar].map(finalize),
    zoneBands: [zL, zM, zR].map(finalize),
  }
}

export interface TeamDanger {
  attempts: number
  goals: number
  conversion: number
  avgDistance: number
  shots: DangerShot[]
  depthBands: DangerBand[]
  zoneBands: DangerBand[]
}

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Gevaarzone van een hele ploeg: de doelpogingen van die ploeg over al haar wedstrijden,
// gespiegeld naar één canonieke aanvalsrichting. Voor de tegenstander-voorbereiding.
export async function buildTeamDanger(payload: Payload, teamId: number, reeks: string, seizoen?: string | null): Promise<TeamDanger> {
  const matchRes = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { reeks: { equals: reeks } },
          { status: { equals: 'finished' } },
          { or: [{ homeTeam: { equals: teamId } }, { awayTeam: { equals: teamId } }] },
          ...seasonClause(seizoen),
        ],
      },
      sort: 'date',
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const matches = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  const shots: DangerShot[] = []
  let goals = 0
  let distSum = 0
  let distN = 0
  for (const m of matches) {
    const matchId = (m as { id: number }).id
    const side: 'home' | 'away' = relId((m as { homeTeam?: unknown }).homeTeam) === teamId ? 'home' : 'away'
    let raw
    try {
      ;({ shots: raw } = await loadMatchThrowData(payload, matchId))
    } catch {
      continue
    }
    for (const s of raw) {
      if (s.teamSide !== side || !s.isLastThrow) continue
      const dir = attackDirForSide(s.teamSide, s.period)
      const x = dir === 'up' ? s.fromX : 1 - s.fromX
      const y = dir === 'up' ? s.fromY : 1 - s.fromY
      const landX = dir === 'up' ? s.x : 1 - s.x
      const landY = dir === 'up' ? s.y : 1 - s.y
      const goal = s.outcome === 'goal'
      shots.push({ x, y, landX, landY, goal, type: s.type })
      if (goal) goals += 1
      if (typeof s.distance === 'number') {
        distSum += s.distance
        distN += 1
      }
    }
  }

  const dNear = band('Dichtbij doel')
  const dMid = band('Middenveld')
  const dFar = band('Ver van doel')
  const zL = band('Links')
  const zM = band('Midden')
  const zR = band('Rechts')
  for (const s of shots) {
    const d = s.y >= 0.66 ? dNear : s.y >= 0.4 ? dMid : dFar
    d.attempts += 1
    if (s.goal) d.goals += 1
    const z = s.x < 1 / 3 ? zL : s.x > 2 / 3 ? zR : zM
    z.attempts += 1
    if (s.goal) z.goals += 1
  }
  const attempts = shots.length
  return {
    attempts,
    goals,
    conversion: attempts ? Math.round((goals / attempts) * 100) / 100 : 0,
    avgDistance: distN ? Math.round((distSum / distN) * 10) / 10 : 0,
    shots,
    depthBands: [dNear, dMid, dFar].map(finalize),
    zoneBands: [zL, zM, zR].map(finalize),
  }
}
