import fs from 'fs/promises'
import path from 'path'

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel. `payload.login` ondertekent een JWT, en dat lukt niet in de
// jsdom-omgeving waarin deze tests draaien (jose struikelt over de Uint8Array van jsdom). Wat hier
// getest moet worden is niet Payload's inlog maar het aan elkaar plakken van de stukken — dus:
// een Authorization-header telt als ingelogd, geen header als niet ingelogd. Zo blijft de
// 401-tak van de route wél echt getest.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) =>
    req.headers.get('authorization') ? { id: 1, roles: ['admin'] } : null,
}))

import config from '@/payload.config'
import { resolveMediaDir } from '@/lib/media-dir'
import { GET as standVanUpload, POST as uploadStuk } from '@/app/api/match/[id]/video/upload/route'

// Een wedstrijdvideo in stukken uploaden.
//
// Aanleiding: "Uploaden mislukt (verbinding)". Honderden megabytes gingen in één verzoek, dus één
// verbinding moest minutenlang houden vanaf een telefoon; viel die weg, dan was álles weg.
//
// Het gevaarlijke aan stukken is niet dat een upload mislukt — dat merk je — maar dat ze slaagt
// met een gat of een dubbel stuk erin. Dan staat er een video die "geüpload" heet en nergens op
// slaat. Vandaar dat hier vooral nagerekend wordt dat de bytes er precies één keer en in de
// juiste volgorde in staan.

let payload: Payload
const token = 'test'
let matchId: number

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })

function stukRequest(id: number, body: Buffer, extra: Record<string, string>) {
  return new Request(`http://localhost/api/match/${id}/video/upload`, {
    method: 'POST',
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(body.byteLength),
      authorization: `JWT ${token}`,
      ...extra,
    },
    body: new Uint8Array(body),
    // @ts-expect-error — Node vereist dit voor een verzoek met een body-stream.
    duplex: 'half',
  })
}

describe('een video in stukken uploaden', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const club = await payload.create({
      collection: 'clubs', data: { name: `Uploadclub ${stamp}`, analyseOnly: true }, overrideAccess: true,
    })
    const team = (naam: string) =>
      payload.create({
        collection: 'teams',
        data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id, analyseOnly: true },
        overrideAccess: true,
      })
    const home = await team(`Thuis ${stamp}`)
    const away = await team(`Uit ${stamp}`)
    const match = await payload.create({
      collection: 'matches',
      data: {
        reeks: '1NAH', homeTeam: home.id, awayTeam: away.id, date: new Date().toISOString(),
        status: 'scheduled', goalAreaDepth: 10, analyseOnly: true,
      },
      overrideAccess: true,
    })
    matchId = match.id as number
  }, 60_000)

  it('plakt de stukken in de juiste volgorde aan elkaar', async () => {
    const uploadId = 'aa11bb22cc33dd44'
    const een = Buffer.alloc(1000, 1)
    const twee = Buffer.alloc(500, 2)

    const r1 = await uploadStuk(stukRequest(matchId, een, { 'x-upload-id': uploadId, 'x-offset': '0' }), params(matchId))
    expect(r1?.status).toBe(200)
    expect((await r1!.json()).bytes).toBe(1000)

    const r2 = await uploadStuk(
      stukRequest(matchId, twee, { 'x-upload-id': uploadId, 'x-offset': '1000', 'x-laatste-stuk': '1' }),
      params(matchId),
    )
    expect(r2?.status).toBe(200)
    const klaar = await r2!.json()
    expect(klaar.url).toMatch(/^\/api\/clip\/[0-9a-f]+\.mp4$/)
    expect(klaar.bytes).toBe(1500)

    // De inhoud, byte voor byte: elk stuk één keer, in volgorde.
    const bestand = path.join(resolveMediaDir(), 'clips', klaar.url.split('/').pop())
    const opSchijf = await fs.readFile(bestand)
    expect(opSchijf.byteLength).toBe(1500)
    expect(opSchijf.subarray(0, 1000).every((b) => b === 1)).toBe(true)
    expect(opSchijf.subarray(1000).every((b) => b === 2)).toBe(true)

    // En de wedstrijd wijst ernaar.
    const na = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
    expect(na.videoUrl).toBe(klaar.url)
    await fs.unlink(bestand).catch(() => {})
  }, 60_000)

  it('weigert een stuk dat niet aansluit, en zegt waar de server staat', async () => {
    // Dít is de bewaker tegen een stille verminking: een stuk dat op de verkeerde plek geplakt
    // wordt, geeft een video die geslaagd lijkt maar een gat of een dubbel blok bevat.
    const uploadId = 'bb22cc33dd44ee55'
    await uploadStuk(stukRequest(matchId, Buffer.alloc(1000, 1), { 'x-upload-id': uploadId, 'x-offset': '0' }), params(matchId))

    const scheef = await uploadStuk(
      stukRequest(matchId, Buffer.alloc(100, 9), { 'x-upload-id': uploadId, 'x-offset': '5000' }),
      params(matchId),
    )
    expect(scheef?.status).toBe(409)
    expect((await scheef!.json()).bytes).toBe(1000)

    await fs.unlink(path.join(resolveMediaDir(), 'clips', `.deel-${uploadId}.mp4`)).catch(() => {})
  }, 60_000)

  it('vertelt hoever een onderbroken upload staat, afgekapt op een heel stuk', async () => {
    const uploadId = 'cc33dd44ee55ff66'
    // Alsof de verbinding wegviel middenin stuk 2: er staat anderhalf stuk.
    const anderhalf = Buffer.alloc(4 * 1024 * 1024 + 700, 7)
    await uploadStuk(stukRequest(matchId, anderhalf, { 'x-upload-id': uploadId, 'x-offset': '0' }), params(matchId))

    const res = await standVanUpload(
      new Request(`http://localhost/api/match/${matchId}/video/upload?uploadId=${uploadId}`, {
        headers: { authorization: `JWT ${token}` },
      }),
      params(matchId),
    )
    expect(res?.status).toBe(200)
    // Enkel het hele stuk telt: die halve 700 bytes gaan opnieuw.
    expect((await res!.json()).bytes).toBe(4 * 1024 * 1024)

    await fs.unlink(path.join(resolveMediaDir(), 'clips', `.deel-${uploadId}.mp4`)).catch(() => {})
  }, 60_000)

  it('laat een vreemde zonder rechten er niet aan', async () => {
    const res = await uploadStuk(
      new Request(`http://localhost/api/match/${matchId}/video/upload`, {
        method: 'POST',
        headers: { 'content-type': 'video/mp4', 'x-upload-id': 'dd44ee55ff667788', 'x-offset': '0' },
        body: new Uint8Array(Buffer.alloc(10, 1)),
        // @ts-expect-error — Node vereist dit voor een verzoek met een body-stream.
        duplex: 'half',
      }),
      params(matchId),
    )
    expect(res?.status).toBe(401)
  }, 60_000)

  it('weigert een upload-id waarmee je uit de map zou wandelen', async () => {
    const res = await standVanUpload(
      new Request(`http://localhost/api/match/${matchId}/video/upload?uploadId=${encodeURIComponent('../../etc/passwd')}`, {
        headers: { authorization: `JWT ${token}` },
      }),
      params(matchId),
    )
    expect(res?.status).toBe(400)
  }, 60_000)
})
