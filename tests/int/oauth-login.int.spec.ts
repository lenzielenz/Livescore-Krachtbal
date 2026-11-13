// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-geheim'
  process.env.PUBLIC_SERVER_URL = 'http://localhost:3000'
  return { identiteit: null as null | Record<string, unknown> }
})

// Het gesprek met Google zelf (code inruilen, token controleren) vervangen door een dubbel: de rest —
// state, cookie, account vinden of maken, sessie — loopt echt.
vi.mock('@/lib/oauth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  afronden: async () => {
    if (!env.identiteit) throw new Error('De aanmelding bij Google lukte niet.')
    return env.identiteit
  },
}))

import config from '@/payload.config'
import { GET as start } from '@/app/api/auth/oauth/[dienst]/route'
import { GET as terug } from '@/app/api/auth/oauth/[dienst]/callback/route'
import { vindOfMaakGebruiker, sessieVoor } from '@/lib/oauth-login'

let payload: Payload
const S = Date.now()
const ctx = (dienst: string) => ({ params: Promise.resolve({ dienst }) })

describe('inloggen met Google, Microsoft, Apple', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.create({ collection: 'users', data: { email: `eerste-oauth-${S}@test.be`, password: 'oauth-test-12345' }, overrideAccess: true })
  }, 120_000)

  it('nieuw: een account met de gewone rol; tweede keer hetzelfde account', async () => {
    const i = { dienst: 'google' as const, sub: `g-${S}`, email: `nieuw-${S}@gmail.com`, emailGeverifieerd: true, naam: 'Nina Nieuw' }
    const a = await vindOfMaakGebruiker(payload, i)
    expect(a.ok && a.nieuw).toBe(true)
    const id = (a as { userId: number }).userId
    const u = await payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
    expect([u.roles, u.name, u.oauthIdentiteiten?.[0]?.sleutel]).toEqual([['viewer'], 'Nina Nieuw', `google:g-${S}`])
    // Ook als het adres bij Google later verandert: de koppeling volgt het vaste id.
    const b = await vindOfMaakGebruiker(payload, { ...i, email: `ander-${S}@gmail.com` })
    expect(b).toMatchObject({ ok: true, userId: id, nieuw: false })
  }, 60_000)

  it('bestaand account met hetzelfde bevestigde adres: koppelen, niet dupliceren — rollen blijven', async () => {
    const bestaand = await payload.create({
      collection: 'users',
      data: { email: `staf-${S}@club.be`, password: 'oauth-test-12345', roles: ['club-beheerder'] } as never,
      overrideAccess: true,
    })
    const r = await vindOfMaakGebruiker(payload, { dienst: 'microsoft', sub: `m-${S}`, email: `Staf-${S}@club.be`.toLowerCase(), emailGeverifieerd: true, naam: null })
    expect(r).toMatchObject({ ok: true, userId: Number(bestaand.id), nieuw: false })
    const u = await payload.findByID({ collection: 'users', id: bestaand.id, depth: 0, overrideAccess: true })
    expect([u.roles, u.oauthIdentiteiten?.map((x) => x.dienst)]).toEqual([['club-beheerder'], ['microsoft']])
  }, 60_000)

  it('onbevestigd adres: niets koppelen of maken (geen overname van andermans account)', async () => {
    await payload.create({ collection: 'users', data: { email: `fed-${S}@federatie.be`, password: 'oauth-test-12345', roles: ['federatie'] } as never, overrideAccess: true })
    const r = await vindOfMaakGebruiker(payload, { dienst: 'microsoft', sub: `kwaad-${S}`, email: `fed-${S}@federatie.be`, emailGeverifieerd: false, naam: null })
    expect(r).toMatchObject({ ok: false, status: 403 })
    const n = await payload.count({ collection: 'users', where: { 'oauthIdentiteiten.sleutel': { equals: `microsoft:kwaad-${S}` } }, overrideAccess: true })
    expect(n.totalDocs).toBe(0)
  }, 60_000)

  it('de sessie is een echte Payload-sessie: de cookie logt in, en staat in de databank', async () => {
    const a = await vindOfMaakGebruiker(payload, { dienst: 'apple', sub: `a-${S}`, email: `appel-${S}@icloud.com`, emailGeverifieerd: true, naam: null })
    const id = (a as { userId: number }).userId
    const cookie = await sessieVoor(payload, id)
    expect(cookie).toMatch(/^payload-token=/)
    expect(cookie).toContain('HttpOnly')
    // Zoals een browser op onze eigen site: met Origin (de CSRF-lijst van Payload) of Sec-Fetch-Site same-origin.
    const alsBrowser = (c: string) => new Headers({ cookie: c.split(';')[0]!, origin: 'http://localhost:3000' })
    const { user } = await payload.auth({ headers: alsBrowser(cookie) })
    expect(Number(user?.id)).toBe(id)
    const navigatie = await payload.auth({ headers: new Headers({ cookie: cookie.split(';')[0]!, 'sec-fetch-site': 'same-origin' }) })
    expect(Number(navigatie.user?.id)).toBe(id)
    const u = await payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, showHiddenFields: true })
    expect((u as { sessions?: unknown[] }).sessions?.length).toBe(1)
  }, 60_000)

  it('de routes: start zet state en cookie; terugkeer zonder geldige state weigert; met state logt in en stuurt door', async () => {
    const s = await start(new Request('http://localhost:3000/api/auth/oauth/google?next=/club/leden'), ctx('google'))
    expect(s.status).toBe(303)
    const naar = new URL(s.headers.get('location')!)
    expect(naar.hostname).toBe('accounts.google.com')
    const zet = s.headers.get('set-cookie')!
    expect(zet).toMatch(/^kb-oauth-google=.+HttpOnly; Secure; SameSite=Lax/)
    const cookie = zet.split(';')[0]!
    const state = naar.searchParams.get('state')!

    // Onbekende of uitgeschakelde dienst.
    expect(new URL((await start(new Request('http://localhost:3000/api/auth/oauth/apple'), ctx('apple'))).headers.get('location')!).pathname).toBe('/inloggen')

    const cb = (qs: string, c = cookie) => terug(new Request(`http://localhost:3000/api/auth/oauth/google/callback?${qs}`, { headers: c ? { cookie: c } : {} }), ctx('google'))
    env.identiteit = { dienst: 'google', sub: `route-${S}`, email: `route-${S}@gmail.com`, emailGeverifieerd: true, naam: 'Rik Route' }
    for (const [qs, c] of [[`code=x&state=fout`, cookie], [`code=x&state=${state}`, ''], [`state=${state}`, cookie]] as const) {
      const r = await cb(qs, c)
      expect(new URL(r.headers.get('location')!).pathname, qs).toBe('/inloggen')
    }
    expect(new URL((await cb('error=access_denied')).headers.get('location')!).searchParams.get('fout')).toBe('Aanmelden geannuleerd.')

    const ok = await cb(`code=x&state=${state}`)
    // Een korte pagina op ons domein die doorstuurt (zie de route: anders is de eerste navigatie cross-site).
    expect([ok.status, ok.headers.get('content-type')]).toEqual([200, 'text/html; charset=utf-8'])
    const html = await ok.text()
    expect(html).toContain('location.replace("/club/leden")')
    expect(html).toContain('url=/club/leden')
    const cookies = ok.headers.getSetCookie()
    const sessie = cookies.find((c) => c.startsWith('payload-token='))!
    expect(cookies.some((c) => c.startsWith('kb-oauth-google=;'))).toBe(true)
    const { user } = await payload.auth({ headers: new Headers({ cookie: sessie.split(';')[0]!, origin: 'http://localhost:3000' }) })
    expect(user?.email).toBe(`route-${S}@gmail.com`)

    // Mislukt de aanmelding bij Google, dan terug naar de inlogpagina met een leesbare fout.
    env.identiteit = null
    const mis = await cb(`code=x&state=${state}`)
    expect(new URL(mis.headers.get('location')!).searchParams.get('fout')).toBe('De aanmelding bij Google lukte niet.')
  }, 60_000)
})
