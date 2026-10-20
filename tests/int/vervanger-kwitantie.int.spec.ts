// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

process.env.PLATFORM_OMGEVING = 'federatie-test'

import config from '@/payload.config'
import { POST as signRoute } from '@/app/api/matchsheet/[matchId]/sign/route'
import { buildKwitantieData } from '@/lib/vergoeding-data'

// De toegewezen scheidsrechter was er niet, de backup floot: zijn naam staat op het blad en hij krijgt
// de vergoeding (kwitantie), niet de afwezige.

let payload: Payload
const S = Date.now()
const PW = 'vervanger-123'

describe('vervangende scheidsrechter', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 90_000)

  it('de backup tekent af → gefloten door de backup → op zijn kwitantie', async () => {
    await payload.create({ collection: 'users', data: { email: `eerste-vv-${S}@test.be`, password: PW }, overrideAccess: true })
    const club = Number((await payload.create({ collection: 'clubs', data: { name: `VV ${S}` }, overrideAccess: true })).id)
    const t = async (n: string) => Number((await payload.create({ collection: 'teams', data: { name: `${n} ${S}`, club, category: 'senioren', reeks: 'LH' }, overrideAccess: true })).id)
    const m = await payload.create({
      collection: 'matches',
      data: { reeks: 'LH', homeTeam: await t('VV A'), awayTeam: await t('VV B'), date: new Date(Date.now() - 3 * 3600_000).toISOString(), status: 'finished', goalAreaDepth: 10 },
      overrideAccess: true,
    })
    const of = async (n: string) => Number((await payload.create({ collection: 'officials', data: { name: `${n} ${S}`, type: 'scheidsrechter' } as never, overrideAccess: true })).id)
    const toegewezen = await of('Afwezig')
    const backup = await of('Vervanger')
    await payload.create({ collection: 'matchsheets', data: { match: m.id, assignedReferee: toegewezen, backupReferee: backup, refereeKm: 25 } as never, overrideAccess: true })
    await payload.create({ collection: 'users', data: { email: `backup-${S}@test.be`, password: PW, name: `Vervanger ${S}`, roles: ['scheidsrechter'], official: backup } as never, overrideAccess: true })
    const login = await payload.login({ collection: 'users', data: { email: `backup-${S}@test.be`, password: PW } })
    const res = await signRoute(
      new Request(`http://localhost/api/matchsheet/${m.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${login.token}` },
        body: JSON.stringify({ who: 'scheidsrechter', akkoord: true, handtekening: 'data:image/png;base64,iVBORw0KGgo=' }),
      }),
      { params: Promise.resolve({ matchId: String(m.id) }) },
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { naam: string }).naam).toBe(`Vervanger ${S}`)
    const blad = (await payload.find({ collection: 'matchsheets', where: { match: { equals: m.id } }, depth: 0, overrideAccess: true })).docs[0]
    expect(blad.geflotenDoor).toBe(backup)
    expect((await buildKwitantieData(payload, backup)).regels.map((r) => r.wedstrijdnr)).toContain(String(m.id))
    expect((await buildKwitantieData(payload, toegewezen)).regels.map((r) => r.wedstrijdnr)).not.toContain(String(m.id))
  }, 90_000)
})
