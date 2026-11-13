// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Inloggen vervangen door een dubbel: "JWT club" = staf van club A, "JWT lid" = het lid zelf.
const wie = vi.hoisted(() => ({ club: null as null | Record<string, unknown>, lid: null as null | Record<string, unknown> }))
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) => {
    const h = req.headers.get('authorization')
    return h === 'JWT club' ? wie.club : h === 'JWT lid' ? wie.lid : null
  },
}))

import config from '@/payload.config'
import { GET as pdfRoute } from '@/app/api/medische-kaart/pdf/route'
import { attestBeslissen, attestenLijst, attestOpslaan, attestPubliek } from '@/lib/attest-server'
import { kaartCode, kaartLink } from '@/lib/medische-kaart-code'
import { kaartenOpladen } from '@/lib/medische-kaart-server'

import { attestFoto } from '../fixtures/attest-foto'

// Het medisch attest met QR, van begin tot eind: een foto komt bij het juiste lid zonder dat iemand dat lid
// kiest — nooit bij een ander lid of buiten de eigen club. Alles juist → meteen goedgekeurd; al de rest (ook een
// blanco attest via de publieke link) → de federatie kijkt het na.

let payload: Payload
const S = Date.now()
const ids = { clubA: 0, clubB: 0, p1: 0, p2: 0, p3: 0, staf: 0, lid: 0 }

/** Een foto met enkel een QR (geen hoekmerken, geen vakjes): het lid is gekend, maar niets is te lezen. */
async function foto(playerId: number | null, naam = 'kaart.jpg'): Promise<File> {
  const blad = sharp({ create: { width: 1600, height: 2260, channels: 3, background: '#f6f3ec' } })
  const lagen = playerId != null ? [{ input: await QRCode.toBuffer(kaartLink('https://livescore.roodgries.be', playerId), { margin: 2, width: 380 }), left: 1100, top: 140 }] : []
  const jpg = await sharp(await blad.composite(lagen).png().toBuffer()).rotate(5, { background: '#4a3b2a' }).jpeg({ quality: 75 }).toBuffer()
  return new File([new Uint8Array(jpg)], naam, { type: 'image/jpeg' })
}
const jpg = (buf: Buffer, n = 'attest.jpg') => new File([new Uint8Array(buf)], n, { type: 'image/jpeg' })
const speler = (id: number) => payload.findByID({ collection: 'players', id, depth: 0, overrideAccess: true })

const pdf = (who: 'club' | 'lid', idsQs: string) => pdfRoute(new Request(`http://localhost:3000/api/medische-kaart/pdf?ids=${idsQs}`, { headers: { authorization: `JWT ${who}` } }))

