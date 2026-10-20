// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel (payload.login ondertekent een JWT en dat lukt hier niet).
// `alsWie` bepaalt wie de beheerdersroute aanroept.
let alsWie: Record<string, unknown> | null = null
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async () => alsWie,
}))

import config from '@/payload.config'
import { POST as maakLink } from '@/app/api/admin/users/herstellink/route'
import { POST as herstel } from '@/app/api/wachtwoord-herstellen/route'

// Wachtwoord vergeten, van begin tot eind.
//
// De hele flow steunt op één ding: de token uit de herstellink. Wie die heeft, mag een nieuw
// wachtwoord zetten; wie hem niet heeft, niet. Dat is precies wat hier getest wordt — plus de
// twee dingen die deze routes bovenop Payload doen: acht tekens afdwingen en na afloop álle
// sessies intrekken.

let payload: Payload
const STAMP = Date.now()
let userId = 0
const EMAIL = `herstel-${STAMP}@krachtbal.test`

const vraagLink = (body: unknown) =>
  maakLink(
    new Request('http://localhost/api/admin/users/herstellink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const zetWachtwoord = (body: unknown) =>
  herstel(
    new Request('http://localhost/api/wachtwoord-herstellen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

/** De token uit de link vissen — dat is wat de gebruiker in de URL krijgt. */
const tokenUit = (link: string): string => new URL(link, 'http://localhost').searchParams.get('token') ?? ''

describe('wachtwoord herstellen', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const user = await payload.create({
      collection: 'users',
      data: { email: EMAIL, password: 'oud-wachtwoord-123', name: 'Herstel Test', roles: ['viewer'] },
      overrideAccess: true,
    })
    userId = user.id as number
  }, 90_000)

  it('enkel admin, federatie of de eigen clubverantwoordelijke maakt een herstellink', async () => {
    alsWie = null
    expect((await vraagLink({ userId })).status).toBe(401)

    alsWie = { id: 999_999, roles: ['viewer'] }
    expect((await vraagLink({ userId })).status).toBe(403)

    // De federatie mag het voor een gewoon account (zie de route)...
    alsWie = { id: 999_998, roles: ['federatie'] }
    expect((await vraagLink({ userId })).status).toBe(200)

    // ...maar niet voor een admin- of federatieaccount: daarmee kon ze dat account overnemen.
    const collega = await payload.create({
      collection: 'users',
      data: { email: `collega-${Date.now()}@test.be`, password: 'collega-wachtwoord-1', roles: ['federatie'] },
      overrideAccess: true,
    })
    expect((await vraagLink({ userId: collega.id })).status).toBe(403)
    alsWie = { id: 1, roles: ['admin'] }
    expect((await vraagLink({ userId: collega.id })).status).toBe(200)
  })

  it('geeft een nette fout voor een onbekend account', async () => {
    alsWie = { id: 1, roles: ['admin'] }
    expect((await vraagLink({ userId: 987_654_321 })).status).toBe(404)
    expect((await vraagLink({ userId: 'geen getal' })).status).toBe(400)
  })

  it('maakt een link waarmee de gebruiker zelf een nieuw wachtwoord zet', async () => {
    alsWie = { id: 1, roles: ['admin'] }
    const res = await vraagLink({ userId })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { link: string; email: string; vervalt: string }
    expect(data.email).toBe(EMAIL)
    expect(data.link).toContain('/wachtwoord-herstellen?token=')
    // Een dag geldig — lang genoeg om 's avonds door te sturen en 's ochtends te gebruiken.
    const uren = (new Date(data.vervalt).getTime() - Date.now()) / 3_600_000
    expect(uren).toBeGreaterThan(23)
    expect(uren).toBeLessThan(25)

    const token = tokenUit(data.link)
    expect(token).toMatch(/^[a-f0-9]{20,}$/i)

    // Te kort wachtwoord: geweigerd (Payload zelf zou drie tekens aanvaarden).
    const kort = await zetWachtwoord({ token, password: 'kort' })
    expect(kort.status).toBe(400)
    expect((await kort.json()).error).toContain('8 tekens')

    // En dan het echte werk.
    const ok = await zetWachtwoord({ token, password: 'splinternieuw-2026' })
    expect(ok.status).toBe(200)

    // Het wachtwoord is echt gewijzigd: inloggen lukt met het nieuwe, niet met het oude.
    await expect(
      payload.login({ collection: 'users', data: { email: EMAIL, password: 'splinternieuw-2026' } }),
    ).resolves.toBeTruthy()
    await expect(
      payload.login({ collection: 'users', data: { email: EMAIL, password: 'oud-wachtwoord-123' } }),
    ).rejects.toThrow()
  })

  it('laat dezelfde link geen tweede keer werken', async () => {
    // De token uit de vorige test is verbruikt; een tweede poging hoort af te ketsen. Dat is
    // wat "werkt één keer" op het scherm belooft.
    alsWie = { id: 1, roles: ['admin'] }
    const data = (await (await vraagLink({ userId })).json()) as { link: string }
    const token = tokenUit(data.link)

    expect((await zetWachtwoord({ token, password: 'weer-iets-anders-1' })).status).toBe(200)
    const tweede = await zetWachtwoord({ token, password: 'nog-iets-anders-22' })
    expect(tweede.status).toBe(403)
    expect((await tweede.json()).error).toContain('verlopen of al gebruikt')
  })

  it('trekt de sessies in zodat een meelezer eruit vliegt', async () => {
    // Wie zijn wachtwoord kwijt is, kan het kwijt zijn omdat een ander erbij kon. Payload's
    // resetPassword laat bestaande sessies gewoon doorlopen; deze route niet.
    await payload.update({
      collection: 'users',
      id: userId,
      data: { sessions: [{ id: 'oude-sessie', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() }] },
      overrideAccess: true,
    })

    alsWie = { id: 1, roles: ['admin'] }
    const data = (await (await vraagLink({ userId })).json()) as { link: string }
    expect((await zetWachtwoord({ token: tokenUit(data.link), password: 'schoon-begin-2026' })).status).toBe(200)

    const na = await payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
    expect((na as { sessions?: unknown[] }).sessions ?? []).toHaveLength(0)
  })

  it('weigert een verzonnen of vormloze token', async () => {
    expect((await zetWachtwoord({ token: 'geen-token', password: 'lang-genoeg-123' })).status).toBe(400)
    expect((await zetWachtwoord({ password: 'lang-genoeg-123' })).status).toBe(400)
    // Vormelijk juist maar onbekend: dat mag geen ander antwoord geven dan "verlopen of gebruikt",
    // anders verklapt de route welke tokens bestaan.
    const verzonnen = await zetWachtwoord({ token: 'a'.repeat(40), password: 'lang-genoeg-123' })
    expect(verzonnen.status).toBe(403)
  })
})
