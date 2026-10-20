// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

process.env.PLATFORM_OMGEVING = 'federatie-test'

import config from '@/payload.config'
import { POST as aftrapRoute } from '@/app/api/match/[id]/aftrap/route'
import { brusselsParts, brusselsWallUtc, shiftDateStr, dateStrBE } from '@/lib/datetime'

// Aftrap verschuiven op de wedstrijddag: de uitploeg in de file meldt het zelf, de thuisclub schuift
// de volgende wedstrijden op het terrein mee, een wedstrijd die wegvalt laat de volgende vroeger
// beginnen — en iedereen hoort het.

let payload: Payload
const S = Date.now()
const PW = 'aftrap-123'
const tok: Record<string, string> = {}
const ids = { thuis: 0, uit: 0, vreemd: 0, m1: 0, m2: 0, m3: 0, uitStaf: 0 }
const morgen = shiftDateStr(dateStrBE(new Date()), 1)
const uur = (h: number, m = 0) => {
  const [y, mo, d] = morgen.split('-').map(Number)
  return brusselsWallUtc(y, mo, d, h, m).toISOString()
}

async function login(wie: string, data: Record<string, unknown>) {
  await payload.create({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW, ...data } as never, overrideAccess: true })
  const r = await payload.login({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW } })
  tok[wie] = String(r.token)
  return Number(r.user?.id)
}
const verschuif = (wie: string, id: number, body: unknown) =>
  aftrapRoute(
    new Request(`http://localhost/api/match/${id}/aftrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${tok[wie]}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  )
const datum = async (id: number) => String((await payload.findByID({ collection: 'matches', id, depth: 0, overrideAccess: true })).date)
const hhmm = (iso: string) => {
  const p = brusselsParts(new Date(iso))
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`
}

describe('aftrap verschuiven', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.create({ collection: 'users', data: { email: `eerste-af-${S}@test.be`, password: PW }, overrideAccess: true })
    const club = async (n: string) => Number((await payload.create({ collection: 'clubs', data: { name: `${n} ${S}` }, overrideAccess: true })).id)
    ids.thuis = await club('Aftrap Thuis')
    ids.uit = await club('Aftrap Uit')
    ids.vreemd = await club('Aftrap Vreemd')
    const ploeg = async (n: string, c: number) =>
      Number((await payload.create({ collection: 'teams', data: { name: `${n} ${S}`, club: c, category: 'senioren', reeks: 'LH' }, overrideAccess: true })).id)
    const th = [await ploeg('Th Heren', ids.thuis), await ploeg('Th Dames', ids.thuis), await ploeg('Th Belofte', ids.thuis)]
    const ui = [await ploeg('Ui Heren', ids.uit), await ploeg('Ui Dames', ids.uit), await ploeg('Ui Belofte', ids.uit)]
    const wedstrijd = async (h: number, a: number, iso: string) =>
      Number((await payload.create({ collection: 'matches', data: { reeks: 'LH', homeTeam: h, awayTeam: a, date: iso, status: 'scheduled' }, overrideAccess: true })).id)
    // Drie wedstrijden na elkaar op het terrein van de thuisclub.
    ids.m1 = await wedstrijd(th[0], ui[0], uur(13))
    ids.m2 = await wedstrijd(th[1], ui[1], uur(15))
    ids.m3 = await wedstrijd(th[2], ui[2], uur(17))
    await login('thuisstaf', { roles: ['club-beheerder'], club: ids.thuis })
    ids.uitStaf = await login('uitstaf', { roles: ['club-beheerder'], club: ids.uit })
    await login('vreemd', { roles: ['club-beheerder'], club: ids.vreemd })
  }, 120_000)

  it('de uitploeg in de file meldt zelf een latere aftrap, maar schuift geen andere wedstrijden', async () => {
    const r = await verschuif('uitstaf', ids.m1, { nieuw: uur(13, 30), reden: 'file', toelichting: 'ongeval E40' })
    expect(r.status).toBe(200)
    expect(hhmm(await datum(ids.m1))).toBe('13:30')
    const r2 = await verschuif('uitstaf', ids.m1, { nieuw: uur(13, 45), reden: 'file', volgendeOok: true })
    expect(r2.status).toBe(403)
  }, 60_000)

  it('een vreemde club mag niets; een andere dag is een verplaatsing', async () => {
    expect((await verschuif('vreemd', ids.m1, { nieuw: uur(14), reden: 'file' })).status).toBe(403)
    const r = await verschuif('thuisstaf', ids.m1, { nieuw: new Date(new Date(uur(14)).getTime() + 86_400_000).toISOString(), reden: 'ander' })
    expect(r.status).toBe(400)
  }, 60_000)

  it('de thuisclub schuift de volgende wedstrijden op het terrein mee', async () => {
    const r = await verschuif('thuisstaf', ids.m1, { nieuw: uur(14), reden: 'uitloop', volgendeOok: true })
    expect(r.status).toBe(200)
    expect(hhmm(await datum(ids.m1))).toBe('14:00')
    expect(hhmm(await datum(ids.m2))).toBe('15:30')
    expect(hhmm(await datum(ids.m3))).toBe('17:30')
    const log = await payload.find({ collection: 'aftrap-wijzigingen', where: { match: { in: [ids.m2, ids.m3] } }, overrideAccess: true })
    expect(log.docs.every((d) => d.aanleiding != null)).toBe(true)
  }, 60_000)

  it('de middelste valt weg: de laatste begint vroeger, en iedereen weet het', async () => {
    await payload.update({ collection: 'matches', id: ids.m2, data: { afgelast: true }, overrideAccess: true })
    const r = await verschuif('thuisstaf', ids.m3, { nieuw: uur(15, 30), reden: 'vervroegen' })
    expect(r.status).toBe(200)
    expect(hhmm(await datum(ids.m3))).toBe('15:30')
    // Een afgelaste wedstrijd verschuif je niet (die wordt herpland).
    expect((await verschuif('thuisstaf', ids.m2, { nieuw: uur(16), reden: 'ander' })).status).toBe(409)
    const meldingen = await payload.find({ collection: 'meldingen', where: { user: { equals: ids.uitStaf } }, overrideAccess: true })
    expect(meldingen.docs.some((m) => /15:30/.test(String(m.tekst)) && /vroeger/.test(String(m.tekst)))).toBe(true)
  }, 60_000)
})
