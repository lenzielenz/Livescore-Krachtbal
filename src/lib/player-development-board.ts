import type { Payload, Where } from 'payload'

import { buildPlayerDevelopment, type PlayerDevelopment } from './player-development'
import { buildSeasonStats } from './season-stats'

// Ontwikkelings-klassement: bouwt voor élke speler van de competitie de Skill+Fame-ontwikkeling
// (zelfde afleiding als op het spelersprofiel) en rangschikt ze. Maakt de feature vindbaar op één
// centrale plek (/ontwikkeling). Alles afgeleid — niets apart opgeslagen.

export type DevBoardEntry = {
  playerId: number
  name: string
  shirtNumber: number
  teamId: number | null
  teamName: string
  reeks: string
  dev: PlayerDevelopment
}

// 'Held van de match'-stemmen per speler optellen (Fame) — in één query i.p.v. per speler.
async function mvpVotesByPlayer(payload: Payload): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  try {
    const res = await payload.find({ collection: 'match-mvp-votes', depth: 0, limit: 100000, pagination: false })
    for (const v of res.docs) {
      const p = (v as { player?: unknown }).player
      const id = Number(p && typeof p === 'object' ? (p as { id?: unknown }).id : p)
      if (Number.isFinite(id) && id > 0) out.set(id, (out.get(id) ?? 0) + 1)
    }
  } catch {
    /* geen stemmen → enkel Skill telt */
  }
  return out
}

/**
 * Dedup op speler (hoogste score wint) + enkel wie al punten heeft + aflopend op overall score.
 * Puur en los testbaar; `buildDevelopmentBoard` levert de echte data aan.
 */
export function rankDevBoard<T extends { playerId: number; dev: { overall: { score: number } } }>(entries: T[]): T[] {
  const byId = new Map<number, T>()
  for (const e of entries) {
    if (e.dev.overall.score <= 0) continue
    const prev = byId.get(e.playerId)
    if (!prev || e.dev.overall.score > prev.dev.overall.score) byId.set(e.playerId, e)
  }
  return [...byId.values()].sort((a, b) => b.dev.overall.score - a.dev.overall.score)
}

export async function buildDevelopmentBoard(
  payload: Payload,
  reeksen: string[],
  matchFilter?: Where | null,
): Promise<DevBoardEntry[]> {
  const votes = await mvpVotesByPlayer(payload)
  const perReeks = await Promise.all(
    reeksen.map(async (reeks) => {
      const players = await buildSeasonStats(payload, reeks, null, matchFilter ?? undefined).catch(() => [])
      return players.map<DevBoardEntry>((s) => ({
        playerId: s.playerId,
        name: s.name,
        shirtNumber: s.shirtNumber,
        teamId: s.teamId,
        teamName: s.teamName,
        reeks,
        dev: buildPlayerDevelopment({
          matches: s.matches,
          throws: s.throws,
          goals: s.goals,
          rug: s.rug,
          conversion: s.conversion,
          goalAttempts: s.goalAttempts,
          maxDistance: s.maxDistance,
          zones: s.zones,
          mvpVotesReceived: votes.get(s.playerId) ?? 0,
        }),
      }))
    }),
  )
  return rankDevBoard(perReeks.flat())
}
