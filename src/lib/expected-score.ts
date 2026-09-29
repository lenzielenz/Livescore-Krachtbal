import type { Payload } from 'payload'

import { buildReeksStandings } from './reeks-standings'

// Verwachte score voor een nog te spelen wedstrijd — puur op basis van bestaande cijfers, geen
// eigen voorspelmodel met opgeslagen parameters. Twee ingrediënten:
//  - aanval/verdediging: het gemiddelde aantal punten dat een ploeg dit seizoen scoorde/
//    binnenkreeg per wedstrijd (uit de rangschikking, die al goalsFor/goalsAgainst/played bijhoudt);
//  - de rangschikking zelf: een ploeg die duidelijk beter staat (meer klassementspunten per
//    wedstrijd) krijgt een kleine verschuiving in haar voordeel, begrensd zodat één sterk seizoen
//    de score niet laat ontsporen.
// Puur en getest; het verzamelen van de data (DB) zit in buildExpectedScore hieronder.

export interface TeamForm {
  /** Gemiddeld gescoorde punten per wedstrijd dit seizoen. */
  attack: number
  /** Gemiddeld tegen gekregen punten per wedstrijd dit seizoen. */
  defense: number
  /** Klassementspunten per wedstrijd — maat voor hoe sterk de ploeg er dit seizoen voorstaat. */
  pointsPerMatch: number
}

export interface ExpectedScore {
  home: number
  away: number
}

/** Hoeveel de scoremarge verschuift per verschil in klassementspunten/wedstrijd, begrensd zodat
 *  de rangschikking de aanval-/verdedigingscijfers bijstuurt, nooit overstemt. */
const NUDGE_PER_PPM = 1.2
const MAX_NUDGE = 6

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/**
 * Verwachte eindstand: de aanval van elke ploeg tegenover de verdediging van de tegenstander,
 * met een kleine verschuiving op basis van wie er dit seizoen beter voorstaat.
 */
export function computeExpectedScore(home: TeamForm, away: TeamForm): ExpectedScore {
  const rawHome = (home.attack + away.defense) / 2
  const rawAway = (away.attack + home.defense) / 2
  const nudge = clamp((home.pointsPerMatch - away.pointsPerMatch) * NUDGE_PER_PPM, -MAX_NUDGE, MAX_NUDGE)
  return {
    home: Math.max(0, Math.round(rawHome + nudge / 2)),
    away: Math.max(0, Math.round(rawAway - nudge / 2)),
  }
}

/**
 * Bouwt de verwachte score voor een specifieke, nog te spelen wedstrijd in een reeks. Hergebruikt
 * de rangschikking (goalsFor/goalsAgainst/points/played per ploeg) — geen aparte query's nodig.
 * Een ploeg die dit seizoen nog niet speelde, valt terug op het reeksgemiddelde (anders 0–0 bij de
 * eerste speeldag). Null als er in de hele reeks nog niets gespeeld is — dan is er niets om op te
 * baseren.
 */
export async function buildExpectedScore(
  payload: Payload,
  reeks: string,
  homeTeamId: number,
  awayTeamId: number,
): Promise<ExpectedScore | null> {
  const { standings } = await buildReeksStandings(payload, reeks)
  const played = standings.filter((r) => r.played > 0)
  if (played.length === 0) return null

  const avg = (pick: (r: (typeof played)[number]) => number) => played.reduce((s, r) => s + pick(r), 0) / played.length
  const avgAttack = avg((r) => r.goalsFor / r.played)
  const avgDefense = avg((r) => r.goalsAgainst / r.played)
  const avgPointsPerMatch = avg((r) => r.points / r.played)

  const formOf = (teamId: number): TeamForm => {
    const row = standings.find((r) => r.teamId === teamId)
    if (!row || row.played === 0) return { attack: avgAttack, defense: avgDefense, pointsPerMatch: avgPointsPerMatch }
    return { attack: row.goalsFor / row.played, defense: row.goalsAgainst / row.played, pointsPerMatch: row.points / row.played }
  }

  return computeExpectedScore(formOf(homeTeamId), formOf(awayTeamId))
}
