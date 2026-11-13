// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const wie = vi.hoisted(() => ({ a: null as null | Record<string, unknown>, b: null as null | Record<string, unknown> }))
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) => {
    const h = req.headers.get('authorization')
    return h === 'JWT a' ? wie.a : h === 'JWT b' ? wie.b : null
  },
}))

import config from '@/payload.config'
import { GET as pdfRoute } from '@/app/api/facturen/[id]/pdf/route'
import { ogmCijfers } from '@/lib/facturatie'
import {
  bankImporteren,
  bankVoorbeeld,
  betalingRegistreren,
  conceptBewerken,
  conceptenMaken,
  factuurAnnuleren,
  factuurBeeld,
  facturenLijst,
  factuurVersturen,
  mollieWebhook,
} from '@/lib/facturatie-server'

// Facturatie van begin tot eind: concept uit aansluitingen en boetes, nooit dubbel; versturen met doorlopend
// nummer en mededeling; betalingen (manueel, bankafschrift, Mollie) en "betaald" altijd berekend; de boete
// op de factuur wordt mee afgeboekt; een club ziet enkel haar eigen facturen.

let payload: Payload
const S = Date.now()
const ids = { clubA: 0, clubB: 0, boete: 0, staf: 0, factuur: 0 }

const pdf = (who: 'a' | 'b', id: number) => pdfRoute(new Request(`http://localhost:3000/api/facturen/${id}/pdf`, { headers: { authorization: `JWT ${who}` } }), { params: Promise.resolve({ id: String(id) }) })

