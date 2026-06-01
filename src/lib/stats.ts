// Pure statistiek-aggregatie uit worp-events. De onderscheidende kracht: per speler
// worp-verdeling, grond/gevangen, afstand, doelpunten en zoneverdeling.

import type { TeamSide, ThrowOutcome, ThrowType } from './krachtbal-rules'
import type { Zone } from './field'

export interface StatThrow {
  playerId: number
  playerName: string
  shirtNumber: number
  teamSide: TeamSide
  throwNumber: number
  isLastThrow: boolean
  type: ThrowType
  outcome: ThrowOutcome
  distance: number | null
  zone: Zone | null
}

export interface PlayerStats {
  playerId: number
  playerName: string
  shirtNumber: number
  teamSide: TeamSide
  throws: number
  order: { first: number; second: number; last: number }
  ground: number
  caught: number
  /** Buiten (zijlijn + achterlijn). */
  out: number
  /** Geforceerd / balverlies = gevangen + buiten (alle worpen die de bal kwijtspelen). */
  lost: number
  /** Doelpogingen: worpen vanaf de doelworp-positie (gegaan voor goal). */
  goalAttempts: number
  /** Conversie = doelpunten / doelpogingen (0..1). */
  conversion: number
  /** Netto bijdrage: doelpunt-punten − gevangen worpen. Een gevangen worp is een fout
   * (bal in de handen van de tegenstander gegooid) en telt negatief. */
  score: number
  goals: { nek: number; rug: number; total: number; points: number }
  distance: { avg: number; max: number }
  zones: { links: number; midden: number; rechts: number }
}

export interface TeamStats {
  throws: number
  goals: number
  points: number
  avgDistance: number
  maxDistance: number
  caughtRatio: number
}

export interface MatchStats {
  players: PlayerStats[]
  teams: { home: TeamStats; away: TeamStats }
}

function emptyPlayer(t: StatThrow): PlayerStats {
  return {
    playerId: t.playerId,
    playerName: t.playerName,
    shirtNumber: t.shirtNumber,
    teamSide: t.teamSide,
    throws: 0,
    order: { first: 0, second: 0, last: 0 },
    ground: 0,
    caught: 0,
    out: 0,
    lost: 0,
    goalAttempts: 0,
    conversion: 0,
    score: 0,
    goals: { nek: 0, rug: 0, total: 0, points: 0 },
    distance: { avg: 0, max: 0 },
    zones: { links: 0, midden: 0, rechts: 0 },
  }
}

export function aggregateStats(throws: StatThrow[]): MatchStats {
  const byPlayer = new Map<number, PlayerStats>()
  const distSum = new Map<number, { sum: number; n: number }>()

  const team = (): TeamStats => ({
    throws: 0,
    goals: 0,
    points: 0,
    avgDistance: 0,
    maxDistance: 0,
    caughtRatio: 0,
  })
  const teams = { home: team(), away: team() }
  const teamDist = { home: { sum: 0, n: 0 }, away: { sum: 0, n: 0 } }
  const teamCaught = { home: 0, away: 0 }

  for (const t of throws) {
    let ps = byPlayer.get(t.playerId)
    if (!ps) {
      ps = emptyPlayer(t)
      byPlayer.set(t.playerId, ps)
      distSum.set(t.playerId, { sum: 0, n: 0 })
    }

    ps.throws += 1
    if (t.throwNumber === 1) ps.order.first += 1
    if (t.throwNumber === 2) ps.order.second += 1
    if (t.isLastThrow) ps.order.last += 1

    if (t.outcome === 'caught') {
      ps.caught += 1
      teamCaught[t.teamSide] += 1
    } else {
      ps.ground += 1
    }
    if (t.outcome === 'out_side' || t.outcome === 'out_back') ps.out += 1
    // Doelpoging = worp vanaf de doelworp-positie (gegaan voor goal).
    if (t.isLastThrow) ps.goalAttempts += 1

    if (t.outcome === 'goal') {
      ps.goals.total += 1
      const pts = t.type === 'rug' ? 2 : 1
      ps.goals.points += pts
      if (t.type === 'rug') ps.goals.rug += 1
      else ps.goals.nek += 1
      teams[t.teamSide].goals += 1
      teams[t.teamSide].points += pts
    }

    if (t.zone) ps.zones[t.zone] += 1

    if (typeof t.distance === 'number') {
      const d = distSum.get(t.playerId)!
      d.sum += t.distance
      d.n += 1
      if (t.distance > ps.distance.max) ps.distance.max = t.distance
      const td = teamDist[t.teamSide]
      td.sum += t.distance
      td.n += 1
      if (t.distance > teams[t.teamSide].maxDistance) teams[t.teamSide].maxDistance = t.distance
    }

    teams[t.teamSide].throws += 1
  }

  for (const [id, ps] of byPlayer) {
    const d = distSum.get(id)!
    ps.distance.avg = d.n ? Math.round((d.sum / d.n) * 10) / 10 : 0
    // Gevangen worpen tellen negatief (fout: bal in de handen gegooid).
    ps.score = ps.goals.points - ps.caught
    // Geforceerd / balverlies = gevangen + buiten.
    ps.lost = ps.caught + ps.out
    ps.conversion = ps.goalAttempts ? Math.round((ps.goals.total / ps.goalAttempts) * 100) / 100 : 0
  }
  for (const side of ['home', 'away'] as const) {
    const td = teamDist[side]
    teams[side].avgDistance = td.n ? Math.round((td.sum / td.n) * 10) / 10 : 0
    teams[side].caughtRatio = teams[side].throws ? Math.round((teamCaught[side] / teams[side].throws) * 100) / 100 : 0
  }

  const players = [...byPlayer.values()].sort((a, b) => b.goals.points - a.goals.points || b.throws - a.throws)
  return { players, teams }
}
