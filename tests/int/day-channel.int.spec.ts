import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { loadLiveScores } from '@/lib/day-channel'
import { dateStrBE } from '@/lib/datetime'
import { recordSimpleGoal, startSimpleMatch } from '@/lib/simple-match-engine'
import { MATCH_ASSUMED_DONE_MS } from '@/lib/simple-score'

// Het live-bord werkt zichzelf bij via één gedeelde stroom per speeldag. Dit is de inhoud van die
// stroom: enkel het veranderlijke deel, met dezelfde afleidingen als het bord zelf (auto-live en
// "wacht op uitslag"), zodat de rij op het scherm niet gaat afwijken van wat de server bedoelt.

let payload: Payload

async function maakWedstrijd(offsetMs: number) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000)
  const club = await payload.create({ collection: 'clubs', data: { name: `Dagclub ${stamp}` }, overrideAccess: true })
  const mk = (naam: string) =>
    payload.create({ collection: 'teams', data: { name: naam, reeks: 'LH', category: 'senioren', club: club.id }, overrideAccess: true })
  const thuis = await mk(`Thuis ${stamp}`)
  const uit = await mk(`Uit ${stamp}`)
  const m = await payload.create({
    collection: 'matches',
    data: {
      reeks: 'LH',
      homeTeam: thuis.id,
      awayTeam: uit.id,
      date: new Date(Date.now() + offsetMs).toISOString(),
      status: 'scheduled',
      goalAreaDepth: 10,
    },
    overrideAccess: true,
  })
  return { id: m.id as number }
}

// De speeldag van een wedstrijd is de Brusselse dag waarop ze staat — niet blind "vandaag".
// Draai je deze suite kort na middernacht, dan ligt "vier uur geleden" op de vórige kalenderdag
// en zou een harde `dateStrBE()` de wedstrijd nooit vinden. Zo test dit het gedrag, niet de klok.
const dagVan = (offsetMs: number) => dateStrBE(new Date(Date.now() + offsetMs))
const vind = (lijst: Awaited<ReturnType<typeof loadLiveScores>>, id: number) => lijst.find((x) => x.id === id)

describe('dagstroom voor het live-bord', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('geeft de stand van een lopende wedstrijd door', async () => {
    const offset = -10 * 60_000
    const { id } = await maakWedstrijd(offset)
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)
    await recordSimpleGoal(payload, id, 'away', 1)

    const rij = vind(await loadLiveScores(payload, dagVan(offset)), id)
    expect(rij).toBeDefined()
    expect(rij!.status).toBe('live')
    expect(rij!.score).toEqual({ home: 2, away: 1 })
    expect(rij!.awaitingResult).toBe(false)
  })

  it('toont een wedstrijd waarvan het uur net voorbij is als live, ook zonder aantekenaar', async () => {
    const offset = -5 * 60_000
    const { id } = await maakWedstrijd(offset)
    const rij = vind(await loadLiveScores(payload, dagVan(offset)), id)
    expect(rij!.status).toBe('live')
    expect(rij!.score).toEqual({ home: 0, away: 0 })
  })

  it('markeert een wedstrijd van uren geleden zonder notatie als "wacht op uitslag"', async () => {
    const offset = -(MATCH_ASSUMED_DONE_MS + 60 * 60_000)
    const { id } = await maakWedstrijd(offset)
    const rij = vind(await loadLiveScores(payload, dagVan(offset)), id)
    expect(rij!.awaitingResult).toBe(true)
    expect(rij!.status).toBe('scheduled')
  })

  it('stuurt enkel het veranderlijke deel mee — geen namen, logo\'s of kleuren', async () => {
    const offset = -10 * 60_000
    const { id } = await maakWedstrijd(offset)
    const rij = vind(await loadLiveScores(payload, dagVan(offset)), id)
    expect(Object.keys(rij!).sort()).toEqual(
      ['awaitingResult', 'crosses', 'id', 'refereeStops', 'score', 'status', 'timeouts'].sort(),
    )
  })

  it('laat analyse-opnames en demo-wedstrijden buiten het publieke bord', async () => {
    const offset = -10 * 60_000
    const { id } = await maakWedstrijd(offset)
    await payload.update({ collection: 'matches', id, data: { isDemo: true }, overrideAccess: true })
    expect(vind(await loadLiveScores(payload, dagVan(offset)), id)).toBeUndefined()
  })
})
