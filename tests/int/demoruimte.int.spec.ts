// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { afterAll, describe, it, beforeAll, expect, vi } from 'vitest'

process.env.PLATFORM_OMGEVING = 'demo'
// Klaarzetten weigert (terecht) een databank die er niet als demo uitziet — en de gedeelde
// testdatabank zit na de andere suites vol accounts en spelers. Deze suite krijgt daarom haar eigen,
// verse SQLite-bestand, zodat ze niet afhangt van de volgorde waarin de suites lopen. In vi.hoisted:
// Vitest tilt de imports hieronder boven de rest van het bestand, en payload.config leest DATABASE_URL
// al bij het importeren.
const { gedeeldeDb, eigenDb } = await vi.hoisted(async () => {
  const { rmSync } = await import('node:fs')
  const gedeeld = process.env.DATABASE_URL
  const eigen = !/^postgres/.test(gedeeld ?? '')
  if (eigen) {
    for (const ext of ['', '-shm', '-wal', '-journal']) rmSync(`./demoruimte-int.db${ext}`, { force: true })
    process.env.DATABASE_URL = 'file:./demoruimte-int.db'
  }
  return { gedeeldeDb: gedeeld, eigenDb: eigen }
})
// Payload bewaart één instantie per proces (global._payload). Liep er in dit proces al een suite, dan
// staat die instantie op de gedeelde databank: weg ermee, zodat getPayload — ook die van de routes —
// een verse neemt op de databank hierboven.
const payloadCache = () => (globalThis as { _payload?: Map<string, unknown> })._payload

import config from '@/payload.config'
import { POST as alsRoute } from '@/app/api/demoruimte/als/route'
import { demoKlaarzetten, demoWedstrijden } from '@/lib/demoruimte/klaarzetten'

// De demoruimte: een volledige demowereld klaarzetten (via dezelfde routes als de app), rol wisselen
// zonder wachtwoord, en nooit een databank wissen die er niet als demo uitziet.

let payload: Payload

describe('demoruimte', () => {
  beforeAll(async () => {
    if (eigenDb) payloadCache()?.delete('default')
    payload = await getPayload({ config: await config })
  }, 120_000)

  afterAll(() => {
    if (!eigenDb) return
    // De volgende suites in dit proces krijgen weer een instantie op de gedeelde databank.
    payloadCache()?.delete('default')
    process.env.DATABASE_URL = gedeeldeDb
  })

  it('zet een volledige demowereld klaar, ook een tweede keer', async () => {
    const v = await demoKlaarzetten(payload)
    if (v.fout) console.log('KLAARZETTEN', v.fout, v.stappen)
    expect(v.fout).toBeUndefined()
    expect(v.ok).toBe(true)
    const ids = await demoWedstrijden(payload)
    expect(Object.values(ids).every((x) => x != null)).toBe(true)

    const live = await payload.findByID({ collection: 'matches', id: ids.live!, depth: 0, overrideAccess: true })
    expect(live.status).toBe('live')
    expect(live.currentHalf).toBe(2)
    const af = (await payload.find({ collection: 'matchsheets', where: { match: { equals: ids.afgelopen } }, overrideAccess: true })).docs[0]
    expect(af.status).toBe('af_te_tekenen')
    expect(String(af.opmerkingen)).toContain('Verzwikte enkel')
    expect((await payload.findByID({ collection: 'matches', id: ids.afgelast!, depth: 0, overrideAccess: true })).afgelast).toBe(true)
    expect((await payload.count({ collection: 'aftrap-wijzigingen', overrideAccess: true })).totalDocs).toBe(1)
    expect((await payload.count({ collection: 'boetes', where: { status: { equals: 'opgelegd' } }, overrideAccess: true })).totalDocs).toBeGreaterThanOrEqual(2)
    expect((await payload.count({ collection: 'verplaatsingsaanvragen', overrideAccess: true })).totalDocs).toBe(1)
    expect((await payload.count({ collection: 'inschrijvingen', overrideAccess: true })).totalDocs).toBe(3)
    expect((await payload.count({ collection: 'matches', where: { status: { equals: 'finished' } }, overrideAccess: true })).totalDocs).toBeGreaterThan(10)

    const opnieuw = await demoKlaarzetten(payload)
    expect(opnieuw.fout).toBeUndefined()
    expect((await payload.count({ collection: 'clubs', overrideAccess: true })).totalDocs).toBe(6)
  }, 300_000)

  it('rol wisselen geeft een sessie, zonder wachtwoord', async () => {
    const res = await alsRoute(new Request('http://localhost/api/demoruimte/als', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rol: 'scheidsrechter' }) }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/^payload-token=.+; Path=\//)
    const fout = await alsRoute(new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rol: 'admin' }) }))
    expect(fout.status).toBe(400)
  }, 60_000)

  it('wist nooit een databank die er niet als demo uitziet', async () => {
    for (let i = 0; i < 6; i++) await payload.create({ collection: 'users', data: { email: `echt${i}-${Date.now()}@club.be`, password: 'x-123456789' }, overrideAccess: true })
    const v = await demoKlaarzetten(payload)
    expect(v.ok).toBe(false)
    expect(v.fout).toMatch(/geen demodatabank/)
    expect((await payload.count({ collection: 'clubs', overrideAccess: true })).totalDocs).toBe(6)
  }, 60_000)

  it('buiten de demo-omgeving bestaat rol wisselen niet', async () => {
    process.env.PLATFORM_OMGEVING = 'federatie-test'
    const res = await alsRoute(new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rol: 'federatie' }) }))
    expect(res.status).toBe(404)
    expect((await demoKlaarzetten(payload)).ok).toBe(false)
    process.env.PLATFORM_OMGEVING = 'demo'
  })
})
