import type { Payload } from 'payload'

import { buildMatchState, recordTimeout } from './match-engine'
import { readSimpleScore, type SimpleScoreState, type SimpleSide } from './simple-score'

// Engine voor de SIMPELE aantekenmodus (Starter-pakket). Werkt op een gewone
// `matches`-record maar zonder het worp-/balbezit-model: doelpunten worden als
// +1/+2 weggeschreven in matches.simpleScore. Klok, time-outs, helften en einde
// hergebruiken (waar zinvol) de bestaande match-engine-infrastructuur.

const relId = (v: unknown): number =>
  typeof v === 'object' && v ? Number((v as { id: number }).id) : Number(v)

async function loadSimpleMatch(payload: Payload, matchId: number) {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
  return {
    match,
    homeId: relId(match.homeTeam),
    awayId: relId(match.awayTeam),
    score: readSimpleScore(match),
    half: match.currentHalf ?? 1,
    clock: match.clockSeconds ?? 0,
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
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { status: 'live', currentHalf: 1, clockSeconds: 0, clockRunning: false },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_start', half: 1, gameClock: 0 },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Registreer een doelpunt (+1 nekworp / +2 rugworp). */
export async function recordSimpleGoal(payload: Payload, matchId: number, side: SimpleSide, points: 1 | 2) {
  const { match, score, half, clock } = await loadSimpleMatch(payload, matchId)
  // Eerste doelpunt zet een nog niet gestarte wedstrijd meteen op 'live'.
  if (match.status !== 'live') {
    await payload.update({ collection: 'matches', id: matchId, data: { status: 'live' }, overrideAccess: true })
  }
  score.goals.push({ side, points, half, clock, ts: Date.now() })
  return writeSimpleScore(payload, matchId, score)
}

/** Neem het laatst geregistreerde doelpunt terug. */
export async function undoSimpleGoal(payload: Payload, matchId: number) {
  const { score } = await loadSimpleMatch(payload, matchId)
  score.goals.pop()
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
