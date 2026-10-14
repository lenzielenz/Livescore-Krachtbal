import type { Payload } from 'payload'

import { buildReeksStandings } from './reeks-standings'
import type { StandingsMatch } from './standings'

// Verwachte score voor een nog te spelen wedstrijd — puur afgeleid uit de gespeelde wedstrijden
// van de reeks, niets opgeslagen.
//
// Een eenvoudig aanval/verdediging-model (in de geest van Dixon–Coles), dat elke uitslag van de
// reeks gebruikt in plaats van enkel twee seizoensgemiddelden:
//  • Elke ploeg krijgt een aanvalssterkte en een verdedigingszwakte t.o.v. het reeksgemiddelde
//    (1 = gemiddeld). De verwachte score is dan
//        thuis = gemiddelde thuisscore × aanval(thuis) × verdediging(uit)
//        uit   = gemiddelde uitscore   × aanval(uit)   × verdediging(thuis)
//  • Tegenstanders tellen mee: 15 punten scoren tegen de leider zegt meer dan 15 tegen de laatste.
//    De sterktes worden daarom samen bijgesteld tot ze bij alle uitslagen passen.
//  • Thuisvoordeel komt uit de reeks zelf (scoren thuisploegen hier echt meer?).
//  • Recente wedstrijden wegen zwaarder (halveringstijd 6 weken): vorm verandert.
//  • Weinig data = voorzichtig: elke ploeg start met twee "gemiddelde" schaduwwedstrijden, zodat
//    één uitschieter op de eerste speeldag de schatting niet laat ontsporen. Hoe meer er gespeeld
//    is, hoe minder die nog wegen.
//  • Forfaits tellen niet mee: die score is administratief, niet gespeeld.
// Puur en getest; het verzamelen van de data (DB) zit in buildExpectedScore hieronder.

export interface ExpectedScore {
  home: number
  away: number
}

/** Na zoveel dagen weegt een wedstrijd nog half zo zwaar. */
const HALVERINGSTIJD_DAGEN = 42
/** Schaduwwedstrijden op reeksgemiddelde per ploeg (krimp naar het gemiddelde bij weinig data). */
const SCHADUW = 2
/** Idem voor het thuisvoordeel van de reeks. */
const SCHADUW_THUIS = 6
const RONDES = 40
const DAG_MS = 24 * 60 * 60 * 1000

/**
 * Verwachte eindstand van `homeId` tegen `awayId`, op basis van de gespeelde wedstrijden van de
 * reeks. Null als er nog niets (echt) gespeeld is.
 */
export function schatScore(uitslagen: StandingsMatch[], homeId: number, awayId: number, nu: number = Date.now()): ExpectedScore | null {
  const gespeeld = uitslagen
    .filter((m) => m.forfait === 'none')
    .map((m) => {
      const t = m.date ? new Date(m.date).getTime() : NaN
      const ouderdom = Number.isFinite(t) ? Math.max(0, nu - t) / DAG_MS : 0
      return { ...m, w: Math.pow(0.5, ouderdom / HALVERINGSTIJD_DAGEN) }
    })
  const W = gespeeld.reduce((s, m) => s + m.w, 0)
  if (gespeeld.length === 0 || W <= 0) return null

  // Reeksgemiddelden, met het thuisvoordeel voorzichtig gekrompen naar "geen voordeel".
  const thuisSom = gespeeld.reduce((s, m) => s + m.w * m.homeGoals, 0)
  const uitSom = gespeeld.reduce((s, m) => s + m.w * m.awayGoals, 0)
  const mu = (thuisSom + uitSom) / (2 * W)
  if (mu <= 0) return { home: 0, away: 0 }
  const muThuis = (thuisSom + SCHADUW_THUIS * mu) / (W + SCHADUW_THUIS)
  const muUit = (uitSom + SCHADUW_THUIS * mu) / (W + SCHADUW_THUIS)

  const ids = new Set<number>([homeId, awayId])
  for (const m of gespeeld) ids.add(m.homeId).add(m.awayId)
  const aanval = new Map([...ids].map((id) => [id, 1]))
  const verdediging = new Map([...ids].map((id) => [id, 1]))
  const a = (id: number) => aanval.get(id) ?? 1
  const d = (id: number) => verdediging.get(id) ?? 1

  for (let r = 0; r < RONDES; r++) {
    for (const id of ids) {
      // Aanval: wat de ploeg scoorde, gedeeld door wat een gemiddelde aanval tegen dezelfde
      // verdedigingen (thuis of uit) zou scoren — plus de schaduwwedstrijden.
      let gescoord = SCHADUW * mu
      let verwacht = SCHADUW * mu
      for (const m of gespeeld) {
        if (m.homeId === id) {
          gescoord += m.w * m.homeGoals
          verwacht += m.w * muThuis * d(m.awayId)
        } else if (m.awayId === id) {
          gescoord += m.w * m.awayGoals
          verwacht += m.w * muUit * d(m.homeId)
        }
      }
      aanval.set(id, gescoord / verwacht)
    }
    for (const id of ids) {
      let tegen = SCHADUW * mu
      let verwacht = SCHADUW * mu
      for (const m of gespeeld) {
        if (m.homeId === id) {
          tegen += m.w * m.awayGoals
          verwacht += m.w * muUit * a(m.awayId)
        } else if (m.awayId === id) {
          tegen += m.w * m.homeGoals
          verwacht += m.w * muThuis * a(m.homeId)
        }
      }
      verdediging.set(id, tegen / verwacht)
    }
    // Schaal vastzetten: de gemiddelde aanval blijft 1 (anders kunnen aanval en verdediging samen
    // wegdrijven zonder dat de verwachte scores veranderen).
    const gem = [...aanval.values()].reduce((s, v) => s + v, 0) / aanval.size
    if (gem > 0) for (const id of ids) {
      aanval.set(id, a(id) / gem)
      verdediging.set(id, d(id) * gem)
    }
  }

  return {
    home: Math.max(0, Math.round(muThuis * a(homeId) * d(awayId))),
    away: Math.max(0, Math.round(muUit * a(awayId) * d(homeId))),
  }
}

/** Verwachte score voor een specifieke, nog te spelen wedstrijd in een reeks. */
export async function buildExpectedScore(
  payload: Payload,
  reeks: string,
  homeTeamId: number,
  awayTeamId: number,
): Promise<ExpectedScore | null> {
  const { clinchCtx } = await buildReeksStandings(payload, reeks)
  return schatScore(clinchCtx.results, homeTeamId, awayTeamId)
}
