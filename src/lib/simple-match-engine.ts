import type { Payload } from 'payload'

import { buildMatchState, recordRefereeStop, recordTimeout } from './match-engine'
import { isSupportersMode } from './score-mode'
import {
  buildFixedSimpleScore,
  MATCH_ASSUMED_DONE_MS,
  readSimpleScore,
  type SimpleScoreState,
  type SimpleSide,
} from './simple-score'

// Engine voor de SIMPELE aantekenmodus (snelscoremodus). Werkt op een gewone
// `matches`-record maar zonder het worp-/balbezit-model: doelpunten worden als
// +1/+2 weggeschreven in matches.simpleScore. Klok, time-outs, helften en einde
// hergebruiken (waar zinvol) de bestaande match-engine-infrastructuur.

const relId = (v: unknown): number =>
  typeof v === 'object' && v ? Number((v as { id: number }).id) : Number(v)

// De LIVE klokstand (seconden): clockSeconds is enkel de vastgezette basis bij de laatste
// pauze; terwijl de klok loopt moet de verstreken tijd sinds clockUpdatedAt erbij geteld
// worden. Zonder dit kreeg elk snelscore-doelpunt clock 0 (en dus minuut 0 in de tijdlijn).
export function liveClockSeconds(m: { clockRunning?: boolean | null; clockUpdatedAt?: string | null; clockSeconds?: number | null }): number {
  const base = m.clockSeconds ?? 0
  if (!m.clockRunning || !m.clockUpdatedAt) return base
  const elapsed = (Date.now() - new Date(m.clockUpdatedAt).getTime()) / 1000
  return base + Math.max(0, elapsed)
}

async function loadSimpleMatch(payload: Payload, matchId: number) {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
  return {
    match,
    homeId: relId(match.homeTeam),
    awayId: relId(match.awayTeam),
    score: readSimpleScore(match),
    half: match.currentHalf ?? 1,
    clock: Math.floor(liveClockSeconds(match)),
  }
}

