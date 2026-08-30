import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import {
  buildTournamentState,
  createTournament,
  finishMatch,
  matchResetImpact,
  recordGoal,
  reopenMatch,
  resetMatch,
  startMatch,
} from '@/lib/tournament-engine'

// Op een tornooidag start iemand al eens een wedstrijd van een reeks die nog moet beginnen.
// Die vergissing moet je kunnen rechtzetten — en ze mag niet zomaar nog eens kunnen gebeuren.

let payload: Payload

async function maakTornooi(naam: string) {
  const id = await createTournament(payload, {
    name: naam,
    category: 'senioren',
    method: 'manual',
    slots: ['Ploeg A', 'Ploeg B', 'Ploeg C', 'Ploeg D'],
  })
  const state = await buildTournamentState(payload, id)
  // Ronde 1 met beide ploegen gekend: dat is een echte wedstrijd, geen bye.
  const eerste = state.rounds
    .flatMap((r) => r.matches)
    .find((m) => m.round === 1 && m.home && m.away)
  if (!eerste) throw new Error('Geen speelbare wedstrijd in ronde 1')
  return { id, matchId: eerste.id }
}

const haal = async (tournamentId: number, matchId: number) => {
  const state = await buildTournamentState(payload, tournamentId)
  const m = state.rounds.flatMap((r) => r.matches).find((x) => x.id === matchId)
  if (!m) throw new Error('Wedstrijd niet gevonden')
  return m
}

describe('tornooiwedstrijd per ongeluk gestart', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('zet een te vroeg gestarte wedstrijd terug op nog-niet-gestart', async () => {
    const { id, matchId } = await maakTornooi(`Reset-beker ${Date.now()}`)
    await startMatch(payload, matchId)
    await recordGoal(payload, matchId, 'home', 2)
    expect((await matchResetImpact(payload, matchId)).doelpunten).toBe(1)

    await resetMatch(payload, matchId)
    const m = await haal(id, matchId)
    expect(m.status).toBe('pending')
    expect(m.score).toEqual({ home: 0, away: 0 })
    expect(m.clockSeconds).toBe(0)
    expect(m.clockRunning).toBe(false)
    // De affiche blijft staan: de wedstrijd kan later gewoon gespeeld worden.
    expect(m.home).toBe('Ploeg A')

    await startMatch(payload, matchId)
    expect((await haal(id, matchId)).status).toBe('live')
  })

  // Op het kantinescherm bleef de klok op 00:00 staan terwijl er gespeeld werd: "start" zette de
  // status wel op live, maar liet de klokvelden ongemoeid. Start betekent nu letterlijk dat de
  // tijd vanaf nul begint te lopen.
  it('laat de klok lopen vanaf nul zodra de wedstrijd start', async () => {
    const { id, matchId } = await maakTornooi(`Klokbeker ${Date.now()}`)
    await startMatch(payload, matchId)
    const m = await haal(id, matchId)
    expect(m.status).toBe('live')
    expect(m.clockRunning).toBe(true)
    expect(m.currentHalf).toBe(1)
    // De state rekent de verstreken tijd al mee, dus vlak na de start staat ze op 0 of net erboven.
    expect(m.clockSeconds).toBeLessThan(3)
  })

  it('weigert een tweede start op dezelfde wedstrijd', async () => {
    const { matchId } = await maakTornooi(`Dubbelstart-beker ${Date.now()}`)
    await startMatch(payload, matchId)
    await expect(startMatch(payload, matchId)).rejects.toThrow(/al gestart/i)
  })

  it('vraagt om eerst te heropenen voor een afgelopen wedstrijd teruggezet kan worden', async () => {
    const { id, matchId } = await maakTornooi(`Eindbeker ${Date.now()}`)
    await startMatch(payload, matchId)
    await recordGoal(payload, matchId, 'home', 1)
    await finishMatch(payload, matchId)
    expect((await haal(id, matchId)).status).toBe('finished')

    await expect(resetMatch(payload, matchId)).rejects.toThrow(/heropen/i)

    // Heropenen trekt de winnaar terug uit de volgende ronde; dán pas kan de reset.
    await reopenMatch(payload, matchId)
    expect((await haal(id, matchId)).status).toBe('live')
    await resetMatch(payload, matchId)
    const m = await haal(id, matchId)
    expect(m.status).toBe('pending')
    expect(m.score).toEqual({ home: 0, away: 0 })
  })
})
