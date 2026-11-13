// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const wie = vi.hoisted(() => ({ lid: null as null | Record<string, unknown>, club: null as null | Record<string, unknown>, vreemd: null as null | Record<string, unknown> }))
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) => {
    const h = req.headers.get('authorization') ?? ''
    return h === 'JWT lid' ? wie.lid : h === 'JWT club' ? wie.club : h === 'JWT vreemd' ? wie.vreemd : null
  },
}))

import config from '@/payload.config'
import { GET as attestRoute } from '@/app/api/lid-documenten/attest/route'
import { GET as ublRoute } from '@/app/api/facturen/[id]/ubl/route'
import { conceptenMaken, factuurVersturen } from '@/lib/facturatie-server'
import { ficheBijwerken, ficheLezen } from '@/lib/ledenfiche'
import { documentenVan, documentOpladen, documentVerwijderen } from '@/lib/lid-documenten'
import { lidmaatschappenBijwerken, verzekerden, verzekerdenCsv } from '@/lib/lidmaatschap'

// De ledenfiche, het lidmaatschap per seizoen (verzekerdenlijst), documenten per lid en de e-factuur — met wie
// wat mag: het lid en de ouders, de staf van de eigen club, de federatie; een andere club niets.

let payload: Payload
const S = Date.now()
const ids = { clubA: 0, clubB: 0, ploegA: 0, ploegB: 0, lid: 0, ander: 0, lidUser: 0, staf: 0, vreemd: 0 }
let pdfBytes: Uint8Array = new Uint8Array()
const pdf = () => new File([pdfBytes as BlobPart], 'doc.pdf', { type: 'application/pdf' })
const jaar = new Date().getUTCFullYear()

