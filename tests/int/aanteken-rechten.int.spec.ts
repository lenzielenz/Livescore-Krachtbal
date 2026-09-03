// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel (payload.login ondertekent een JWT en dat lukt hier niet). De
// header bepaalt wie er belt, zodat elke rol apart getest kan worden.
let alsWie: Record<string, unknown> | null = null
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async () => alsWie,
}))

import config from '@/payload.config'
import { POST as actie } from '@/app/api/tournament/[id]/match/[matchId]/action/route'
import { createTournament } from '@/lib/tournament-engine'

// De echte poort naar het aantekenen van een tornooiwedstrijd.
//
// De knoppen en deze route moeten hetzelfde antwoord geven; staat er een knop die de server daarna
// weigert, dan is dat erger dan geen knop. Hier wordt de server getest — het gedeelde antwoord komt
// uit magTornooiAantekenen (apart getest in tests/unit/aanteken-rechten.unit.spec.ts).

let payload: Payload
const STAMP = Date.now()
const ids = { tournament: 0, match: 0 }

const roep = (body: unknown) =>
  actie(
    new Request(`http://localhost/api/tournament/${ids.tournament}/match/${ids.match}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(ids.tournament), matchId: String(ids.match) }) },
  )

describe('aantekenrechten voor tornooien', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    ids.tournament = await createTournament(payload, {
      name: `Rechtentest ${STAMP}`,
      category: 'U14',
      method: 'manual',
      format: 'roundrobin',
      slots: ['Ploeg A', 'Ploeg B'],
      groep: `Rechtentest ${STAMP}`,
    })
    const wedstrijden = await payload.find({
      collection: 'tournament-matches',
      where: { tournament: { equals: ids.tournament } },
      sort: 'id',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    ids.match = wedstrijden.docs[0].id as number
  }, 90_000)

  it('weigert wie niet ingelogd is', async () => {
    alsWie = null
    expect((await roep({ action: 'start' })).status).toBe(401)
  }, 30_000)

  it('weigert een gewone supporter — ook met de standaardrol scorekeeper', async () => {
    // Élk vers account krijgt 'scorekeeper' als defaultValue; wie dáár het recht aan hangt, geeft
    // het aan iedereen die zich registreert.
    for (const roles of [['viewer'], ['scorekeeper'], ['club-lid'], ['kapitein']]) {
      alsWie = { id: 1, roles }
      const res = await roep({ action: 'start' })
      expect(res.status).toBe(403)
    }
  }, 60_000)

  it('laat iemand met aantekenrechten wél aantekenen', async () => {
    alsWie = { id: 2, roles: ['viewer'], aantekenRechten: true }
    const res = await roep({ action: 'start' })
    expect(res.status).toBe(200)

    const na = await payload.findByID({ collection: 'tournament-matches', id: ids.match, depth: 0, overrideAccess: true })
    expect((na as { status: string }).status).toBe('live')
  }, 60_000)

  it('laat de organisatie en de scheidsrechter door zoals voorheen', async () => {
    for (const roles of [['scheidsrechter'], ['federatie'], ['admin']]) {
      alsWie = { id: 3, roles }
      const res = await roep({ action: 'clock', seconds: 60 })
      expect(res.status).toBe(200)
    }
  }, 60_000)

  it('houdt het terugzetten van een wedstrijd mét doelpunten bij de organisatie', async () => {
    // Aantekenen is niet hetzelfde als wissen: wie het aantekenrecht kreeg, mag geen ingevoerde
    // doelpunten weggooien.
    alsWie = { id: 2, roles: ['viewer'], aantekenRechten: true }
    expect((await roep({ action: 'goal', side: 'home', points: 1 })).status).toBe(200)

    const geweigerd = await roep({ action: 'reset' })
    expect(geweigerd.status).toBe(403)
    expect(((await geweigerd.json()) as { error: string }).error).toContain('organisatie')

    alsWie = { id: 3, roles: ['federatie'] }
    expect((await roep({ action: 'reset' })).status).toBe(200)
  }, 90_000)
})
