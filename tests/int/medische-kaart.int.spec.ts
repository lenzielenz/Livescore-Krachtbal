// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { kaartAanvragen, kaartBehandelen } from '@/lib/medische-kaart'
import { lidOpslaan, zorgVoorLogin } from '@/lib/registratie-server'

// E-mail en login per lid, en de medische kaart: wie aanvraagt, wie het hoort.

let payload: Payload
const STAMP = Date.now()
const ids = { club: 0, ander: 0, ploeg: 0, speler: 0, beheerder: 0, lid: 0 }

const meldingenVan = async (user: number) =>
  (await payload.find({ collection: 'meldingen', where: { user: { equals: user } }, sort: '-createdAt', limit: 10, overrideAccess: true })).docs

describe('e-mail, login en medische kaart', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    ids.club = Number((await payload.create({ collection: 'clubs', data: { name: `Kaart ${STAMP}` }, overrideAccess: true })).id)
    ids.ander = Number((await payload.create({ collection: 'clubs', data: { name: `Kaart ander ${STAMP}` }, overrideAccess: true })).id)
    ids.ploeg = Number(
      (await payload.create({ collection: 'teams', data: { name: `Kaart ${STAMP}`, club: ids.club, category: 'senioren', reeks: 'LH' }, overrideAccess: true })).id,
    )
    ids.beheerder = Number(
      (
        await payload.create({
          collection: 'users',
          data: { email: `kb-${STAMP}@test.be`, password: 'kaart-test-123', roles: ['club-beheerder'], club: ids.club },
          overrideAccess: true,
        })
      ).id,
    )
  }, 90_000)

  it('e-mail verplicht vanaf 13 jaar; jonger mag zonder', async () => {
    const basis = { teamId: ids.ploeg, voornaam: 'Kim', achternaam: `Kaart${STAMP}`, geslacht: 'v', soortLid: 'speler' }
    expect(await lidOpslaan(payload, ids.club, { ...basis, birthDate: '2000-01-01' })).toMatchObject({ ok: false, status: 400 })
    expect(await lidOpslaan(payload, ids.club, { ...basis, birthDate: '2000-01-01', email: 'geen' })).toMatchObject({ ok: false, status: 400 })
    expect(await lidOpslaan(payload, ids.club, { ...basis, voornaam: 'Kleine', birthDate: '2018-01-01' })).toMatchObject({ ok: true })
    const r = await lidOpslaan(payload, ids.club, { ...basis, birthDate: '2000-01-01', email: `Kim-${STAMP}@Test.be` })
    expect(r.ok).toBe(true)
    ids.speler = (r as { id: number }).id
    const p = await payload.findByID({ collection: 'players', id: ids.speler, overrideAccess: true })
    expect(p.email).toBe(`kim-${STAMP}@test.be`)
  })

  it('na goedkeuring krijgt het lid een login, gekoppeld aan zijn dossier', async () => {
    const l = await zorgVoorLogin(payload, ids.speler)
    expect(l.status).toBe('aangemaakt')
    ids.lid = l.userId!
    const u = await payload.findByID({ collection: 'users', id: ids.lid, depth: 0, overrideAccess: true })
    expect(u.roles).toEqual(['club-lid'])
    expect(typeof u.player === 'object' ? u.player?.id : u.player).toBe(ids.speler)
    // Een tweede keer: niets dubbel.
    expect((await zorgVoorLogin(payload, ids.speler)).status).toBe('bestond')
  })

  it('een federatieaccount met hetzelfde adres wordt nooit overgenomen', async () => {
    const mail = `fed-kaart-${STAMP}@test.be`
    await payload.create({ collection: 'users', data: { email: mail, password: 'kaart-test-123', roles: ['federatie'] }, overrideAccess: true })
    const p = await payload.create({
      collection: 'players',
      data: { name: 'Fed Kopie', team: ids.ploeg, shirtNumber: 77, email: mail },
      overrideAccess: true,
    })
    expect((await zorgVoorLogin(payload, Number(p.id))).status).toBe('conflict')
  })

  it('het lid vraagt zijn kaart aan → de club hoort het; geen dubbele aanvraag', async () => {
    const lid = await payload.findByID({ collection: 'users', id: ids.lid, depth: 0, overrideAccess: true })
    const r = await kaartAanvragen(payload, lid, ids.speler)
    expect(r.ok).toBe(true)
    expect((await kaartAanvragen(payload, lid, ids.speler)).ok).toBe(false)
    const m = await meldingenVan(ids.beheerder)
    expect(m[0].titel).toContain('vroeg een medische kaart aan')
    const a = (await payload.findByID({ collection: 'medische-kaart-aanvragen', id: (r as { id: number }).id, overrideAccess: true }))
    expect(a.via).toBe('lid')
  })

  it('de federatie verstuurt → lid en club horen het', async () => {
    const open = (await payload.find({ collection: 'medische-kaart-aanvragen', where: { player: { equals: ids.speler } }, overrideAccess: true })).docs
    expect(await kaartBehandelen(payload, open.map((a) => Number(a.id)), 'verstuurd')).toBe(1)
    expect((await meldingenVan(ids.lid))[0].titel).toContain('verstuurd')
    expect((await meldingenVan(ids.beheerder))[0].titel).toContain('verstuurd')
  })

  it('de club vraagt aan voor het lid → het lid hoort het; een andere club kan niet', async () => {
    const beheerder = await payload.findByID({ collection: 'users', id: ids.beheerder, depth: 0, overrideAccess: true })
    const r = await kaartAanvragen(payload, beheerder, ids.speler)
    expect(r.ok).toBe(true)
    expect((await meldingenVan(ids.lid))[0].titel).toContain('Je club vroeg')
    const vreemd = { id: 99_999, roles: ['club-beheerder'], club: ids.ander }
    expect(await kaartAanvragen(payload, vreemd, ids.speler)).toMatchObject({ ok: false, status: 403 })
  })

  it('meldingen ziet enkel de eigen gebruiker', async () => {
    const eigen = await payload.find({ collection: 'meldingen', user: { id: ids.lid, roles: ['club-lid'], collection: 'users' }, overrideAccess: false })
    expect(eigen.docs.every((m) => (typeof m.user === 'object' ? m.user.id : m.user) === ids.lid)).toBe(true)
    expect(eigen.docs.length).toBeGreaterThan(0)
  })
})
