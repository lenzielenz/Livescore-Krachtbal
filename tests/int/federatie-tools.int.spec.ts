// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// Inlog als dubbel (zie clubs-koppelen.int.spec.ts): "federatie" in de header = federatie,
// "club" = een club-beheerder, niets = niet ingelogd.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_p: unknown, req: Request) => {
    const a = req.headers.get('authorization')
    if (a === 'federatie') return { id: 1, roles: ['federatie'] }
    if (a === 'club') return { id: 2, roles: ['club-beheerder'], club: 1 }
    return null
  },
}))

import config from '@/payload.config'
import { POST as clubsRoute } from '@/app/api/federatie/clubs/route'
import { POST as kalenderRoute } from '@/app/api/federatie/kalender/route'
import { POST as toewijzingenRoute } from '@/app/api/federatie/toewijzingen/route'
import { POST as verplaatsenRoute } from '@/app/api/federatie/verplaatsen/route'
import { federatieTaken } from '@/lib/federatie-dashboard'

let payload: Payload
const STAMP = Date.now()
const REEKS = 'U12B'

const req = (wie: string | null, body: unknown) =>
  new Request('http://localhost/api/federatie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(wie ? { authorization: wie } : {}) },
    body: JSON.stringify(body),
  })

describe('federatietools', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // Een lege reeks voor deze test: oude wedstrijden van een vorige run opruimen.
    await payload.delete({ collection: 'matches', where: { reeks: { equals: REEKS } }, overrideAccess: true }).catch(() => null)
    await payload.delete({ collection: 'teams', where: { reeks: { equals: REEKS } }, overrideAccess: true }).catch(() => null)
    for (const n of ['A', 'B', 'C', 'D']) {
      const club = await payload.create({ collection: 'clubs', data: { name: `Kalender ${n} ${STAMP}` }, overrideAccess: true })
      await payload.create({ collection: 'teams', data: { name: `Kalender ${n} ${STAMP}`, club: club.id, category: 'U12', reeks: REEKS }, overrideAccess: true })
    }
  }, 90_000)

  it('weigert wie geen federatie is', async () => {
    expect((await kalenderRoute(req(null, { reeks: REEKS }))).status).toBe(401)
    expect((await kalenderRoute(req('club', { reeks: REEKS }))).status).toBe(403)
    expect((await verplaatsenRoute(req('club', { wijzigingen: [] }))).status).toBe(403)
  })

  it('kalender: eerst een voorstel, dan aanmaken, en nooit dubbel', async () => {
    const start = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    const voorstel = (await (await kalenderRoute(req('federatie', { reeks: REEKS, start }))).json()) as { voorstel: unknown[] }
    expect(voorstel.voorstel.length).toBe(12)
    expect(await payload.count({ collection: 'matches', where: { reeks: { equals: REEKS } } }).then((r) => r.totalDocs)).toBe(0)

    const aan = (await (await kalenderRoute(req('federatie', { reeks: REEKS, start, bevestig: true }))).json()) as { aangemaakt: number }
    expect(aan.aangemaakt).toBe(12)
    const nogEens = (await (await kalenderRoute(req('federatie', { reeks: REEKS, start, bevestig: true }))).json()) as { aangemaakt: number }
    expect(nogEens.aangemaakt).toBe(0)
  })

  it('verplaatsen: enkel geplande wedstrijden', async () => {
    const [eerste, tweede] = (await payload.find({ collection: 'matches', where: { reeks: { equals: REEKS } }, sort: 'date', limit: 2 })).docs
    await payload.update({ collection: 'matches', id: tweede.id, data: { status: 'finished' }, overrideAccess: true })
    const nieuw = new Date(new Date(String(eerste.date)).getTime() + 86_400_000).toISOString()
    const r = (await (
      await verplaatsenRoute(req('federatie', { wijzigingen: [{ matchId: eerste.id, date: nieuw }, { matchId: tweede.id, date: nieuw }] }))
    ).json()) as { verplaatst: number; overgeslagen: { reden: string }[] }
    expect(r.verplaatst).toBe(1)
    expect(r.overgeslagen[0].reden).toBe('is al gespeeld')
    const na = await payload.findByID({ collection: 'matches', id: eerste.id })
    expect(new Date(String(na.date)).toISOString()).toBe(nieuw)
  })

  it('toewijzen en het dashboard telt mee', async () => {
    const ref = await payload.create({ collection: 'officials', data: { name: `Ref ${STAMP}`, type: 'scheidsrechter' }, overrideAccess: true })
    const m = (await payload.find({ collection: 'matches', where: { and: [{ reeks: { equals: REEKS } }, { status: { equals: 'scheduled' } }] }, sort: 'date', limit: 1 })).docs[0]
    const voor = (await federatieTaken(payload)).find((t) => t.sleutel === 'scheidsrechters')!.aantal
    const r = (await (await toewijzingenRoute(req('federatie', { toewijzingen: [{ matchId: m.id, officialId: ref.id }] }))).json()) as { gewijzigd: number }
    expect(r.gewijzigd).toBe(1)
    const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: m.id } }, limit: 1 })).docs[0]
    expect(typeof sheet.assignedReferee === 'object' ? sheet.assignedReferee?.id : sheet.assignedReferee).toBe(ref.id)
    const na = (await federatieTaken(payload)).find((t) => t.sleutel === 'scheidsrechters')!.aantal
    expect(na).toBe(voor - 1)
  })

  it('club aanmaken en een beheerder uitnodigen met een eenmalige link', async () => {
    const c = (await (await clubsRoute(req('federatie', { actie: 'club', naam: `Nieuwe club ${STAMP}` }))).json()) as { id: number }
    expect((await clubsRoute(req('federatie', { actie: 'club', naam: `Nieuwe club ${STAMP}` }))).status).toBe(409)
    const email = `beheerder-${STAMP}@test.be`
    const u = (await (await clubsRoute(req('federatie', { actie: 'uitnodigen', clubId: c.id, email, naam: 'Beheerder' }))).json()) as { link: string; nieuw: boolean }
    expect(u.nieuw).toBe(true)
    expect(u.link).toContain('/wachtwoord-herstellen')
    const user = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })).docs[0]
    expect(user.roles).toContain('club-beheerder')
    expect(typeof user.club === 'object' ? user.club?.id : user.club).toBe(c.id)

    // Een federatieaccount wordt nooit overgenomen.
    const fedMail = `fed-${STAMP}@test.be`
    await payload.create({ collection: 'users', data: { email: fedMail, password: 'federatie-test-1', roles: ['federatie'] }, overrideAccess: true })
    expect((await clubsRoute(req('federatie', { actie: 'uitnodigen', clubId: c.id, email: fedMail, naam: 'X' }))).status).toBe(409)
  })
})