describe('ledenfiche, lidmaatschap, documenten en e-factuur', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const d = await PDFDocument.create()
    d.addPage()
    pdfBytes = await d.save()
    await payload.create({ collection: 'users', data: { email: `eerste-lf-${S}@test.be`, password: 'fiche-test-123' }, overrideAccess: true })
    ids.clubA = Number((await payload.create({ collection: 'clubs', data: { name: `Ficheclub A ${S}`, ondernemingsnummer: '0412.345.614', factuurGemeente: 'Brugge' } as never, overrideAccess: true })).id)
    ids.clubB = Number((await payload.create({ collection: 'clubs', data: { name: `Ficheclub B ${S}` }, overrideAccess: true })).id)
    const ploeg = async (c: number) => Number((await payload.create({ collection: 'teams', data: { name: `Ficheploeg ${c} ${S}`, club: c, category: 'senioren', reeks: 'LH' } as never, overrideAccess: true })).id)
    ids.ploegA = await ploeg(ids.clubA)
    ids.ploegB = await ploeg(ids.clubB)
    ids.lid = Number((await payload.create({ collection: 'players', data: { name: `Lien Fiche ${S}`, voornaam: 'Lien', team: ids.ploegA, club: ids.clubA, shirtNumber: 4, birthDate: '2001-05-04', vergunningsstatus: 'geldig' } as never, overrideAccess: true })).id)
    ids.ander = Number((await payload.create({ collection: 'players', data: { name: `Bas Ander ${S}`, team: ids.ploegB, club: ids.clubB, shirtNumber: 5, vergunningsstatus: 'geldig' } as never, overrideAccess: true })).id)
    ids.lidUser = Number((await payload.create({ collection: 'users', data: { email: `lien-${S}@test.be`, password: 'fiche-test-123', player: ids.lid } as never, overrideAccess: true })).id)
    ids.staf = Number((await payload.create({ collection: 'users', data: { email: `staf-lf-${S}@test.be`, password: 'fiche-test-123', roles: ['club-beheerder'], club: ids.clubA } as never, overrideAccess: true })).id)
    ids.vreemd = Number((await payload.create({ collection: 'users', data: { email: `vreemd-lf-${S}@test.be`, password: 'fiche-test-123', roles: ['club-beheerder'], club: ids.clubB } as never, overrideAccess: true })).id)
    wie.lid = { id: ids.lidUser, roles: ['viewer'], player: ids.lid }
    wie.club = { id: ids.staf, roles: ['club-beheerder'], club: ids.clubA }
    wie.vreemd = { id: ids.vreemd, roles: ['club-beheerder'], club: ids.clubB }
  }, 120_000)

  it('de ledenfiche: het lid en de club wijzigen, een andere club niet; een toestemming krijgt haar datum', async () => {
    expect(await ficheBijwerken(payload, wie.lid, ids.lid, { straat: 'Kerkstraat 12', postcode: '8200', gemeente: 'Brugge', toestemmingFoto: true })).toEqual({ ok: true })
    expect(await ficheBijwerken(payload, wie.club, ids.lid, { telefoon: '0470 12 34 56' })).toEqual({ ok: true })
    expect(await ficheBijwerken(payload, wie.vreemd, ids.lid, { telefoon: '0470 99 99 99' })).toMatchObject({ ok: false, status: 403 })
    expect(await ficheBijwerken(payload, wie.lid, ids.lid, { postcode: '123' })).toMatchObject({ ok: false, status: 400 })
    const f = await ficheLezen(payload, ids.lid)
    expect(f).toMatchObject({ straat: 'Kerkstraat 12', postcode: '8200', gemeente: 'Brugge', telefoon: '0470 12 34 56', toestemmingFoto: true })
    const p = await payload.findByID({ collection: 'players', id: ids.lid, depth: 0, overrideAccess: true })
    expect(p.toestemmingOp).toBeTruthy()
  }, 60_000)

  it('lidmaatschap per seizoen: bijwerken is idempotent; wie stopt, wordt afgesloten maar blijft in de lijst', async () => {
    const eerste = await lidmaatschappenBijwerken(payload)
    expect(eerste.nieuw).toBeGreaterThanOrEqual(2)
    expect((await lidmaatschappenBijwerken(payload)).nieuw).toBe(0)
    let lijst = await verzekerden(payload, eerste.seizoen, { club: ids.clubA })
    expect(lijst.find((r) => r.id === ids.lid)).toMatchObject({ club: `Ficheclub A ${S}`, soort: 'speler', straat: 'Kerkstraat 12', tot: null })
    // Bas stopt (vergunning ingetrokken): afgesloten, niet weg.
    await payload.update({ collection: 'players', id: ids.ander, data: { vergunningsstatus: 'geen' } as never, overrideAccess: true })
    expect((await lidmaatschappenBijwerken(payload)).gestopt).toBe(1)
    lijst = await verzekerden(payload, eerste.seizoen, { club: ids.clubB })
    expect(lijst.find((r) => r.id === ids.ander)?.tot).toBeTruthy()
    const csv = verzekerdenCsv(await verzekerden(payload, eerste.seizoen, { club: ids.clubA }))
    expect(csv.split('\r\n')[0]).toContain('Aangesloten vanaf')
    expect(csv).toContain('Kerkstraat 12')
  }, 60_000)

  it('documenten: het lid laadt op, de club verbergt een interne nota, een andere club ziet niets', async () => {
    const eigen = await documentOpladen(payload, wie.lid as never, ids.lid, { bestand: pdf(), titel: 'Formulier mutualiteit', soort: 'mutualiteit' })
    expect(eigen.ok).toBe(true)
    const intern = await documentOpladen(payload, wie.club as never, ids.lid, { bestand: pdf(), titel: 'Interne nota', soort: 'ander', zichtbaarVoorLid: 'false' })
    expect(intern.ok).toBe(true)
    expect(await documentOpladen(payload, wie.vreemd as never, ids.lid, { bestand: pdf(), titel: 'x', soort: 'ander' })).toMatchObject({ ok: false, status: 403 })
    expect(await documentOpladen(payload, wie.lid as never, ids.lid, { bestand: new File(['x'], 'a.exe', { type: 'application/x-msdownload' }), titel: 'Iets', soort: 'ander' })).toMatchObject({ ok: false, status: 400 })

    expect((await documentenVan(payload, wie.lid, ids.lid))!.map((d) => d.titel)).toEqual(['Formulier mutualiteit'])
    expect((await documentenVan(payload, wie.club, ids.lid))!.map((d) => d.titel).sort()).toEqual(['Formulier mutualiteit', 'Interne nota'])
    expect(await documentenVan(payload, wie.vreemd, ids.lid)).toBeNull()
    // Het lid verwijdert enkel wat het zelf opliet.
    expect(await documentVerwijderen(payload, wie.lid, (intern as { id: number }).id)).toMatchObject({ ok: false })
    expect(await documentVerwijderen(payload, wie.lid, (eigen as { id: number }).id)).toEqual({ ok: true })
    // De club hoorde van het document van het lid.
    const m = await payload.find({ collection: 'meldingen', where: { user: { equals: ids.staf } }, sort: '-createdAt', limit: 1, overrideAccess: true })
    expect(String(m.docs[0]?.titel)).toContain('Nieuw document')
  }, 60_000)

  it('attest van lidmaatschap: het lid wel, een andere club niet', async () => {
    const vraag = (who: string) => attestRoute(new Request(`http://localhost:3000/api/lid-documenten/attest?playerId=${ids.lid}`, { headers: { authorization: `JWT ${who}` } }))
    const r = await vraag('lid')
    expect([r.status, r.headers.get('content-type')]).toEqual([200, 'application/pdf'])
    expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(1500)
    expect((await vraag('vreemd')).status).toBe(404)
  }, 60_000)

  it('e-factuur: UBL voor een verstuurde factuur; zonder ondernemingsnummer van de federatie een duidelijke fout', async () => {
    await payload.create({ collection: 'boetes', data: { club: ids.clubA, omschrijving: 'Blad te laat', bedrag: 25, status: 'opgelegd', opgelegdOp: new Date().toISOString() } as never, overrideAccess: true })
    const [id] = (await conceptenMaken(payload, ids.staf, { aansluitingen: false, boetes: true, scheidsrechters: false, clubs: [ids.clubA] })).gemaakt
    await factuurVersturen(payload, id!)
    const vraag = () => ublRoute(new Request(`http://localhost:3000/api/facturen/${id}/ubl`, { headers: { authorization: 'JWT club' } }), { params: Promise.resolve({ id: String(id) }) })
    await payload.updateGlobal({ slug: 'settings', data: { factuurOndernemingsnummer: '', factuurIban: 'BE68539007547034' } as never })
    const zonder = await vraag()
    expect(zonder.status).toBe(400)
    expect(((await zonder.json()) as { error: string }).error).toContain('federatie')
    await payload.updateGlobal({ slug: 'settings', data: { factuurOndernemingsnummer: '0400.000.086', factuurAdres: 'Voorbeeldstraat 1\n9000 Gent' } as never })
    const met = await vraag()
    expect(met.status).toBe(200)
    const xml = await met.text()
    expect(xml).toContain(`<cbc:ID>${jaar}-`)
    expect(xml).toContain('<cbc:EndpointID schemeID="0208">0412345614</cbc:EndpointID>')
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">25.00</cbc:PayableAmount>')
  }, 60_000)
})