describe('facturatie aan de clubs', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.create({ collection: 'users', data: { email: `eerste-fa-${S}@test.be`, password: 'factuur-test-123' }, overrideAccess: true })
    ids.clubA = Number((await payload.create({ collection: 'clubs', data: { name: `Factuurclub A ${S}` }, overrideAccess: true })).id)
    ids.clubB = Number((await payload.create({ collection: 'clubs', data: { name: `Factuurclub B ${S}` }, overrideAccess: true })).id)
    const ploeg = Number((await payload.create({ collection: 'teams', data: { name: `Factuurploeg ${S}`, club: ids.clubA, category: 'senioren', reeks: 'LH' } as never, overrideAccess: true })).id)
    // Drie aangesloten spelers (één via de ploeg, zonder players.club), één nog niet goedgekeurd, één gewoon lid.
    const lid = (n: string, extra: Record<string, unknown>) => payload.create({ collection: 'players', data: { name: `${n} ${S}`, team: ploeg, shirtNumber: 1, ...extra } as never, overrideAccess: true })
    await lid('Een', { club: ids.clubA, vergunningsstatus: 'geldig' })
    await lid('Twee', { club: ids.clubA, vergunningsstatus: 'geldig' })
    const drie = await lid('Drie', { vergunningsstatus: 'geldig' })
    await payload.db.updateOne({ collection: 'players', id: drie.id, data: { club: null } }).catch(() => null)
    await lid('Nog niet', { club: ids.clubA, vergunningsstatus: 'aangevraagd' })
    await lid('Supporter', { club: ids.clubA, soortLid: 'lid', registratieStatus: 'goedgekeurd' })
    ids.boete = Number((await payload.create({ collection: 'boetes', data: { club: ids.clubA, omschrijving: 'Blad te laat', bedrag: 25, status: 'opgelegd', opgelegdOp: new Date().toISOString() } as never, overrideAccess: true })).id)
    await payload.updateGlobal({ slug: 'settings', data: { lidgeldSpeler: 20, lidgeldLid: 5, factuurIban: 'BE68539007547034', factuurNaam: 'KVKBF vzw', betaaltermijnDagen: 30 } as never })
    ids.staf = Number((await payload.create({ collection: 'users', data: { email: `staf-fa-${S}@test.be`, password: 'factuur-test-123', roles: ['club-beheerder'], club: ids.clubA } as never, overrideAccess: true })).id)
    wie.a = { id: ids.staf, roles: ['club-beheerder'], club: ids.clubA }
    wie.b = { id: 999_999, roles: ['club-beheerder'], club: ids.clubB }
  }, 120_000)

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.MOLLIE_API_KEY
  })

  it('een concept met aansluitingen en de boete — en nooit twee keer hetzelfde', async () => {
    const r = await conceptenMaken(payload, ids.staf, { aansluitingen: true, boetes: true, scheidsrechters: false, clubs: [ids.clubA, ids.clubB] })
    expect([r.gemaakt.length, r.leeg]).toEqual([1, 1])
    ids.factuur = r.gemaakt[0]!
    const [f] = await facturenLijst(payload, { id: { equals: ids.factuur } })
    expect(f!.lijnen.map((l) => [l.soort, l.aantal, l.eenheidsprijs])).toEqual([
      ['aansluiting', 3, 20],
      ['aansluiting', 1, 5],
      ['boete', 1, 25],
    ])
    expect([f!.totaal, f!.beeld.stand]).toEqual([90, 'concept'])
    // Nog eens opmaken: alles staat al op het concept.
    expect((await conceptenMaken(payload, ids.staf, { aansluitingen: true, boetes: true, scheidsrechters: false, clubs: [ids.clubA] })).gemaakt).toEqual([])
  }, 120_000)

  it('een concept aanpassen; de club ziet het nog niet', async () => {
    const [f] = await facturenLijst(payload, { id: { equals: ids.factuur } })
    expect(await conceptBewerken(payload, ids.factuur, { lijnen: [...f!.lijnen, { soort: 'ander', omschrijving: 'Korting trouwe club', aantal: 1, eenheidsprijs: -10 }] })).toEqual({ ok: true })
    expect((await factuurBeeld(payload, ids.factuur))!.totaal).toBe(80)
    expect(await conceptBewerken(payload, ids.factuur, { lijnen: [{ soort: 'ander', omschrijving: '', aantal: 1, eenheidsprijs: 1 }] })).toMatchObject({ ok: false, status: 400 })
    expect((await pdf('a', ids.factuur)).status).toBe(404)
  }, 120_000)

  it('versturen: doorlopend nummer en een geldige mededeling; daarna verandert ze niet meer', async () => {
    const r = await factuurVersturen(payload, ids.factuur)
    expect(r.ok).toBe(true)
    const f = await payload.findByID({ collection: 'facturen', id: ids.factuur, depth: 0, overrideAccess: true })
    expect(String(f.nummer)).toMatch(/^\d{4}-\d{4}$/)
    expect(ogmCijfers(String(f.ogm))).toBeTruthy()
    expect(await conceptBewerken(payload, ids.factuur, { opmerking: 'x' })).toMatchObject({ ok: false, status: 409 })
    expect(await factuurVersturen(payload, ids.factuur)).toMatchObject({ ok: false, status: 409 })
    // De melding aan de club.
    const m = await payload.find({ collection: 'meldingen', where: { user: { equals: ids.staf } }, sort: '-createdAt', limit: 1, overrideAccess: true })
    expect(String(m.docs[0]!.titel)).toContain(String(f.nummer))
  }, 120_000)

  it('de PDF: de eigen club wel, een andere club niet', async () => {
    const eigen = await pdf('a', ids.factuur)
    expect([eigen.status, eigen.headers.get('content-type')]).toEqual([200, 'application/pdf'])
    expect((await eigen.arrayBuffer()).byteLength).toBeGreaterThan(2000)
    expect((await pdf('b', ids.factuur)).status).toBe(404)
  }, 120_000)

  it('betalingen: deels manueel, de rest uit het bankafschrift; de boete wordt afgeboekt; niets dubbel', async () => {
    expect((await betalingRegistreren(payload, { factuurId: ids.factuur, bedrag: 30, datum: '2026-11-14', bron: 'manueel', userId: ids.staf })).ok).toBe(true)
    expect((await factuurBeeld(payload, ids.factuur))).toMatchObject({ stand: 'deels', betaald: 30, open: 50 })
    expect(await factuurAnnuleren(payload, ids.factuur, 'vergissing')).toMatchObject({ ok: false, status: 409 })

    const f = await payload.findByID({ collection: 'facturen', id: ids.factuur, depth: 0, overrideAccess: true })
    const csv = `Datum;Bedrag;Mededeling;Naam tegenpartij\n15/11/2026;50,00;${f.ogm};Factuurclub A\n15/11/2026;12,00;+++000/0000/09797+++;Onbekend\n`
    const v = await bankVoorbeeld(payload, csv)
    expect(Array.isArray(v) && v.map((r) => r.status)).toEqual(['koppelen', 'geen-factuur'])
    expect(await bankImporteren(payload, ids.staf, csv)).toEqual({ ok: true, geboekt: 1, overgeslagen: 1 })
    expect(await factuurBeeld(payload, ids.factuur)).toMatchObject({ stand: 'betaald', open: 0 })
    const boete = await payload.findByID({ collection: 'boetes', id: ids.boete, depth: 0, overrideAccess: true })
    expect(boete.status).toBe('betaald')
    // Hetzelfde afschrift nog eens: al geboekt.
    expect(await bankImporteren(payload, ids.staf, csv)).toEqual({ ok: true, geboekt: 0, overgeslagen: 2 })
    const v2 = await bankVoorbeeld(payload, csv)
    expect(Array.isArray(v2) && v2[0]!.status).toBe('al-geboekt')
  }, 120_000)

  it('Mollie: zonder sleutel niets; met sleutel vraagt de webhook de betaling zelf op en boekt ze één keer', async () => {
    expect(await mollieWebhook(payload, 'tr_abc')).toMatchObject({ ok: false, status: 501 })
    // Een nieuwe factuur om online te betalen.
    await payload.create({ collection: 'boetes', data: { club: ids.clubA, omschrijving: 'Forfait', bedrag: 40, status: 'opgelegd', opgelegdOp: new Date().toISOString() } as never, overrideAccess: true })
    const [id] = (await conceptenMaken(payload, ids.staf, { aansluitingen: true, boetes: true, scheidsrechters: false, clubs: [ids.clubA] })).gemaakt
    expect((await facturenLijst(payload, { id: { equals: id! } }))[0]!.lijnen.map((l) => l.soort)).toEqual(['boete'])
    await factuurVersturen(payload, id!)
    process.env.MOLLIE_API_KEY = 'test_sleutel'
    const vals = vi.fn(async () => new Response(JSON.stringify({ status: 'paid', amount: { value: '40.00', currency: 'EUR' }, metadata: { factuurId: id }, paidAt: '2026-11-15T10:00:00+00:00' }), { status: 200 }))
    vi.stubGlobal('fetch', vals)
    expect(await mollieWebhook(payload, 'tr_echt1')).toEqual({ ok: true, geboekt: true })
    expect(await mollieWebhook(payload, 'tr_echt1')).toEqual({ ok: true, geboekt: false })
    expect(vals).toHaveBeenCalledWith('https://api.mollie.com/v2/payments/tr_echt1', expect.anything())
    expect(await factuurBeeld(payload, id!)).toMatchObject({ stand: 'betaald' })
    expect(await mollieWebhook(payload, 'kwaadaardig;drop')).toMatchObject({ ok: false, status: 400 })
  }, 120_000)
})
