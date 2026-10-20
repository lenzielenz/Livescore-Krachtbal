// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// Inlog als dubbel: de Authorization-header bevat de gebruiker als JSON.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_p: unknown, req: Request) => {
    const a = req.headers.get('authorization')
    return a ? JSON.parse(a) : null
  },
}))

import config from '@/payload.config'
import { POST as teamRoute } from '@/app/api/club/team/route'
import { GET as lineupGet, POST as lineupPost } from '@/app/api/matchsheet/[matchId]/lineup/route'
import { deelnameVanSpeler } from '@/lib/speler-deelname'

let payload: Payload
const STAMP = Date.now()
const ids = { club: 0, ander: 0, senioren: 0, jeugd: 0, tegen: 0, coach: 0, beheerder: 0, match: 0, spelers: [] as number[] }

const post = (wie: unknown, body: unknown) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: JSON.stringify(wie) }, body: JSON.stringify(body) })
const get = (wie: unknown, side: string) => new Request(`http://localhost/x?side=${side}`, { headers: { authorization: JSON.stringify(wie) } })
const params = () => ({ params: Promise.resolve({ matchId: String(ids.match) }) })

describe('clubfuncties en wedstrijdselectie', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    ids.club = Number((await payload.create({ collection: 'clubs', data: { name: `Functies ${STAMP}` }, overrideAccess: true })).id)
    ids.ander = Number((await payload.create({ collection: 'clubs', data: { name: `Functies ander ${STAMP}` }, overrideAccess: true })).id)
    const ploeg = async (n: string, club: number, category: 'senioren' | 'U14', reeks: string) =>
      Number((await payload.create({ collection: 'teams', data: { name: `${n} ${STAMP}`, club, category, reeks: reeks as never }, overrideAccess: true })).id)
    ids.senioren = await ploeg('Senioren', ids.club, 'senioren', 'LH')
    ids.jeugd = await ploeg('U14', ids.club, 'U14', 'U14J')
    ids.tegen = await ploeg('Tegenstander', ids.ander, 'senioren', 'LH')
    for (const n of [1, 2, 3, 4, 5]) {
      ids.spelers.push(
        Number(
          (
            await payload.create({
              collection: 'players',
              data: { name: `Speler ${n}`, team: ids.senioren, shirtNumber: n, vergunningsstatus: 'geldig', medischAttest: true, birthDate: '1998-01-01' },
              overrideAccess: true,
            })
          ).id,
        ),
      )
    }
    const user = async (email: string, roles: string[]) =>
      Number((await payload.create({ collection: 'users', data: { email, password: 'functies-test-1', roles: roles as never, club: ids.club }, overrideAccess: true })).id)
    ids.beheerder = await user(`beheerder-${STAMP}@test.be`, ['club-beheerder'])
    ids.coach = await user(`coach-${STAMP}@test.be`, ['club-lid'])
    ids.match = Number(
      (
        await payload.create({
          collection: 'matches',
          data: { homeTeam: ids.senioren, awayTeam: ids.tegen, date: new Date(Date.now() + 86_400_000).toISOString(), status: 'scheduled', goalAreaDepth: 10, reeks: 'LH' },
          overrideAccess: true,
        })
      ).id,
    )
  }, 90_000)

  const beheerder = () => ({ id: ids.beheerder, roles: ['club-beheerder'], club: ids.club })
  const coachZonderFunctie = () => ({ id: ids.coach, roles: ['club-lid'], club: ids.club })

  it('een club-lid zonder functie zet geen opstelling', async () => {
    expect((await lineupGet(get(coachZonderFunctie(), 'home'), params())).status).toBe(403)
  })

  it('de beheerder maakt iemand coach van een ploeg; enkel ploegen van de eigen club', async () => {
    const fout = await teamRoute(post(beheerder(), { userId: ids.coach, clubFuncties: ['coach'], functieTeams: [ids.tegen] }))
    expect(fout.status).toBe(403)
    const ok = await teamRoute(post(beheerder(), { userId: ids.coach, clubFuncties: ['coach', 'speler'], functieTeams: [ids.senioren] }))
    expect(ok.status).toBe(200)
    const u = await payload.findByID({ collection: 'users', id: ids.coach, overrideAccess: true })
    expect(u.clubFuncties).toEqual(['coach', 'speler'])
  })

  it('de coach zet de opstelling van zijn ploeg, niet die van de tegenstander', async () => {
    const coach = await payload.findByID({ collection: 'users', id: ids.coach, depth: 0, overrideAccess: true })
    expect((await lineupGet(get(coach, 'home'), params())).status).toBe(200)
    expect((await lineupGet(get(coach, 'away'), params())).status).toBe(403)
    const r = await lineupPost(post(coach, { side: 'home', players: ids.spelers.slice(0, 4).map((p, i) => ({ player: p, rugnummer: i + 1 })) }), params())
    expect(r.status).toBe(200)
  })

  it('⭐ favoriet staat bovenaan de selectielijst', async () => {
    const coach = await payload.findByID({ collection: 'users', id: ids.coach, depth: 0, overrideAccess: true })
    const laatste = ids.spelers[4]
    const r = await lineupPost(post(coach, { side: 'home', favoriet: { player: laatste, aan: true } }), params())
    expect(r.status).toBe(200)
    const lijst = (await (await lineupGet(get(coach, 'home'), params())).json()) as { players: { id: number }[] }
    expect(lijst.players[0].id).toBe(laatste)
    // Een speler van een andere ploeg wordt geen favoriet.
    expect((await lineupPost(post(coach, { side: 'home', favoriet: { player: 999999, aan: true } }), params())).status).toBe(400)
  })

  it('deelname: geselecteerd en (na bevestiging) gespeeld per speler', async () => {
    const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: ids.match } }, limit: 1, overrideAccess: true })).docs[0]
    const rows = (sheet.homeLineup ?? []).map((r) => ({ ...r, deelgenomen: (typeof r.player === 'object' ? r.player.id : r.player) === ids.spelers[0] }))
    await payload.update({ collection: 'matchsheets', id: sheet.id, data: { homeLineup: rows }, overrideAccess: true })
    const d0 = await deelnameVanSpeler(payload, ids.spelers[0])
    const d1 = await deelnameVanSpeler(payload, ids.spelers[1])
    expect(d0).toMatchObject({ geselecteerd: 1, gespeeld: 1 })
    expect(d1).toMatchObject({ geselecteerd: 1, gespeeld: 0 })
  })
})