describe('medisch attest met QR', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.create({ collection: 'users', data: { email: `eerste-kaart-${S}@test.be`, password: 'kaart-test-12345' }, overrideAccess: true })
    const club = async (n: string) => Number((await payload.create({ collection: 'clubs', data: { name: `${n} ${S}` }, overrideAccess: true })).id)
    ids.clubA = await club('Kaart A')
    ids.clubB = await club('Kaart B')
    const ploeg = async (c: number) => Number((await payload.create({ collection: 'teams', data: { name: `Kaartploeg ${c} ${S}`, club: c, category: 'senioren', reeks: 'LH' } as never, overrideAccess: true })).id)
    const ploegA = await ploeg(ids.clubA)
    const ploegB = await ploeg(ids.clubB)
    const lid = async (n: string, team: number, extra: Record<string, unknown> = {}) =>
      Number((await payload.create({ collection: 'players', data: { name: `${n} ${S}`, team, shirtNumber: 7, birthDate: '2011-03-12', ...extra } as never, overrideAccess: true })).id)
    ids.p1 = await lid('Kaat Kaart', ploegA)
    ids.p2 = await lid('Bert Ander', ploegB)
    ids.p3 = await lid('Ine Ingediend', ploegA, { registratieStatus: 'ingediend' })
    // Oud lid: players.club leeg — de club volgt uit de ploeg.
    await payload.db.updateOne({ collection: 'players', id: ids.p1, data: { club: null } }).catch(() => null)
    ids.staf = Number((await payload.create({ collection: 'users', data: { email: `staf-kaart-${S}@test.be`, password: 'kaart-test-12345', roles: ['club-beheerder'], club: ids.clubA } as never, overrideAccess: true })).id)
    ids.lid = Number((await payload.create({ collection: 'users', data: { email: `lid-kaart-${S}@test.be`, password: 'kaart-test-12345', player: ids.p1 } as never, overrideAccess: true })).id)
    wie.club = { id: ids.staf, roles: ['club-beheerder'], club: ids.clubA }
    wie.lid = { id: ids.lid, roles: ['viewer'], player: ids.p1 }
  }, 120_000)

  it("een stapel foto's: elk attest bij het juiste lid; alles juist → goedgekeurd", async () => {
    const r = await kaartenOpladen(
      payload,
      wie.club as never,
      [jpg(await attestFoto({ playerId: ids.p1, geschikt: true, nietHoger: false, hoek: 4 }), 'kaat.jpg'), await foto(ids.p2, 'bert.jpg'), await foto(null, 'wazig.jpg'), await foto(ids.p3, 'ine.jpg')],
      { datum: '2026-11-10' },
    )
    expect(r[0]).toMatchObject({ ok: true, playerId: ids.p1, viaQr: true, status: 'goedgekeurd' })
    expect(r[1]).toMatchObject({ ok: false, fout: expect.stringContaining('niet mag') })
    expect(r[2]).toMatchObject({ ok: false, fout: expect.stringContaining('Geen QR-code') })
    expect(r[3]).toMatchObject({ ok: false, fout: expect.stringContaining('ter goedkeuring') })
    // Over het lid van een andere club verklapt de fout niets.
    expect(JSON.stringify(r[1])).not.toContain('Bert')

    const p1 = await payload.findByID({ collection: 'players', id: ids.p1, depth: 1, overrideAccess: true })
    expect(String(p1.medischeKeuringOp).slice(0, 10)).toBe('2026-11-10')
    const attest = p1.medischAttestBestand as { herkendViaQr?: boolean; status?: string } | null
    expect([attest?.herkendViaQr, attest?.status]).toEqual([true, 'goedgekeurd'])
    expect((await speler(ids.p2)).medischAttestBestand ?? null).toBeNull()
  }, 120_000)

  it('een foto zonder hoekmerken (QR wel): nakijken, en het goedgekeurde attest blijft staan', async () => {
    const voor = await speler(ids.p1)
    const r = await kaartenOpladen(payload, wie.club as never, [await foto(ids.p1)], { datum: '2026-11-11' })
    expect(r[0]).toMatchObject({ ok: true, status: 'nakijken', reden: expect.stringContaining('hoeken') })
    const na = await speler(ids.p1)
    expect([String(na.medischeKeuringOp).slice(0, 10), na.medischAttestBestand]).toEqual(['2026-11-10', voor.medischAttestBestand])
  }, 120_000)

  it('één attest voor een gekozen lid: een attest van een ander lid wordt geweigerd', async () => {
    const fout = await kaartenOpladen(payload, wie.club as never, [await foto(ids.p2)], { voorLid: ids.p1, datum: '2026-11-11' })
    expect(fout[0]).toMatchObject({ ok: false, fout: expect.stringContaining('ander lid') })
    const zonderQr = await kaartenOpladen(payload, wie.lid as never, [await foto(null)], { voorLid: ids.p1 })
    expect(zonderQr[0]).toMatchObject({ ok: true, playerId: ids.p1, viaQr: false, status: 'nakijken' })
  }, 120_000)

  it('ook de gewone upload bij een lid controleert de QR', async () => {
    await expect(attestOpslaan(payload, { playerId: ids.p1, bestand: await foto(ids.p2), userId: ids.staf, via: 'club' })).rejects.toThrow(/ander lid/)
    const ok = await attestOpslaan(payload, { playerId: ids.p1, bestand: await foto(ids.p1), userId: ids.staf, via: 'club' })
    const a = await payload.findByID({ collection: 'medische-attesten', id: ok.attestId, depth: 0, overrideAccess: true })
    expect([a.herkendViaQr, a.status]).toEqual([true, 'nakijken'])
  }, 120_000)

  it('de vakjes van de arts: "mag niet hoger" zet het verbod, "niet geschikt" gaat naar de federatie', async () => {
    const ok = await kaartenOpladen(payload, wie.club as never, [jpg(await attestFoto({ playerId: ids.p1, geschikt: true, nietHoger: true, hoek: 5 }))], { datum: '2026-11-12' })
    expect(ok[0]).toMatchObject({ ok: true, status: 'goedgekeurd', meldingen: [expect.stringContaining('doktersverbod')] })
    const p1 = await payload.findByID({ collection: 'players', id: ids.p1, depth: 1, overrideAccess: true })
    expect([p1.hogerSpelenVerbod, String(p1.medischeKeuringOp).slice(0, 10)]).toEqual([true, '2026-11-12'])
    expect((p1.medischAttestBestand as { lezing?: { uitlijning?: string } }).lezing?.uitlijning).toBe('merken')

    const niet = await kaartenOpladen(payload, wie.club as never, [jpg(await attestFoto({ playerId: ids.p1, geschikt: false, nietHoger: false, hoek: -4 }))], { datum: '2026-11-13' })
    expect(niet[0]).toMatchObject({ ok: true, status: 'nakijken', reden: expect.stringContaining('niet aangekruist') })
    const na = await speler(ids.p1)
    // Datum blijft de vorige; het verbod wordt nooit vanzelf opgeheven.
    expect([String(na.medischeKeuringOp).slice(0, 10), na.hogerSpelenVerbod]).toEqual(['2026-11-12', true])
  }, 120_000)

  it('afdrukken: de club voor eigen leden; het lid (of de ouder) altijd het eigen attest', async () => {
    const club = await pdf('club', String(ids.p1))
    expect([club.status, club.headers.get('content-type')]).toEqual([200, 'application/pdf'])
    expect((await club.arrayBuffer()).byteLength).toBeGreaterThan(2000)
    expect((await pdf('club', `${ids.p1},${ids.p2}`)).status).toBe(403)
    expect((await pdf('lid', String(ids.p1))).status).toBe(200)
    expect((await pdf('lid', String(ids.p2))).status).toBe(403)
  }, 120_000)

  it('de publieke link, zonder login: alles juist → goedgekeurd met enkel "Bert A."; een ander lid → geweigerd', async () => {
    const goed = await attestPubliek(payload, jpg(await attestFoto({ playerId: ids.p2, geschikt: true, nietHoger: false, hoek: 3, whatsapp: true })))
    expect(goed).toMatchObject({ ok: true, status: 'goedgekeurd', naam: 'Bert A.' })
    expect(JSON.stringify(goed)).not.toContain(String(S))
    expect((await speler(ids.p2)).medischAttestBestand).toBeTruthy()
    const a = await payload.find({ collection: 'medische-attesten', where: { player: { equals: ids.p2 } }, depth: 0, overrideAccess: true })
    expect(a.docs[0]).toMatchObject({ via: 'publiek', status: 'goedgekeurd' })
    expect(a.docs[0]!.geuploadDoor ?? null).toBeNull()

    const ander = await attestPubliek(payload, jpg(await attestFoto({ playerId: ids.p2, geschikt: true, nietHoger: false, hoek: 3 })), { code: kaartCode(ids.p1) })
    expect(ander).toMatchObject({ ok: false, fout: expect.stringContaining('ander lid') })
    expect(await attestPubliek(payload, jpg(await attestFoto({ playerId: ids.p1, geschikt: true, nietHoger: false, hoek: 3 })), { code: 'K1-AAAAAAAA' })).toMatchObject({ ok: false })
  }, 120_000)

  it('een blanco attest: eerst naam en geboortedatum, dan nakijken; de federatie koppelt het lid en keurt goed', async () => {
    const blad = jpg(await attestFoto({ blanco: true, geschikt: true, nietHoger: false, hoek: -2 }))
    expect(await attestPubliek(payload, blad)).toEqual({ ok: false, nodig: 'gegevens', blanco: true })
    const r = await attestPubliek(payload, blad, { gegevens: { naam: 'Ine Ingediend', geboortedatum: '2011-03-12', club: 'Kaart A', email: 'ouder@voorbeeld.be' } })
    expect(r).toMatchObject({ ok: true, status: 'nakijken' })
    const rij = (await attestenLijst(payload, 'nakijken')).find((x) => x.blanco && x.opgegeven?.naam === 'Ine Ingediend')!
    expect(rij.voorstel?.id).toBe(ids.p3) // zelfde naam en geboortedatum
    expect(rij.vakjes).toEqual({ geschikt: true, nietHoger: false })

    expect(await attestBeslissen(payload, ids.staf, { id: rij.id, besluit: 'goedkeuren' })).toMatchObject({ ok: false, status: 400 })
    expect(await attestBeslissen(payload, ids.staf, { id: rij.id, besluit: 'goedkeuren', playerId: ids.p3, keuringOp: '2026-11-05' })).toEqual({ ok: true })
    const p3 = await speler(ids.p3)
    expect([String(p3.medischeKeuringOp).slice(0, 10), p3.medischAttestBestand]).toEqual(['2026-11-05', rij.id])
    expect(await attestBeslissen(payload, ids.staf, { id: rij.id, besluit: 'afkeuren', reden: 'te laat bedacht' })).toMatchObject({ ok: false, status: 409 })
  }, 120_000)

  it('de federatie laadt een stapel op: een kaart zonder QR komt ter nakijken om toe te kennen', async () => {
    const fed = { id: ids.staf, roles: ['admin'] }
    const r = await kaartenOpladen(payload, fed as never, [await foto(null, 'Jan Zonder QR.jpg'), await foto(ids.p2, 'bert.jpg')])
    expect(r[0]).toMatchObject({ ok: true, playerId: null, status: 'nakijken' })
    expect(r[1]).toMatchObject({ ok: true, playerId: ids.p2 })
    const rij = (await attestenLijst(payload, 'nakijken')).find((x) => x.blanco && x.opgegeven?.naam === 'Jan Zonder QR')
    expect(rij).toBeTruthy()
  }, 120_000)

  it('afkeuren met een reden: het lid en de club krijgen een melding', async () => {
    const r = await kaartenOpladen(payload, wie.lid as never, [await foto(null)], { voorLid: ids.p1 })
    expect(r[0]).toMatchObject({ ok: true, status: 'nakijken' })
    const id = Number(
      (await payload.find({ collection: 'medische-attesten', where: { and: [{ player: { equals: ids.p1 } }, { status: { equals: 'nakijken' } }] }, sort: '-createdAt', limit: 1, overrideAccess: true })).docs[0]!.id,
    )
    expect(await attestBeslissen(payload, ids.staf, { id, besluit: 'afkeuren', reden: 'kort' })).toMatchObject({ ok: false, status: 400 })
    expect(await attestBeslissen(payload, ids.staf, { id, besluit: 'afkeuren', reden: 'Geen stempel van de arts.' })).toEqual({ ok: true })
    const m = await payload.find({ collection: 'meldingen', where: { user: { equals: ids.staf } }, sort: '-createdAt', limit: 1, overrideAccess: true })
    expect(String(m.docs[0]!.titel)).toContain('afgekeurd')
  }, 120_000)
})
