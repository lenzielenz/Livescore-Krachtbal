// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Inloggen vervangen door een dubbel (zoals clubs-koppelen): een header "JWT fed" = federatie,
// "JWT club" = een clubbeheerder, geen header = niet ingelogd.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) => {
    const h = req.headers.get('authorization')
    return h === 'JWT fed' ? { id: 1, roles: ['federatie'] } : h === 'JWT club' ? { id: 2, roles: ['club-beheerder'], club: 1 } : null
  },
}))

import config from '@/payload.config'
import { GET as ledenRoute } from '@/app/api/federatie/leden/route'
import { keuringStand, type KeuringStand, toonVan, type Toon } from '@/lib/leden-register'
import { ledenTellingen, ledenZoeken } from '@/lib/leden-register-server'
import { buildRoster } from '@/lib/matchsheet-data'
import { dagelijkseTermijnen } from '@/lib/termijnen'

// Het ledenregister moet bij duizenden leden op de server filteren. Dat kan enkel als het
// databankfilter (ledenWhere) voor élk lid hetzelfde zegt als de indeling in JavaScript (toonVan,
// keuringStand) — ook bij lege velden van oudere leden (soortLid, actief, keuringsdatum leeg). Deze
// suite zet leden in elke mogelijke toestand neer en vergelijkt beide, filter per filter.

let payload: Payload
const S = Date.now()
const DAG = 86_400_000
const nu = new Date()
const ids = { clubA: 0, clubB: 0, ploegA: 0, ploegB: 0, staf: 0, match: 0 }
const leden: { id: number; data: Record<string, unknown> }[] = []
let vorigBeleid: unknown = 'waarschuwen'

const geleden = (d: number) => new Date(nu.getTime() - d * DAG).toISOString()
const VARIANTEN: Record<string, unknown>[] = [
  { vergunningsstatus: 'geldig', medischAttest: true, medischeKeuringOp: geleden(10) },
  { vergunningsstatus: 'geldig', medischAttest: true, medischeKeuringOp: geleden(345) },
  { vergunningsstatus: 'geldig', medischAttest: true, medischeKeuringOp: geleden(400) },
  { vergunningsstatus: 'geldig', medischAttest: true },
  { vergunningsstatus: 'geldig', medischAttest: true, soortLid: 'speler', actief: true, medischeKeuringOp: geleden(100) },
  { registratieStatus: 'ingediend', vergunningsstatus: 'aangevraagd', medischeKeuringOp: geleden(5) },
  { registratieStatus: 'afgekeurd', vergunningsstatus: 'geen', medischeKeuringOp: geleden(5) },
  { registratieStatus: 'concept' },
  { registratieStatus: 'goedgekeurd', vergunningsstatus: 'geldig', medischAttest: false, medischeKeuringOp: geleden(20) },
  { soortLid: 'lid' },
  { soortLid: 'lid', vergunningsstatus: 'geldig', medischAttest: true, medischeKeuringOp: geleden(600) },
  { actief: false, vergunningsstatus: 'geldig', medischAttest: true, medischeKeuringOp: geleden(600) },
]

const req = (wie: 'fed' | 'club' | null, qs = '') =>
  new Request(`http://localhost/api/federatie/leden?${qs}`, { headers: wie ? { authorization: `JWT ${wie}` } : {} })

