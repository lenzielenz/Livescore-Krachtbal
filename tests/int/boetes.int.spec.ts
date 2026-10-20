// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

process.env.PLATFORM_OMGEVING = 'federatie-test'

import config from '@/payload.config'
import { POST as clubRoute } from '@/app/api/club/boetes/route'
import { POST as fedRoute } from '@/app/api/federatie/boetes/route'
import { boeteVoorstellen, scheidsrechterskosten } from '@/lib/boetes'

// Boetes: de federatie zet de boetelijst, het systeem stelt voor (forfait, blad te laat), de
// federatie legt op, de club ziet enkel wat opgelegd is, meldt een betaling of betwist.

let payload: Payload
const S = Date.now()
const PW = 'boete-123'
const tok: Record<string, string> = {}
const ids = { thuis: 0, uit: 0, m1: 0, m2: 0, ff: 0, laat: 0 }

async function login(wie: string, data: Record<string, unknown>) {
  await payload.create({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW, ...data } as never, overrideAccess: true })
  const r = await payload.login({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW } })
  tok[wie] = String(r.token)
}
const post = (route: typeof fedRoute, url: string, wie: string, body: unknown) =>
  route(new Request(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `JWT ${tok[wie]}` }, body: JSON.stringify(body) }))

describe('boetes', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.create({ collection: 'users', data: { email: `eerste-bt-${S}@test.be`, password: PW }, overrideAccess: true })
    const club = async (n: string) => Number((await payload.create({ collection: 'clubs', data: { name: `${n} ${S}` }, overrideAccess: true })).id)
    ids.thuis = await club('Boete Thuis')
    ids.uit = await club('Boete Uit')
    const ploeg = async (n: string, c: number) =>
      Number((await payload.create({ collection: 'teams', data: { name: `${n} ${S}`, club: c, category: 'senioren', reeks: 'LH' }, overrideAccess: true })).id)
    const th = await ploeg('BT Thuis', ids.thuis)
    const ui = await ploeg('BT Uit', ids.uit)
    const gisteren = new Date(Date.now() - 5 * 86_400_000).toISOString()
    const wedstrijd = async () =>
      Number((await payload.create({ collection: 'matches', data: { reeks: 'LH', homeTeam: th, awayTeam: ui, date: gisteren, status: 'scheduled', goalAreaDepth: 10 }, overrideAccess: true })).id)
    ids.m1 = await wedstrijd()
    ids.m2 = await wedstrijd()
    // m1: forfait van de uitploeg. m2: gespeeld, blad 5 dagen later nog niet ingediend.
    await payload.create({ collection: 'matchsheets', data: { match: ids.m1, forfait: { uitslag: 'uit', km: 20 } } as never, overrideAccess: true })
    await payload.create({ collection: 'matchsheets', data: { match: ids.m2, refereeKm: 30 } as never, overrideAccess: true })
    await payload.update({ collection: 'matches', id: ids.m2, data: { status: 'finished', finishedAt: gisteren }, overrideAccess: true })
    ids.ff = Number((await payload.create({ collection: 'boete-soorten', data: { naam: 'Forfait', bedrag: 50, trigger: 'forfait', actief: true }, overrideAccess: true })).id)
    ids.laat = Number((await payload.create({ collection: 'boete-soorten', data: { naam: 'Blad te laat', bedrag: 10, trigger: 'blad_te_laat', termijnDagen: 2, actief: true }, overrideAccess: true })).id)
    await login('fed', { roles: ['federatie'] })
    await login('uitstaf', { roles: ['club-beheerder'], club: ids.uit })
    await login('thuisstaf', { roles: ['club-beheerder'], club: ids.thuis })
  }, 120_000)

  it('stelt voor bij forfait en een laattijdig blad — en nooit twee keer', async () => {
    expect(await boeteVoorstellen(payload)).toBeGreaterThanOrEqual(2)
    expect(await boeteVoorstellen(payload)).toBe(0)
    const ff = await payload.find({ collection: 'boetes', where: { match: { equals: ids.m1 } }, overrideAccess: true })
    expect(ff.docs).toHaveLength(1)
    expect(Number((ff.docs[0].club as { id: number }).id ?? ff.docs[0].club)).toBe(ids.uit)
    const laat = await payload.find({ collection: 'boetes', where: { match: { equals: ids.m2 } }, overrideAccess: true })
    expect(laat.docs).toHaveLength(1)
    expect(laat.docs[0].status).toBe('voorstel')
  }, 60_000)

  it('de club ziet een voorstel niet; na opleggen wel, en kan betwisten', async () => {
    const b = (await payload.find({ collection: 'boetes', where: { match: { equals: ids.m1 } }, overrideAccess: true })).docs[0]
    const uitUser = (await payload.find({ collection: 'users', where: { email: { equals: `uitstaf-${S}@test.be` } }, overrideAccess: true })).docs[0]
    const zichtbaar = async () => (await payload.find({ collection: 'boetes', where: { club: { equals: ids.uit } }, user: uitUser, overrideAccess: false })).docs.length
    expect(await zichtbaar()).toBe(0)
    expect((await post(clubRoute, '/api/club/boetes', 'uitstaf', { actie: 'betaling', id: b.id })).status).toBe(404)

    expect((await post(fedRoute, '/api/federatie/boetes', 'fed', { actie: 'opleggen', id: b.id, bedrag: 40 })).status).toBe(200)
    expect(await zichtbaar()).toBe(1)
    // Een andere club kan er niet aan.
    expect((await post(clubRoute, '/api/club/boetes', 'thuisstaf', { actie: 'betwisten', id: b.id, opmerking: 'x' })).status).toBe(404)
    // Betwisten zonder reden kan niet; met reden wel.
    expect((await post(clubRoute, '/api/club/boetes', 'uitstaf', { actie: 'betwisten', id: b.id })).status).toBe(400)
    expect((await post(clubRoute, '/api/club/boetes', 'uitstaf', { actie: 'betwisten', id: b.id, opmerking: 'Bus pech, gemeld' })).status).toBe(200)
    // Federatie handhaaft, club meldt betaling, federatie bevestigt.
    expect((await post(fedRoute, '/api/federatie/boetes', 'fed', { actie: 'handhaven', id: b.id })).status).toBe(200)
    expect((await post(clubRoute, '/api/club/boetes', 'uitstaf', { actie: 'betaling', id: b.id })).status).toBe(200)
    expect((await post(fedRoute, '/api/federatie/boetes', 'fed', { actie: 'betaald', id: b.id })).status).toBe(200)
    const na = await payload.findByID({ collection: 'boetes', id: b.id, overrideAccess: true })
    expect(na.status).toBe('betaald')
    expect(na.bedrag).toBe(40)
    // De club kreeg meldingen.
    const m = await payload.find({ collection: 'meldingen', where: { user: { equals: uitUser.id } }, overrideAccess: true })
    expect(m.docs.length).toBeGreaterThanOrEqual(3)
  }, 60_000)

  it('een club kan de federatieroute niet gebruiken', async () => {
    expect((await post(fedRoute, '/api/federatie/boetes', 'uitstaf', { actie: 'manueel', club: ids.thuis, bedrag: 5, omschrijving: 'x' })).status).toBe(403)
  }, 60_000)

  it('scheidsrechterskosten volgen de instelling', async () => {
    expect((await scheidsrechterskosten(payload, ids.thuis)).rijen).toHaveLength(0)
    await payload.updateGlobal({ slug: 'settings', data: { scheidsrechterKostenBetaler: 'thuisclub', forfaitKostenBetaler: 'forfaitploeg' } as never, overrideAccess: true })
    const thuis = await scheidsrechterskosten(payload, ids.thuis)
    expect(thuis.rijen).toHaveLength(1)
    expect(thuis.totaal).toBeCloseTo(13 + 30 * 0.4327, 2)
    const uit = await scheidsrechterskosten(payload, ids.uit)
    expect(uit.rijen.map((r) => r.soort)).toEqual(['forfait'])
    expect(uit.totaal).toBeCloseTo(13 + 20 * 0.4259, 2)
    await payload.updateGlobal({ slug: 'settings', data: { scheidsrechterKostenBetaler: null, forfaitKostenBetaler: null } as never, overrideAccess: true })
  }, 60_000)
})
