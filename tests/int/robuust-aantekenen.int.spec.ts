import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { buildMatchState } from '@/lib/match-engine'
import { claimScorer, emptyTrust, sanitizeTrust } from '@/lib/score-trust'
import { aanwezigMelden, wedstrijdOvernemen, writeMatchTrust } from '@/lib/score-trust-store'
import { advanceSimpleHalf, papierenUitslag, recordSimpleGoal, startSimpleMatch } from '@/lib/simple-match-engine'
import { renderNoodbladPdf } from '@/lib/submit'

// Faalanalyse wedstrijddag: een traag toestel dat dubbel tikt, een tik die offline bewaard werd,
// een toestel dat uitvalt (overnemen) en een wedstrijd die op papier verder ging (noodblad +
// eindstand van papier door de federatie).

let payload: Payload

async function maakWedstrijd() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const club = await payload.create({ collection: 'clubs', data: { name: `Robuust ${stamp}` }, overrideAccess: true })
  const mk = (naam: string) =>
    payload.create({ collection: 'teams', data: { name: naam, reeks: 'LH', category: 'senioren', club: club.id }, overrideAccess: true })
  const thuis = await mk(`Thuis ${stamp}`)
  const uit = await mk(`Uit ${stamp}`)
  const m = await payload.create({
    collection: 'matches',
    data: { reeks: 'LH', homeTeam: thuis.id, awayTeam: uit.id, date: new Date(Date.now() - 60_000).toISOString(), status: 'scheduled', goalAreaDepth: 10 },
    overrideAccess: true,
  })
  return m.id as number
}

const trustVan = async (id: number) =>
  sanitizeTrust((await payload.findByID({ collection: 'matches', id, depth: 0, overrideAccess: true }) as { scoreTrust?: unknown }).scoreTrust)

describe('robuust aantekenen', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 90_000)

  it('een dubbele tik op "volgende helft" maakt geen 3e helft', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await advanceSimpleHalf(payload, id)
    await expect(advanceSimpleHalf(payload, id)).rejects.toThrow(/2e helft loopt al/)
    expect((await buildMatchState(payload, id)).match.currentHalf).toBe(2)
  }, 60_000)

  it('een offline bewaarde tik krijgt het moment van het toestel', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await payload.update({
      collection: 'matches',
      id,
      data: { clockRunning: true, clockSeconds: 0, clockUpdatedAt: new Date(Date.now() - 10 * 60_000).toISOString() },
      overrideAccess: true,
    })
    // Gebeurd 5 minuten na de start, pas nu aangekomen.
    await recordSimpleGoal(payload, id, 'home', 1, undefined, Date.now() - 5 * 60_000)
    const m = await payload.findByID({ collection: 'matches', id, depth: 0, overrideAccess: true })
    const goal = (m.simpleScore as { goals: { clock: number }[] }).goals[0]
    expect(goal.clock).toBeGreaterThanOrEqual(299)
    expect(goal.clock).toBeLessThanOrEqual(302)
  }, 60_000)

  it('overnemen: niet bij een werkende tafel, wel na stilte of door de scheidsrechter', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await writeMatchTrust(payload, id, claimScorer(emptyTrust(), { id: 9001, name: 'Toestel A', trust: 0.5 }))

    // Hartslag van de houder: nog actief → een ander mag niet overnemen.
    await aanwezigMelden(payload, id, 9001)
    expect(await wedstrijdOvernemen(payload, id, { id: 9002, name: 'Toestel B' }, { scheidsrechter: false, federatie: false })).toMatch(/nog actief/)
    expect((await trustVan(id)).scorerId).toBe(9001)

    // De scheidsrechter mag meteen.
    expect(await wedstrijdOvernemen(payload, id, { id: 9003, name: 'Scheids' }, { scheidsrechter: true, federatie: false })).toBeNull()
    expect((await trustVan(id)).scorerId).toBe(9003)

    // Na 3 minuten stilte mag ook een andere aantekenaar.
    await writeMatchTrust(payload, id, claimScorer(emptyTrust(), { id: 9001, name: 'Toestel A', trust: 0.5 }, Date.now() - 4 * 60_000))
    expect(await wedstrijdOvernemen(payload, id, { id: 9002, name: 'Toestel B' }, { scheidsrechter: false, federatie: false })).toBeNull()
    expect((await trustVan(id)).scorerName).toBe('Toestel B')
  }, 60_000)

  it('noodblad + eindstand van papier op een half aangetekende wedstrijd', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)
    await recordSimpleGoal(payload, id, 'away', 1)

    const pdf = await renderNoodbladPdf(payload, id)
    expect(pdf && pdf.length).toBeGreaterThan(1000)

    // Lager dan wat er al stond: eerst bevestigen.
    await expect(papierenUitslag(payload, id, 1, 1)).rejects.toThrow(/hoger dan het papier/)

    const na = await papierenUitslag(payload, id, 15, 12)
    expect(na.score).toEqual({ home: 15, away: 12 })
    expect(na.match.status).toBe('finished')
    // Wat digitaal genoteerd was, blijft staan (met de scorer-info die er was).
    const m = await payload.findByID({ collection: 'matches', id, depth: 0, overrideAccess: true })
    expect((m.simpleScore as { goals: { points: number }[] }).goals[0].points).toBe(2)

    await expect(papierenUitslag(payload, id, 16, 12)).rejects.toThrow(/al afgesloten/)
  }, 60_000)

  it('papier vervangt de digitale stand als die niet klopte', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)
    const na = await papierenUitslag(payload, id, 1, 3, true)
    expect(na.score).toEqual({ home: 1, away: 3 })
  }, 60_000)
})
