import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { finishMatch, recordThrow, setLineup, startMatch } from '@/lib/match-engine'
import type { RawResult } from '@/lib/results-import'
import { readSimpleScore } from '@/lib/simple-score'
import { pasUitslagenToe } from '@/lib/uitslagen-toepassen'

// De gevaarlijke kant van een automatische uitslagen-import: ze mag nooit een wedstrijd
// overschrijven die wij zelf aantekenden. `simpleScore` wordt in de match-state OPGETELD bij de
// score uit de worpen — een geïmporteerde eindstand zou de stand daar dus verdubbelen.

let payload: Payload

const uitslag = (over: Partial<RawResult> & { home: string; away: string; homeScore: number; awayScore: number }): RawResult => ({
  number: '',
  reeksCode: 'LH',
  reeks: 'LH',
  date: '',
  time: '15:00',
  referee: '',
  ...over,
})

async function maakOpstelling(teamId: number, van: number) {
  const uit: number[] = []
  const posities = ['achter', 'vleugel-links', 'vleugel-rechts', 'barage'] as const
  for (let i = 0; i < 4; i++) {
    const p = await payload.create({
      collection: 'players',
      data: { name: `Speler ${van + i}`, shirtNumber: van + i, team: teamId, position: posities[i] },
      overrideAccess: true,
    })
    uit.push(p.id as number)
  }
  return uit
}

async function maakOmgeving() {
  const stamp = Date.now() + Math.floor(Math.random() * 1000)
  const club = await payload.create({ collection: 'clubs', data: { name: `Uitslagclub ${stamp}` }, overrideAccess: true })
  const mk = (naam: string) =>
    payload.create({ collection: 'teams', data: { name: naam, reeks: 'LH', category: 'senioren', club: club.id }, overrideAccess: true })
  const thuis = await mk(`Thuis ${stamp}`)
  const uit = await mk(`Uit ${stamp}`)
  const datum = '2026-03-07'
  const maakMatch = () =>
    payload.create({
      collection: 'matches',
      data: {
        reeks: 'LH',
        homeTeam: thuis.id,
        awayTeam: uit.id,
        date: `${datum}T15:00:00`,
        status: 'scheduled',
        goalAreaDepth: 10,
      },
      overrideAccess: true,
    })
  return { thuis, uit, datum, maakMatch, naam: { thuis: `Thuis ${stamp}`, uit: `Uit ${stamp}` } }
}

