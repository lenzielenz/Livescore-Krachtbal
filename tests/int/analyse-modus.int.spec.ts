// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// De inlog vervangen door een dubbel (zoals de andere route-tests): een Authorization-header telt
// hier als de aangemaakte analysegebruiker.
let userId = 0
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) =>
    req.headers.get('authorization') ? { id: userId, roles: ['admin'], analyseAccess: true } : null,
}))

import config from '@/payload.config'
import { POST as maakAnalyse } from '@/app/api/analyse/match/route'

// Welke weg je kiest bij het aanmaken — manueel aantekenen of alles uit de video — moet blijven
// staan. Ook, en juist, wanneer je de wedstrijd uit de échte kalender overneemt.
//
// Dat ging mis: de kalenderweg stuurde enkel het wedstrijdnummer mee. De server viel dan terug op
// de standaard 'manueel', en daarna wees alles de gebruiker naar de aantekentafel terwijl hij net
// gekozen had om niets met de hand te doen. Deze test legt de servercontract-kant vast.

let payload: Payload
let kalenderMatchId = 0

const alsGebruiker = { headers: { authorization: 'JWT test' }, method: 'POST' as const }
const post = (body: Record<string, unknown>) =>
  maakAnalyse(
    new Request('http://localhost/api/analyse/match', {
      ...alsGebruiker,
      headers: { ...alsGebruiker.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

describe('analysemodus bij het aanmaken', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()

    const user = await payload.create({
      collection: 'users',
      data: { email: `analyse-modus-${stamp}@test.be`, password: 'analyse-test-123', name: 'Analist', analyseAccess: true },
      overrideAccess: true,
    })
    userId = Number(user.id)

    // Een échte competitiewedstrijd om uit de kalender over te nemen (geen analyse-kopie).
    const club = await payload.create({
      collection: 'clubs', data: { name: `Kalenderclub ${stamp}` }, overrideAccess: true,
    })
    const maakPloeg = async (naam: string) =>
      (await payload.create({
        collection: 'teams',
        data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
        overrideAccess: true,
      })).id as number
    const [thuis, uit] = await Promise.all([maakPloeg(`Thuis ${stamp}`), maakPloeg(`Uit ${stamp}`)])
    const m = await payload.create({
      collection: 'matches',
      data: {
        reeks: '1NAH', homeTeam: thuis, awayTeam: uit,
        date: new Date().toISOString(), status: 'scheduled', goalAreaDepth: 10,
      },
      overrideAccess: true,
    })
    kalenderMatchId = Number(m.id)
  }, 60_000)

  it('bewaart "alles uit de video" bij een wedstrijd uit de kalender', async () => {
    const res = await post({ fromMatch: kalenderMatchId, modus: 'video' })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { id: number; modus: string }
    expect(data.modus).toBe('video')

    // En het staat ook écht op de wedstrijd — daar leest het overzicht het uit om je naar de
    // juiste plek te sturen.
    const doc = await payload.findByID({ collection: 'matches', id: data.id, depth: 0, overrideAccess: true })
    expect((doc as { analyseModus?: string }).analyseModus).toBe('video')
  }, 30_000)

  it('houdt de manuele weg manueel', async () => {
    const res = await post({ fromMatch: kalenderMatchId, modus: 'manueel' })
    expect(res.status).toBe(200)
    const data = (await res.json()) as { id: number }
    const doc = await payload.findByID({ collection: 'matches', id: data.id, depth: 0, overrideAccess: true })
    expect((doc as { analyseModus?: string }).analyseModus).toBe('manueel')
  }, 30_000)

  it('neemt datum, reeks en ploegnamen over uit de kalender', async () => {
    // Dát is waarom de kalenderweg bestaat: "goed voor datum, reeks en ploegnaam".
    const res = await post({ fromMatch: kalenderMatchId, modus: 'video' })
    const data = (await res.json()) as { id: number; homeName: string; awayName: string }
    expect(data.homeName).toMatch(/^Thuis /)
    expect(data.awayName).toMatch(/^Uit /)
    const doc = await payload.findByID({ collection: 'matches', id: data.id, depth: 0, overrideAccess: true })
    expect((doc as { reeks?: string }).reeks).toBe('1NAH')
    expect((doc as { date?: string }).date).toBeTruthy()
  }, 30_000)
})
