// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

process.env.PLATFORM_OMGEVING = 'federatie-test'

import config from '@/payload.config'
import { POST as clubInschrijving } from '@/app/api/club/inschrijving/route'
import { POST as fedInschrijvingen } from '@/app/api/federatie/inschrijvingen/route'
import { POST as kalenderPlan } from '@/app/api/federatie/kalender-plan/route'
import { POST as verplaatsingRoute } from '@/app/api/match/[id]/verplaatsing/route'
import { dateStrBE, shiftDateStr, zaterdagVan } from '@/lib/datetime'

// Van inschrijving tot kalender: de federatie opent een ronde, clubs schrijven in met koppels en
// weekends dat hun terrein niet vrij is, de federatie verwerkt en maakt de kalender — dames en heren
// van dezelfde club spelen dan hetzelfde weekend tegen dezelfde club. Daarna een verplaatsingsaanvraag.

let payload: Payload
const S = Date.now()
const PW = 'planning-123'
const tok: Record<string, string> = {}
const clubIds: number[] = []
let ronde = 0
const SEIZOEN = `T${S}`
const eerste = zaterdagVan(shiftDateStr(dateStrBE(new Date()), 30))
const laatste = shiftDateStr(eerste, 7 * 14)

async function login(wie: string, data: Record<string, unknown>) {
  await payload.create({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW, ...data } as never, overrideAccess: true })
  const r = await payload.login({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW } })
  tok[wie] = String(r.token)
}
type Route = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const post = (route: Route | ((req: Request) => Promise<Response>), wie: string, body: unknown, id = '0') =>
  (route as Route)(
    new Request('http://localhost/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `JWT ${tok[wie]}` }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  )

describe('inschrijving → kalender → verplaatsing', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.create({ collection: 'users', data: { email: `eerste-pl-${S}@test.be`, password: PW }, overrideAccess: true })
    for (const n of ['Sint-Michiels', 'Baasrode', 'Zandberg', 'Lebbeke']) {
      clubIds.push(Number((await payload.create({ collection: 'clubs', data: { name: `${n} ${S}` }, overrideAccess: true })).id))
    }
    await login('fed', { roles: ['federatie'] })
    for (let i = 0; i < 4; i++) await login(`club${i}`, { roles: ['club-beheerder'], club: clubIds[i] })
  }, 120_000)

  it('de federatie opent een ronde; een club kan dat niet', async () => {
    expect((await post(fedInschrijvingen, 'club0', { actie: 'ronde' })).status).toBe(403)
    const r = await post(fedInschrijvingen, 'fed', { actie: 'ronde', seizoen: SEIZOEN, deadline: shiftDateStr(dateStrBE(new Date()), 10), eersteWeekend: eerste, laatsteWeekend: laatste, vrijeWeekends: [{ weekend: shiftDateStr(eerste, 28), reden: 'beker' }] })
    expect(r.status).toBe(200)
    ronde = Number(((await r.json()) as { id: number }).id)
  }, 60_000)

  it('clubs schrijven in met koppels en een terrein dat niet vrij is', async () => {
    // Fout: koppel naar een ploeg in dezelfde reeks.
    const fout = await post(clubInschrijving, 'club0', { ronde, ploegen: [{ naam: 'A H', reeks: '1NAH', koppelMet: 'A H2' }, { naam: 'A H2', reeks: '1NAH' }], indienen: true })
    expect(fout.status).toBe(400)
    for (let i = 0; i < 4; i++) {
      const r = await post(clubInschrijving, `club${i}`, {
        ronde,
        ploegen: [
          { naam: `C${i} ${S} Heren`, reeks: 'RHA', thuisdag: 'za', thuisUur: '16:00', koppelMet: `C${i} ${S} Dames` },
          { naam: `C${i} ${S} Dames`, reeks: 'RDA', thuisdag: 'za', thuisUur: '14:00' },
        ],
        aantalVelden: 1,
        onbeschikbaar: i === 0 ? [{ weekend: eerste, reden: 'kermis', hard: true }] : [],
        indienen: true,
      })
      expect(r.status).toBe(200)
    }
    // Een club kan niet voor een andere club inschrijven: de club komt uit het account.
    const docs = await payload.find({ collection: 'inschrijvingen', where: { ronde: { equals: ronde } }, overrideAccess: true })
    expect(docs.docs).toHaveLength(4)
  }, 60_000)

  it('verwerken zet de ploegen en de koppels klaar', async () => {
    const docs = await payload.find({ collection: 'inschrijvingen', where: { ronde: { equals: ronde } }, overrideAccess: true })
    for (const d of docs.docs) expect((await post(fedInschrijvingen, 'fed', { actie: 'verwerken', id: d.id })).status).toBe(200)
    const heren = await payload.find({ collection: 'teams', where: { name: { like: `${S} Heren` } }, depth: 0, overrideAccess: true })
    expect(heren.docs).toHaveLength(4)
    expect(heren.docs.every((t) => t.koppelMet != null && t.reeks === 'RHA')).toBe(true)
    // Na verwerking kan de club niet meer wijzigen.
    expect((await post(clubInschrijving, 'club1', { ronde, ploegen: [], indienen: true })).status).toBe(409)
  }, 60_000)

  it('de kalender: heren en dames samen, geen thuiswedstrijd op de kermis, niets op het bekerweekend', async () => {
    const voorstel = await post(kalenderPlan, 'fed', { ronde, reeksen: ['RHA', 'RDA'] })
    expect(voorstel.status).toBe(200)
    const { plan } = (await voorstel.json()) as { plan: { wedstrijden: { reeks: string; weekend: string; thuis: number; uit: number; koppel?: string }[]; problemen: unknown[]; stats: { koppels: number; koppelsSamen: number } } }
    expect(plan.wedstrijden.filter((w) => w.reeks === 'RHA')).toHaveLength(12)
    expect(plan.stats.koppelsSamen).toBe(plan.stats.koppels)
    expect(plan.wedstrijden.every((w) => w.weekend !== shiftDateStr(eerste, 28))).toBe(true)
    // Bevestigen maakt de wedstrijden aan, met het seizoen van de ronde; opnieuw bevestigen dupliceert niets.
    const ok = (await (await post(kalenderPlan, 'fed', { ronde, reeksen: ['RHA', 'RDA'], bevestig: true })).json()) as { aangemaakt: number }
    expect(ok.aangemaakt).toBe(24)
    const nog = (await (await post(kalenderPlan, 'fed', { ronde, reeksen: ['RHA', 'RDA'], bevestig: true })).json()) as { aangemaakt: number }
    expect(nog.aangemaakt).toBe(0)
    const ms = await payload.find({ collection: 'matches', where: { seizoen: { equals: SEIZOEN } }, depth: 1, limit: 100, overrideAccess: true })
    expect(ms.docs).toHaveLength(24)
    const thuisKermis = ms.docs.filter((m) => {
      const club = (m.homeTeam as { club?: number | { id: number } }).club
      const cid = typeof club === 'object' ? club?.id : club
      return cid === clubIds[0] && zaterdagVan(dateStrBE(new Date(String(m.date)))) === eerste
    })
    expect(thuisKermis).toHaveLength(0)
  }, 120_000)

  it('verplaatsingsaanvraag: club vraagt, tegenpartij akkoord, federatie keurt goed', async () => {
    const ms = await payload.find({ collection: 'matches', where: { seizoen: { equals: SEIZOEN } }, depth: 2, limit: 100, overrideAccess: true })
    const m = ms.docs.find((x) => ((x.homeTeam as { club: { id: number } }).club.id === clubIds[1]))!
    const tegen = clubIds.indexOf((m.awayTeam as { club: { id: number } }).club.id)
    const nieuw = new Date(new Date(String(m.date)).getTime() + 7 * 86_400_000).toISOString()
    const id = String(m.id)
    // Een club die niet speelt, kan niets aanvragen.
    const vreemd = clubIds.findIndex((c, i) => i !== 1 && i !== tegen)
    expect((await post(verplaatsingRoute, `club${vreemd}`, { actie: 'aanvragen', voorgesteld: nieuw, reden: 'x' }, id)).status).toBe(403)
    const a = await post(verplaatsingRoute, 'club1', { actie: 'aanvragen', voorgesteld: nieuw, reden: 'Ziekte in de ploeg' }, id)
    expect(a.status).toBe(200)
    const aid = ((await a.json()) as { id: number }).id
    // De aanvrager kan zelf niet akkoord gaan; de federatie wacht op de tegenpartij.
    expect((await post(verplaatsingRoute, 'club1', { actie: 'akkoord', id: aid }, id)).status).toBe(403)
    expect((await post(verplaatsingRoute, `club${tegen}`, { actie: 'akkoord', id: aid }, id)).status).toBe(200)
    expect((await post(verplaatsingRoute, `club${tegen}`, { actie: 'goedkeuren', id: aid }, id)).status).toBe(403)
    expect((await post(verplaatsingRoute, 'fed', { actie: 'goedkeuren', id: aid }, id)).status).toBe(200)
    const na = await payload.findByID({ collection: 'matches', id: m.id, depth: 0, overrideAccess: true })
    expect(new Date(String(na.date)).toISOString()).toBe(nieuw)
    const melding = await payload.find({ collection: 'meldingen', where: { titel: { like: 'Verplaatst' } }, overrideAccess: true })
    expect(melding.docs.length).toBeGreaterThan(0)
  }, 60_000)
})
