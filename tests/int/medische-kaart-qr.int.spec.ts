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
import { kaartLink } from '@/lib/medische-kaart-code'
import { kaartenOpladen } from '@/lib/medische-kaart-server'
import { attestOpslaan } from '@/lib/registratie-server'

// De medische kaart met QR, van begin tot eind: een foto van de ingevulde kaart komt bij het juiste
// lid, zonder dat iemand dat lid kiest — en nooit bij een ander lid of buiten de eigen club.

let payload: Payload
const S = Date.now()
const ids = { clubA: 0, clubB: 0, p1: 0, p2: 0, p3: 0, staf: 0, lid: 0 }

async function foto(playerId: number | null, naam = 'kaart.jpg'): Promise<File> {
  const blad = sharp({ create: { width: 1600, height: 2260, channels: 3, background: '#f6f3ec' } })
  const lagen = playerId != null ? [{ input: await QRCode.toBuffer(kaartLink('https://livescore.roodgries.be', playerId), { margin: 2, width: 380 }), left: 1100, top: 140 }] : []
  const jpg = await sharp(await blad.composite(lagen).png().toBuffer()).rotate(5, { background: '#4a3b2a' }).jpeg({ quality: 75 }).toBuffer()
  return new File([new Uint8Array(jpg)], naam, { type: 'image/jpeg' })
}

const pdf = (who: 'club' | 'lid', idsQs: string) => pdfRoute(new Request(`http://localhost:3000/api/medische-kaart/pdf?ids=${idsQs}`, { headers: { authorization: `JWT ${who}` } }))

describe('medische kaart met QR', () => {
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

  it('een stapel foto\'s: elke kaart bij het juiste lid, nooit buiten de eigen club', async () => {
    const r = await kaartenOpladen(payload, wie.club as never, [await foto(ids.p1, 'kaat.jpg'), await foto(ids.p2, 'bert.jpg'), await foto(null, 'wazig.jpg'), await foto(ids.p3, 'ine.jpg')], { datum: '2026-11-10' })
    expect(r[0]).toMatchObject({ ok: true, playerId: ids.p1, viaQr: true })
    expect(r[1]).toMatchObject({ ok: false, fout: expect.stringContaining('niet mag') })
    expect(r[2]).toMatchObject({ ok: false, fout: expect.stringContaining('Geen QR-code') })
    expect(r[3]).toMatchObject({ ok: false, fout: expect.stringContaining('ter goedkeuring') })
    // Over het lid van een andere club verklapt de fout niets.
    expect(JSON.stringify(r[1])).not.toContain('Bert')

    const p1 = await payload.findByID({ collection: 'players', id: ids.p1, depth: 1, overrideAccess: true })
    expect(String(p1.medischeKeuringOp).slice(0, 10)).toBe('2026-11-10')
    const attest = p1.medischAttestBestand as { herkendViaQr?: boolean; player?: unknown } | null
    expect(attest?.herkendViaQr).toBe(true)
    const p2 = await payload.findByID({ collection: 'players', id: ids.p2, depth: 0, overrideAccess: true })
    expect(p2.medischAttestBestand ?? null).toBeNull()
  }, 120_000)

  it('één kaart voor een gekozen lid: een kaart van een ander lid wordt geweigerd, zonder QR geldt de keuze', async () => {
    const fout = await kaartenOpladen(payload, wie.club as never, [await foto(ids.p2)], { voorLid: ids.p1, datum: '2026-11-11' })
    expect(fout[0]).toMatchObject({ ok: false, fout: expect.stringContaining('ander lid') })
    const zonderQr = await kaartenOpladen(payload, wie.lid as never, [await foto(null)], { voorLid: ids.p1, datum: '2026-11-11' })
    expect(zonderQr[0]).toMatchObject({ ok: true, playerId: ids.p1, viaQr: false })
    // Een tweede attest vervangt het eerste: één attest per lid.
    const n = await payload.count({ collection: 'medische-attesten', where: { player: { equals: ids.p1 } }, overrideAccess: true })
    expect(n.totalDocs).toBe(1)
  }, 120_000)

  it('ook de gewone upload bij een lid controleert de QR', async () => {
    await expect(attestOpslaan(payload, { playerId: ids.p1, clubId: ids.clubA, userId: ids.staf, bestand: await foto(ids.p2), vorige: null })).rejects.toThrow(/ander lid/)
    const ok = await attestOpslaan(payload, { playerId: ids.p1, clubId: ids.clubA, userId: ids.staf, bestand: await foto(ids.p1), vorige: null })
    const a = await payload.findByID({ collection: 'medische-attesten', id: ok, depth: 0, overrideAccess: true })
    expect(a.herkendViaQr).toBe(true)
  }, 120_000)

  it('afdrukken: de club voor eigen leden; het lid pas na "verstuurd"', async () => {
    const club = await pdf('club', String(ids.p1))
    expect([club.status, club.headers.get('content-type')]).toEqual([200, 'application/pdf'])
    expect((await club.arrayBuffer()).byteLength).toBeGreaterThan(2000)
    expect((await pdf('club', `${ids.p1},${ids.p2}`)).status).toBe(403)
    expect((await pdf('lid', String(ids.p1))).status).toBe(403)
    await payload.create({ collection: 'medische-kaart-aanvragen', data: { player: ids.p1, club: ids.clubA, via: 'lid', status: 'verstuurd' } as never, overrideAccess: true })
    expect((await pdf('lid', String(ids.p1))).status).toBe(200)
    expect((await pdf('lid', String(ids.p2))).status).toBe(403)
  }, 120_000)
})
