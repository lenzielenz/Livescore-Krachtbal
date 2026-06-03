// Simpele scoringsmodus (Starter-pakket): snelle doelpunten +1 (nekworp) / +2
// (rugworp), zoals in de tornooi-modus. Géén veldschema, géén worp-events.
//
// Deze data wordt los van de Throws-pipeline bewaard, op de match zelf
// (matches.simpleScore, een JSON-veld). buildMatchState telt ze mee in de
// stand zodat het publieke scorebord en de matchpagina ze tonen.
//
// Pure module zonder externe imports — gedeeld door de match-engine en de
// simple-match-engine (voorkomt een circulaire import).

export type SimpleSide = 'home' | 'away'

export interface SimpleGoal {
  side: SimpleSide
  /** 1 = nekworp, 2 = rugworp. */
  points: 1 | 2
  half: number
  /** Klokstand (seconden) op het moment van het doelpunt. */
  clock: number
  /** Unix-tijdstempel (ms) — voor undo/volgorde. */
  ts: number
  /** Speler die scoorde — verplicht in de snel-scoren-modus (niet bij tornooien). */
  scorerId?: number
  /** Rugnummer + naam van de scorer, bewaard voor weergave op blad/tijdlijn. */
  scorerNumber?: number
  scorerName?: string
}

export interface SimpleScoreState {
  goals: SimpleGoal[]
  crosses: { home: number; away: number }
}

export const EMPTY_SIMPLE_SCORE: SimpleScoreState = {
  goals: [],
  crosses: { home: 0, away: 0 },
}

/** Lees en normaliseer het simpleScore-veld van een match (tolereert null/ruw JSON). */
export function readSimpleScore(match: { simpleScore?: unknown } | null | undefined): SimpleScoreState {
  const raw = match?.simpleScore
  if (!raw || typeof raw !== 'object') return { goals: [], crosses: { home: 0, away: 0 } }
  const obj = raw as Partial<SimpleScoreState>
  const goals = Array.isArray(obj.goals)
    ? obj.goals
        .filter((g): g is SimpleGoal => Boolean(g) && (g.side === 'home' || g.side === 'away'))
        .map((g): SimpleGoal => ({
          side: g.side,
          points: g.points === 2 ? 2 : 1,
          half: Number(g.half) || 1,
          clock: Number(g.clock) || 0,
          ts: Number(g.ts) || 0,
          ...(Number.isFinite(Number(g.scorerId)) && Number(g.scorerId) > 0
            ? { scorerId: Number(g.scorerId) }
            : {}),
          ...(Number.isFinite(Number(g.scorerNumber)) ? { scorerNumber: Number(g.scorerNumber) } : {}),
          ...(typeof g.scorerName === 'string' && g.scorerName ? { scorerName: g.scorerName } : {}),
        }))
    : []
  const crosses = {
    home: Math.max(0, Number(obj.crosses?.home) || 0),
    away: Math.max(0, Number(obj.crosses?.away) || 0),
  }
  return { goals, crosses }
}

/** Helft-scores [helft1, helft2] per ploeg, afgeleid uit de simpele doelpunten. */
export function simpleHalfScores(state: SimpleScoreState): { home: [number, number]; away: [number, number] } {
  const out = { home: [0, 0] as [number, number], away: [0, 0] as [number, number] }
  for (const g of state.goals) {
    const idx = g.half >= 2 ? 1 : 0
    out[g.side][idx] += g.points
  }
  return out
}