async function writeSimpleScore(payload: Payload, matchId: number, score: SimpleScoreState) {
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { simpleScore: score as unknown as Record<string, unknown> },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Start de wedstrijd in simpele modus: status live, helft 1, klok op 0. */
export async function startSimpleMatch(payload: Payload, matchId: number) {
  // Eén tik = starten én de klok laten lopen (intuïtiever dan eerst live, dan nog starten).
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { status: 'live', currentHalf: 1, clockSeconds: 0, clockRunning: true, clockUpdatedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_start', half: 1, gameClock: 0 },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** De speler die scoorde — verplicht in de snel-scoren-modus. */
export interface SimpleScorer {
  id: number
  number?: number
  name?: string
}

/** Registreer een doelpunt (+1 nekworp / +2 rugworp), toegeschreven aan een speler. */
export async function recordSimpleGoal(
  payload: Payload,
  matchId: number,
  side: SimpleSide,
  points: 1 | 2,
  scorer?: SimpleScorer,
) {
  const { match, score, half, clock } = await loadSimpleMatch(payload, matchId)
  const teamId = side === 'home' ? relId(match.homeTeam) : relId(match.awayTeam)

  let player: { id: number; shirtNumber?: number | null; name?: string | null; team?: unknown } | null = null
  if (scorer && Number.isFinite(scorer.id) && scorer.id > 0) {
    // Bewaak dat de gekozen speler tot de scorende ploeg behoort.
    player = await payload.findByID({ collection: 'players', id: scorer.id, depth: 0 }).catch(() => null)
    if (!player || relId(player.team) !== teamId) {
      throw new Error('Die speler hoort niet bij de scorende ploeg.')
    }
  } else if (!(await isSupportersMode(payload))) {
    // Geen scorer gekozen: dat mag enkel als de ploeg nóg geen spelers heeft (dan kan je
    // toch al aantekenen en de spelers later aanvullen). Heeft de ploeg wél spelers, dan
    // moet er een gekozen worden — zo blijft de scorerregistratie sluitend bij echte ploegen.
    // In supporters-modus (vrije livescore) noteren we bewust géén scorer: doel is doel.
    const teamPlayers = await payload.count({ collection: 'players', where: { team: { equals: teamId } } }).catch(() => ({ totalDocs: 1 }))
    if (teamPlayers.totalDocs > 0) {
      throw new Error('Selecteer eerst de speler die scoorde.')
    }
  }

  // Eerste doelpunt zet een nog niet gestarte wedstrijd meteen op 'live'.
  if (match.status !== 'live') {
    await payload.update({ collection: 'matches', id: matchId, data: { status: 'live' }, overrideAccess: true })
  }
  score.goals.push({
    side,
    points,
    half,
    clock,
    ts: Date.now(),
    ...(player ? { scorerId: player.id } : {}),
    ...(player
      ? {
          scorerNumber: typeof player.shirtNumber === 'number' ? player.shirtNumber : scorer?.number,
          scorerName: typeof player.name === 'string' ? player.name : scorer?.name,
        }
      : {}),
  })
  return writeSimpleScore(payload, matchId, score)
}

/** Neem het laatst geregistreerde doelpunt van de HUIDIGE helft terug.
 * Een afgelopen, door de scheidsrechter bevestigde helft is vergrendeld en kan
 * dus niet meer aangepast worden. */
export async function undoSimpleGoal(payload: Payload, matchId: number) {
  const { score, half } = await loadSimpleMatch(payload, matchId)
  for (let i = score.goals.length - 1; i >= 0; i--) {
    if ((Number(score.goals[i].half) || 1) === half) {
      score.goals.splice(i, 1)
      break
    }
  }
  return writeSimpleScore(payload, matchId, score)
}

/** Pas het aantal kruisjes aan (+1 / −1, niet onder 0). */
export async function adjustSimpleCross(payload: Payload, matchId: number, side: SimpleSide, delta: number) {
  const { score } = await loadSimpleMatch(payload, matchId)
  score.crosses[side] = Math.max(0, score.crosses[side] + (delta < 0 ? -1 : 1))
  return writeSimpleScore(payload, matchId, score)
}

/** Pas een time-out aan: +1 (binnen het limiet) of −1 (laatste verwijderen). */
export async function adjustSimpleTimeout(payload: Payload, matchId: number, side: SimpleSide, delta: number) {
  const { homeId, awayId, half } = await loadSimpleMatch(payload, matchId)
  const teamId = side === 'home' ? homeId : awayId
  if (delta < 0) {
    const last = await payload.find({
      collection: 'match-events',
      where: {
        and: [
          { match: { equals: matchId } },
          { type: { equals: 'timeout' } },
          { team: { equals: teamId } },
          { half: { equals: half } },
        ],
      },
      sort: '-createdAt',
      depth: 0,
      limit: 1,
    })
    if (last.docs[0]) {
      await payload.delete({ collection: 'match-events', id: last.docs[0].id, overrideAccess: true })
    }
    return buildMatchState(payload, matchId)
  }
  // +1 — hergebruik de bestaande regel (max. 2 per ploeg per helft).
  return recordTimeout(payload, matchId, teamId)
}

/** Scheidsrechter-minuut (onderbreking) aanpassen: +1 toevoegen of −1 (laatste verwijderen). */
export async function adjustRefereeStop(payload: Payload, matchId: number, delta: number) {
  const { half } = await loadSimpleMatch(payload, matchId)
  if (delta < 0) {
    const last = await payload.find({
      collection: 'match-events',
      where: {
        and: [{ match: { equals: matchId } }, { type: { equals: 'referee_stop' } }, { half: { equals: half } }],
      },
      sort: '-createdAt',
      depth: 0,
      limit: 1,
    })
    if (last.docs[0]) {
      await payload.delete({ collection: 'match-events', id: last.docs[0].id, overrideAccess: true })
    }
    return buildMatchState(payload, matchId)
  }
  return recordRefereeStop(payload, matchId)
}

/**
 * Wedstrijd gedaan maar niet live aangetekend? Dan geeft een supporter achteraf in één keer de
 * eindstand door. De stand wordt — zoals overal — niet los opgeslagen maar als simpleScore
 * weggeschreven (zelfde primitieve als de uitslagen-import), zodat buildMatchState ze gewoon
 * afleidt. De vertrouwenslaag (score-trust) labelt de uitslag 🟡 tot supporters bevestigen.
 */
export async function reportFinalResult(payload: Payload, matchId: number, home: number, away: number) {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
  if ((match as { analyseOnly?: boolean }).analyseOnly) {
    throw new Error('Analyse-opnames hebben geen publieke uitslag.')
  }
  if (match.status === 'finished') {
    throw new Error('Deze wedstrijd is al afgesloten. Klopt de uitslag niet? Betwist ze dan onder het scorebord.')
  }
  if (match.status === 'live') {
    throw new Error('Deze wedstrijd wordt live aangetekend — geef doelpunten door via het aantekenscherm.')
  }
  // Pas ná het aangenomen-gedaan-venster: tot dan kan de match in werkelijkheid nog bezig zijn
  // (auto-live op het bord) en hoort de score via het aantekenscherm te lopen, niet als eindstand.
  const kickoff = match.date ? new Date(match.date as string).getTime() : NaN
  if (!Number.isFinite(kickoff) || Date.now() < kickoff + MATCH_ASSUMED_DONE_MS) {
    throw new Error('Een uitslag doorgeven kan pas als de wedstrijd zeker gedaan is — teken ze anders gewoon live aan.')
  }
  if (![home, away].every((n) => Number.isInteger(n) && n >= 0 && n <= 199)) {
    throw new Error('Geef een geldige eindstand op (gehele cijfers, 0–199).')
  }
  // Dubbele bron uitsluiten: zijn er al worp-events of snelscore-doelpunten geregistreerd,
  // dan loopt de uitslag via die notatie en niet via dit formulier.
  const thrown = await payload
    .count({ collection: 'throws', where: { match: { equals: matchId } } })
    .catch(() => ({ totalDocs: 0 }))
  if (thrown.totalDocs > 0 || readSimpleScore(match).goals.length > 0) {
    throw new Error('Deze wedstrijd heeft al genoteerde doelpunten — pas de score aan via het aantekenscherm.')
  }
  // Status → finished zet server-side automatisch finishedAt (hook op Matches), waarmee ook het
  // bevestig-/betwistvenster van de vertrouwenslaag opent.
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      status: 'finished',
      currentHalf: 2,
      clockRunning: false,
      simpleScore: buildFixedSimpleScore(home, away) as unknown as Record<string, unknown>,
    },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Beëindig de huidige helft en start meteen de volgende (zonder balbezit). */
export async function advanceSimpleHalf(payload: Payload, matchId: number) {
  const { half, clock } = await loadSimpleMatch(payload, matchId)
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_end', half, gameClock: clock },
    overrideAccess: true,
  })
  const next = half + 1
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { currentHalf: next, clockSeconds: 0, clockRunning: false },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_start', half: next, gameClock: 0 },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}
