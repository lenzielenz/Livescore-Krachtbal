import type { Payload } from 'payload'

import { buildPredictionLeaderboard, type LeaderRow, type PredEntry } from './prediction-score'

// Pronostiekstand van een tornooidag: dezelfde puntenregels als de competitie (exact 10,
// resultaat+saldo 6, resultaat 3, nabijheid tot 3, dichtste-bij 2) — we hergebruiken de pure
// scoremodule en voeden ze met de afgewerkte tornooiwedstrijden.

type PredRaw = { userId?: number; name?: string; clubId?: number | null; home?: number; away?: number; at?: number }
type MatchDoc = {
  id: number
  status?: string
  home?: string | null
  away?: string | null
  goals?: { side?: 'home' | 'away'; points?: number }[] | null
  scorePredictions?: PredRaw[] | null
}

function scoreVan(goals: MatchDoc['goals']): { home: number; away: number } {
  const uit = { home: 0, away: 0 }
  for (const g of Array.isArray(goals) ? goals : []) {
    const p = Number(g?.points) || 0
    if (g?.side === 'away') uit.away += p
    else if (g?.side === 'home') uit.home += p
  }
  return uit
}

/** Klassement van een tornooidag (alle reeksen van de groep), op afgewerkte wedstrijden. */
export async function tornooiPronostiekStand(payload: Payload, groep: string): Promise<LeaderRow[]> {
  const tRes = await payload
    .find({ collection: 'tournaments', where: { groep: { equals: groep } }, depth: 0, limit: 50 })
    .catch(() => ({ docs: [] as { id: number }[] }))
  const ids = (tRes.docs as { id: number }[]).map((t) => Number(t.id))
  if (ids.length === 0) return []
  return standVoorIds(payload, ids)
}

/** Klassement van één reeks/tornooi — voor een los tornooi zonder tornooidag-groep. */
export async function reeksPronostiekStand(payload: Payload, tournamentId: number): Promise<LeaderRow[]> {
  return standVoorIds(payload, [tournamentId])
}

async function standVoorIds(payload: Payload, ids: number[]): Promise<LeaderRow[]> {
  const mRes = await payload
    .find({
      collection: 'tournament-matches',
      where: { and: [{ tournament: { in: ids } }, { status: { equals: 'finished' } }] },
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as MatchDoc[] }))

  const wedstrijden = (mRes.docs as MatchDoc[])
    .filter((m) => m.home && m.away && Array.isArray(m.scorePredictions) && m.scorePredictions.length > 0)
    .map((m) => ({
      actual: scoreVan(m.goals),
      preds: (m.scorePredictions as PredRaw[])
        .filter((p) => Number.isFinite(Number(p?.userId)))
        .map<PredEntry>((p) => ({
          userId: Number(p.userId),
          name: String(p.name ?? 'Supporter'),
          clubId: p.clubId ?? null,
          home: Number(p.home) || 0,
          away: Number(p.away) || 0,
          at: p.at,
        })),
    }))
    .filter((w) => w.preds.length > 0)

  return buildPredictionLeaderboard(wedstrijden)
}
