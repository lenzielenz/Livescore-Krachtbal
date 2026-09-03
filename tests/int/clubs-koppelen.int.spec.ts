// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel: `payload.login` ondertekent een JWT en dat lukt hier niet.
// Een Authorization-header telt als federatie/admin; zonder header ben je niet ingelogd, zodat de
// 401-tak écht getest blijft.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) =>
    req.headers.get('authorization') ? { id: 1, roles: ['admin'] } : null,
}))

import config from '@/payload.config'
import { POST as koppelen } from '@/app/api/clubs/koppelen/route'
import type { Reeks } from '@/lib/reeksen'

// Ploegen aan hun echte club koppelen, door de echte route en de echte database.
//
// De aanleiding: "KBC St. Michiels A-1", "KBC St. Michiels B-2" en "KBC St. Michiels" stonden als
// drie clubs in de database — één vereniging, drie lege logo's. Wat hier bewaakt wordt: dat het
// voorbeeld niets wijzigt, dat uitvoeren de ploegen verhuist, dat alles wat nog naar de lege
// club-per-ploeg wees (hier: een account) meeverhuist vóór die club verdwijnt, en dat een tweede
// keer uitvoeren niets meer doet.

let payload: Payload
const STAMP = Date.now()
const NAAM = `KBC Koppeltest ${STAMP}`
const ids = { club: 0, clubA1: 0, clubB2: 0, ploegA1: 0, ploegB2: 0, ploegB: 0, user: 0 }

const req = (opties: RequestInit = {}) => new Request('http://localhost/api/clubs/koppelen', { method: 'POST', ...opties })
const alsFederatie = (commit: boolean) =>
  req({ headers: { authorization: 'JWT test', 'Content-Type': 'application/json' }, body: JSON.stringify({ commit }) })

const club = async (naam: string) =>
  (await payload.create({ collection: 'clubs', data: { name: naam }, overrideAccess: true })).id as number
const ploeg = async (naam: string, clubId: number, reeks: Reeks) =>
  (await payload.create({ collection: 'teams', data: { name: naam, club: clubId, reeks, category: 'senioren' }, overrideAccess: true })).id as number

describe('ploegen aan hun club koppelen', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    ids.club = await club(NAAM)
    ids.clubA1 = await club(`${NAAM} A-1`)
    ids.clubB2 = await club(`${NAAM} B-2`)
    ids.ploegA1 = await ploeg(`${NAAM} A-1`, ids.clubA1, '2NAH')
    ids.ploegB2 = await ploeg(`${NAAM} B-2`, ids.clubB2, '2NAHB')
    ids.ploegB = await ploeg(`${NAAM} B`, ids.club, '1NAD')
    // Een account dat aan de club-per-ploeg hangt: dat mag niet mee verdwijnen.
    ids.user = (
      await payload.create({
        collection: 'users',
        data: { email: `koppel-${STAMP}@test.be`, password: 'koppel-test-1234', name: 'Koppel', club: ids.clubA1 },
        overrideAccess: true,
      })
    ).id as number
  }, 90_000)

  it('weigert wie niet ingelogd is', async () => {
    const res = await koppelen(req({ body: JSON.stringify({ commit: true }) }))
    expect(res.status).toBe(401)
  }, 30_000)

  it('toont in het voorbeeld wat er gaat gebeuren, zonder iets te wijzigen', async () => {
    const res = await koppelen(alsFederatie(false))
    expect(res.status).toBe(200)
    const j = (await res.json()) as { plan: { verhuizingen: { ploegId: number; naarClubId: number | null }[]; opTeRuimen: { id: number }[]; doelenZonderLogo: string[] } }
    const mijn = j.plan.verhuizingen.filter((v) => [ids.ploegA1, ids.ploegB2].includes(v.ploegId))
    expect(mijn.map((v) => v.naarClubId)).toEqual([ids.club, ids.club])
    expect(j.plan.opTeRuimen.map((c) => c.id)).toEqual(expect.arrayContaining([ids.clubA1, ids.clubB2]))
    expect(j.plan.doelenZonderLogo).toContain(NAAM)

    // Niets veranderd.
    const a1 = await payload.findByID({ collection: 'teams', id: ids.ploegA1, depth: 0, overrideAccess: true })
    expect(Number((a1 as { club: unknown }).club)).toBe(ids.clubA1)
  }, 60_000)

  it('verhuist de ploegen en het account, en ruimt de lege clubs op', async () => {
    const res = await koppelen(alsFederatie(true))
    expect(res.status).toBe(200)
    const j = (await res.json()) as { verhuisd: number; verwijderd: number; errors: string[] }
    expect(j.errors).toEqual([])
    expect(j.verhuisd).toBeGreaterThanOrEqual(2)

    for (const id of [ids.ploegA1, ids.ploegB2, ids.ploegB]) {
      const t = await payload.findByID({ collection: 'teams', id, depth: 0, overrideAccess: true })
      expect(Number((t as { club: unknown }).club)).toBe(ids.club)
    }
    const u = await payload.findByID({ collection: 'users', id: ids.user, depth: 0, overrideAccess: true })
    expect(Number((u as { club: unknown }).club)).toBe(ids.club)

    for (const id of [ids.clubA1, ids.clubB2]) {
      const weg = await payload.findByID({ collection: 'clubs', id, depth: 0, overrideAccess: true }).catch(() => null)
      expect(weg).toBeNull()
    }
  }, 90_000)

  it('doet een tweede keer niets meer', async () => {
    const res = await koppelen(alsFederatie(true))
    const j = (await res.json()) as { plan: { verhuizingen: { ploegId: number }[] }; verhuisd: number }
    expect(j.plan.verhuizingen.filter((v) => [ids.ploegA1, ids.ploegB2, ids.ploegB].includes(v.ploegId))).toEqual([])
  }, 60_000)
})