describe('uitslagen van de federatie toepassen', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('vult een wedstrijd zonder eigen registratie aan', async () => {
    const o = await maakOmgeving()
    const m = await o.maakMatch()

    const rapport = await pasUitslagenToe(
      payload,
      [uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 12, awayScore: 8, date: o.datum })],
      { commit: true },
    )
    expect(rapport.gekoppeld).toBe(1)
    expect(rapport.bijgewerkt).toBe(1)

    const na = await payload.findByID({ collection: 'matches', id: m.id, depth: 0 })
    expect(na.status).toBe('finished')
    const score = readSimpleScore(na)
    expect(score.goals.filter((g) => g.side === 'home').length).toBe(12)
    expect(score.goals.filter((g) => g.side === 'away').length).toBe(8)
  })

  it('verandert niets in voorbeschouwing', async () => {
    const o = await maakOmgeving()
    const m = await o.maakMatch()
    const rapport = await pasUitslagenToe(
      payload,
      [uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 5, awayScore: 3, date: o.datum })],
      { commit: false },
    )
    expect(rapport.bijgewerkt).toBe(1)
    const na = await payload.findByID({ collection: 'matches', id: m.id, depth: 0 })
    expect(na.status).toBe('scheduled')
    expect(readSimpleScore(na).goals).toHaveLength(0)
  })

  it('laat een wedstrijd met eigen worpdata ONAANGEROERD', async () => {
    const o = await maakOmgeving()
    const m = await o.maakMatch()
    const matchId = m.id as number
    const hp = await maakOpstelling(o.thuis.id as number, 4)
    const ap = await maakOpstelling(o.uit.id as number, 14)
    await payload.update({ collection: 'matches', id: matchId, data: { isDemo: true }, overrideAccess: true })
    await setLineup(payload, matchId, 'home', hp)
    await setLineup(payload, matchId, 'away', ap)
    await startMatch(payload, matchId, o.thuis.id as number)
    await recordThrow(payload, { matchId, playerId: hp[0], type: 'rug', point: { x: 0.5, y: 0.97 }, tapCount: 1 })
    await finishMatch(payload, matchId)

    const rapport = await pasUitslagenToe(
      payload,
      [uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 12, awayScore: 8, date: o.datum })],
      { commit: true },
    )
    expect(rapport.gekoppeld).toBe(1)
    expect(rapport.bijgewerkt).toBe(0)
    expect(rapport.zelfAangetekend).toHaveLength(1)

    // Geen simpleScore erbij: de stand blijft die van de worpen (rugworp = 2).
    const na = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
    expect(readSimpleScore(na).goals).toHaveLength(0)
  })

  it('laat een wedstrijd met een ingediend wedstrijdblad ONAANGEROERD', async () => {
    const o = await maakOmgeving()
    const m = await o.maakMatch()
    await payload.create({
      collection: 'matchsheets',
      data: { match: m.id, status: 'ingediend' },
      overrideAccess: true,
    })
    const rapport = await pasUitslagenToe(
      payload,
      [uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 12, awayScore: 8, date: o.datum })],
      { commit: true },
    )
    expect(rapport.bijgewerkt).toBe(0)
    expect(rapport.zelfAangetekend).toHaveLength(1)
    const na = await payload.findByID({ collection: 'matches', id: m.id, depth: 0 })
    expect(na.status).toBe('scheduled')
  })

  it('herkent een verplaatste wedstrijd binnen een week en meldt een afwijkende stand', async () => {
    const o = await maakOmgeving()
    const m = await o.maakMatch()
    // Eerst een uitslag overnemen, daarna een gecorrigeerde met een andere datum én andere stand.
    await pasUitslagenToe(payload, [uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 10, awayScore: 10, date: o.datum })], { commit: true })
    const rapport = await pasUitslagenToe(
      payload,
      [uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 12, awayScore: 8, date: '2026-03-10' })],
      { commit: true },
    )
    expect(rapport.gekoppeld).toBe(1)
    expect(rapport.conflicten).toHaveLength(1)
    expect(rapport.conflicten[0]).toContain('bij ons 10–10')
    const na = await payload.findByID({ collection: 'matches', id: m.id, depth: 0 })
    const score = readSimpleScore(na)
    expect(score.goals.filter((g) => g.side === 'home').length).toBe(12)
  })

  it('doet niets wanneer de stand al gelijk is', async () => {
    const o = await maakOmgeving()
    await o.maakMatch()
    const rij = uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 7, awayScore: 4, date: o.datum })
    await pasUitslagenToe(payload, [rij], { commit: true })
    const tweede = await pasUitslagenToe(payload, [rij], { commit: true })
    expect(tweede.ongewijzigd).toBe(1)
    expect(tweede.bijgewerkt).toBe(0)
    expect(tweede.conflicten).toHaveLength(0)
  })

  it('meldt een ploeg die we niet kennen i.p.v. er een aan te maken', async () => {
    const o = await maakOmgeving()
    await o.maakMatch()
    const rapport = await pasUitslagenToe(
      payload,
      [uitslag({ home: o.naam.thuis, away: 'Onbestaande Ploeg XYZ', homeScore: 3, awayScore: 1, date: o.datum })],
      { commit: true },
    )
    expect(rapport.gekoppeld).toBe(0)
    expect(rapport.onbekend).toHaveLength(1)
    const ploegen = await payload.count({ collection: 'teams', where: { name: { equals: 'Onbestaande Ploeg XYZ' } } })
    expect(ploegen.totalDocs).toBe(0)
  })

  it('slaat een niet-gespeelde wedstrijd (0–0) over', async () => {
    const o = await maakOmgeving()
    await o.maakMatch()
    const rapport = await pasUitslagenToe(
      payload,
      [uitslag({ home: o.naam.thuis, away: o.naam.uit, homeScore: 0, awayScore: 0, date: o.datum })],
      { commit: true },
    )
    expect(rapport.gespeeld).toBe(0)
    expect(rapport.bijgewerkt).toBe(0)
  })
})
