import { beforeEach, describe, expect, it, vi } from 'vitest'

// Video-analyse uit de krachtbal-analyse-app in de EIGEN analyse-omgeving.
//
// Aanleiding: "de analyse moet hier staan" — de voorstellen van een video-analyse hoorden op de
// analysewedstrijd van wie ze maakte (Clubhuis → Analyse), niet op de officiële kalenderwedstrijd,
// en de eigenaar moet ze daar ook kunnen nakijken (tot nu toe enkel federatie).

type Doc = Record<string, unknown>

function nepPayload(opties: { user?: Doc | null; matches?: Record<number, Doc>; events?: Doc[] }) {
  const matches = opties.matches ?? {}
  let events = opties.events ?? []
  const updates: { id: number; data: Doc }[] = []
  const payload = {
    auth: async () => ({ user: opties.user ?? null }),
    findByID: async ({ collection, id }: { collection: string; id: number }) => {
      if (collection === 'matches' && matches[id]) return matches[id]
      if (collection === 'cv-events') {
        const e = events.find((x) => x.id === id)
        if (e) return e
      }
      throw new Error('niet gevonden')
    },
    delete: async ({ where }: { where: { and: Doc[] } }) => {
      const matchId = (where.and[0].match as { equals: number }).equals
      const model = where.and.find((w) => 'provenance.model' in w)?.['provenance.model'] as { equals: string } | undefined
      const weg = events.filter(
        (e) => e.match === matchId && e.reviewed !== true && (!model || (e.provenance as Doc)?.model === model.equals),
      )
      events = events.filter((e) => !weg.includes(e))
      return { docs: weg, errors: [] }
    },
    update: async ({ id, data }: { id: number; data: Doc }) => {
      updates.push({ id, data })
      return { id, ...data }
    },
  }
  return { payload, updates, events: () => events }
}

let huidige: ReturnType<typeof nepPayload>['payload']
vi.mock('@/lib/payload-client', () => ({ getPayloadClient: async () => huidige }))

const { cvAuthorizedForMatch } = await import('@/app/api/cv/cv-auth')
const { POST: vervang } = await import('@/app/api/cv/match/[id]/vervang/route')

const eigenaar = { id: 7, roles: [] }
const vreemde = { id: 8, roles: [] }
const MATCHES = {
  1: { id: 1, analyseOnly: true, analyseOwner: 7, cvFysiek: { spelers: [{}] } },
  2: { id: 2, analyseOnly: false, cvFysiek: null },
}
const req = (body?: unknown, kop: Record<string, string> = {}) =>
  new Request('http://x/api', { method: 'POST', headers: kop, body: body == null ? undefined : JSON.stringify(body) })

beforeEach(() => {
  delete process.env.CV_BRIDGE_TOKEN
})

describe('cvAuthorizedForMatch', () => {
  it('laat de eigenaar toe op zijn eigen analyse-opname', async () => {
    const { payload } = nepPayload({ user: eigenaar, matches: MATCHES })
    expect(await cvAuthorizedForMatch(payload as never, req(), 1)).toBe(true)
  })

  it('weigert de eigenaar op een officiële wedstrijd en een vreemde op de opname', async () => {
    expect(await cvAuthorizedForMatch(nepPayload({ user: eigenaar, matches: MATCHES }).payload as never, req(), 2)).toBe(false)
    expect(await cvAuthorizedForMatch(nepPayload({ user: vreemde, matches: MATCHES }).payload as never, req(), 1)).toBe(false)
    expect(await cvAuthorizedForMatch(nepPayload({ user: null, matches: MATCHES }).payload as never, req(), 1)).toBe(false)
  })

  it('laat de pipeline-sleutel en de federatie overal toe', async () => {
    process.env.CV_BRIDGE_TOKEN = 'geheim'
    const zonder = nepPayload({ user: null, matches: MATCHES }).payload
    expect(await cvAuthorizedForMatch(zonder as never, req(undefined, { authorization: 'Bearer geheim' }), 2)).toBe(true)
    const fed = nepPayload({ user: { id: 1, roles: ['federatie'] }, matches: MATCHES }).payload
    expect(await cvAuthorizedForMatch(fed as never, req(), 2)).toBe(true)
  })
})

describe('POST /api/cv/match/[id]/vervang', () => {
  const EVENTS = [
    { id: 11, match: 1, reviewed: false, provenance: { model: 'krachtbal-analyse' } },
    { id: 12, match: 1, reviewed: true, provenance: { model: 'krachtbal-analyse' } },
    { id: 13, match: 1, reviewed: false, provenance: { model: 'ander' } },
    { id: 14, match: 2, reviewed: false, provenance: { model: 'krachtbal-analyse' } },
  ]
  const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })

  it('haalt enkel de open voorstellen van dat model weg, nagekeken voorstellen blijven', async () => {
    const nep = nepPayload({ user: eigenaar, matches: MATCHES, events: EVENTS.map((e) => ({ ...e })) })
    huidige = nep.payload
    const r = await vervang(req({ model: 'krachtbal-analyse', fysiek: true }), params(1))
    expect(await r.json()).toEqual({ verwijderd: 1, fysiekWeg: true })
    expect(nep.events().map((e) => e.id)).toEqual([12, 13, 14])
    expect(nep.updates).toEqual([{ id: 1, data: { cvFysiek: null } }])
  })

  it('zonder model gaan alle open voorstellen van die wedstrijd weg', async () => {
    const nep = nepPayload({ user: eigenaar, matches: MATCHES, events: EVENTS.map((e) => ({ ...e })) })
    huidige = nep.payload
    const r = await vervang(req(), params(1))
    expect((await r.json()).verwijderd).toBe(2)
    expect(nep.events().map((e) => e.id)).toEqual([12, 14])
    expect(nep.updates).toEqual([])
  })

  it('weigert de eigenaar op een officiële wedstrijd', async () => {
    const nep = nepPayload({ user: eigenaar, matches: MATCHES, events: EVENTS.map((e) => ({ ...e })) })
    huidige = nep.payload
    const r = await vervang(req({ model: 'krachtbal-analyse' }), params(2))
    expect(r.status).toBe(401)
    expect(nep.events()).toHaveLength(4)
  })
})