describe('ledenregister: databankfilter = indeling, op schaal', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // In een verse databank wordt de eerste gebruiker admin: die plek niet aan de clubbeheerder geven.
    await payload.create({ collection: 'users', data: { email: `eerste-reg-${S}@test.be`, password: 'register-test-123' }, overrideAccess: true })
    const club = async (n: string) => Number((await payload.create({ collection: 'clubs', data: { name: `${n} ${S}` }, overrideAccess: true })).id)
    ids.clubA = await club('Register A')
    ids.clubB = await club('Register B')
    const ploeg = async (n: string, c: number) => Number((await payload.create({ collection: 'teams', data: { name: `${n} ${S}`, club: c, category: 'senioren', reeks: 'LH' } as never, overrideAccess: true })).id)
    ids.ploegA = await ploeg('Reg A', ids.clubA)
    ids.ploegB = await ploeg('Reg B', ids.clubB)
    // Elke variant in beide clubs; bij de helft blijft players.club leeg (oudere leden): de club komt via de ploeg.
    for (const [i, v] of VARIANTEN.entries()) {
      for (const [ploeg, c] of [[ids.ploegA, ids.clubA], [ids.ploegB, ids.clubB]] as const) {
        const data = { name: `Lid v${i}x${ploeg === ids.ploegA ? 'a' : 'b'} ${S}`, team: ploeg, shirtNumber: i + 1, birthDate: '1990-05-05', ...v }
        const doc = await payload.create({ collection: 'players', data: data as never, overrideAccess: true })
        if (i % 2) await payload.db.updateOne({ collection: 'players', id: doc.id, data: { club: null } }).catch(() => null)
        else void c
        leden.push({ id: Number(doc.id), data: { ...data, ploeg } })
      }
    }
    ids.staf = Number(
      (await payload.create({ collection: 'users', data: { email: `staf-reg-${S}@test.be`, password: 'register-test-123', roles: ['club-beheerder'], club: ids.clubA } as never, overrideAccess: true })).id,
    )
    const s = (await payload.findGlobal({ slug: 'settings', depth: 0 })) as { keuringVerlopen?: unknown }
    vorigBeleid = s.keuringVerlopen ?? 'waarschuwen'
  }, 180_000)

  afterAll(async () => {
    await payload.updateGlobal({ slug: 'settings', data: { keuringVerlopen: vorigBeleid } as never }).catch(() => null)
  })

  const verwacht = (club: number, pred: (d: Record<string, unknown>) => boolean) =>
    leden.filter((l) => l.data.ploeg === (club === ids.clubA ? ids.ploegA : ids.ploegB) && pred(l.data)).map((l) => l.id).sort((a, b) => a - b)
  const gevonden = async (f: Parameters<typeof ledenZoeken>[1]) =>
    (await ledenZoeken(payload, f, { perPagina: 500 })).rijen.map((r) => r.id).sort((a, b) => a - b)

  it('elke toestand: de databank vindt exact wie de indeling zo noemt', async () => {
    for (const toon of ['ok', 'wacht', 'todo', 'fout', 'lid', 'inactief'] as Toon[]) {
      for (const club of [ids.clubA, ids.clubB]) {
        expect(await gevonden({ club, toon }), `${toon} in club ${club}`).toEqual(verwacht(club, (d) => toonVan(d) === toon))
      }
    }
  }, 120_000)

  it('elke keuringsstand idem — ook "geen datum" en de grens van 30 dagen', async () => {
    for (const keuring of ['geldig', 'verloopt', 'verlopen', 'onbekend'] as Exclude<KeuringStand, 'nvt'>[]) {
      expect(await gevonden({ club: ids.clubA, keuring }), keuring).toEqual(verwacht(ids.clubA, (d) => keuringStand(d, nu) === keuring))
    }
  }, 60_000)

  it('club via de ploeg, zoeken op naam, en bladeren', async () => {
    expect(await gevonden({ club: ids.clubB })).toEqual(verwacht(ids.clubB, () => true))
    expect(await gevonden({ zoek: 'v3xa' })).toEqual(verwacht(ids.clubA, (d) => String(d.name).includes('v3xa')))
    const p1 = await ledenZoeken(payload, { club: ids.clubA }, { perPagina: 5, pagina: 1 })
    const p3 = await ledenZoeken(payload, { club: ids.clubA }, { perPagina: 5, pagina: 3 })
    expect([p1.totaal, p1.paginas, p1.rijen.length, p3.rijen.length]).toEqual([VARIANTEN.length, 3, 5, 2])
    expect(p1.rijen[0]?.club).toBe(`Register A ${S}`)
  }, 60_000)

  it('tellingen per club in één ronde, met de staf en zonder alles te laden', async () => {
    const { clubs } = await ledenTellingen(payload, nu)
    const a = clubs.find((c) => c.clubId === ids.clubA)!
    const tel = (pred: (d: Record<string, unknown>) => boolean) => verwacht(ids.clubA, pred).length
    expect([a.totaal, a.ok, a.wacht, a.todo, a.fout, a.lid, a.inactief]).toEqual([
      VARIANTEN.length,
      tel((d) => toonVan(d) === 'ok'),
      tel((d) => toonVan(d) === 'wacht'),
      tel((d) => toonVan(d) === 'todo'),
      tel((d) => toonVan(d) === 'fout'),
      tel((d) => toonVan(d) === 'lid'),
      tel((d) => toonVan(d) === 'inactief'),
    ])
    expect([a.verloopt, a.verlopen, a.onbekend]).toEqual([
      tel((d) => keuringStand(d, nu) === 'verloopt'),
      tel((d) => keuringStand(d, nu) === 'verlopen'),
      tel((d) => keuringStand(d, nu) === 'onbekend'),
    ])
    expect(a.staf.map((s) => s.rol)).toEqual(['clubbeheerder'])
  }, 60_000)

  it('de API: enkel de federatie, met paginering en CSV', async () => {
    expect((await ledenRoute(req(null))).status).toBe(401)
    expect((await ledenRoute(req('club'))).status).toBe(403)
    const r = (await (await ledenRoute(req('fed', `club=${ids.clubA}&toon=ok&per=2`))).json()) as { totaal: number; rijen: unknown[] }
    expect([r.totaal, r.rijen.length]).toEqual([verwacht(ids.clubA, (d) => toonVan(d) === 'ok').length, 2])
    const csv = await ledenRoute(req('fed', `club=${ids.clubA}&formaat=csv`))
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const lijnen = (await csv.text()).split('\r\n')
    expect(lijnen.length).toBe(VARIANTEN.length + 1)
    expect(lijnen[0]).toContain('Vergunningsnummer')
  }, 60_000)

  it('herinnering: één wekelijkse lijst per club, niet elke dag opnieuw', async () => {
    const titel = 'medische keuring'
    const tel = async () =>
      (await payload.find({ collection: 'meldingen', where: { and: [{ user: { equals: ids.staf } }, { titel: { like: titel } }] }, depth: 0, overrideAccess: true })).totalDocs
    await dagelijkseTermijnen(payload, nu)
    await dagelijkseTermijnen(payload, nu)
    expect(await tel()).toBe(1)
    const m = (await payload.find({ collection: 'meldingen', where: { and: [{ user: { equals: ids.staf } }, { titel: { like: titel } }] }, depth: 0, overrideAccess: true })).docs[0]!
    expect(String(m.tekst)).toContain('verlopen')
    await dagelijkseTermijnen(payload, new Date(nu.getTime() + 7 * DAG))
    expect(await tel()).toBe(2)
  }, 120_000)

  it('opstelling: een verlopen keuring waarschuwt, en blokkeert pas als de federatie dat kiest', async () => {
    const tegen = Number((await payload.create({ collection: 'teams', data: { name: `Reg tegen ${S}`, club: ids.clubB, category: 'senioren', reeks: 'LH' } as never, overrideAccess: true })).id)
    ids.match = Number((await payload.create({ collection: 'matches', data: { homeTeam: ids.ploegA, awayTeam: tegen, reeks: 'LH', date: new Date(nu.getTime() + DAG).toISOString(), status: 'scheduled', goalAreaDepth: 10 } as never, overrideAccess: true })).id)
    const verlopen = leden.find((l) => l.data.ploeg === ids.ploegA && keuringStand(l.data, nu) === 'verlopen' && toonVan(l.data) === 'ok')!
    const niveau = async () => (await buildRoster(payload, ids.match, 'home'))!.players.find((p) => p.id === verlopen.id)!.selectability
    await payload.updateGlobal({ slug: 'settings', data: { keuringVerlopen: 'waarschuwen' } as never })
    expect((await niveau()).level).toBe('warn')
    await payload.updateGlobal({ slug: 'settings', data: { keuringVerlopen: 'blokkeren' } as never })
    const b = await niveau()
    expect(b.level).toBe('block')
    expect(b.reasons.join(' ')).toContain('keuring verlopen')
  }, 60_000)
})
