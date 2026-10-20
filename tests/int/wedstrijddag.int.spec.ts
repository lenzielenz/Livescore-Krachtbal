// @vitest-environment node

import { PDFDocument } from 'pdf-lib'
import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

// Altijd de federatieflow, ook als een andere test de modus omzet (lib/score-mode.ts).
process.env.PLATFORM_OMGEVING = 'federatie-test'

import config from '@/payload.config'
import { POST as actie } from '@/app/api/match/[id]/action/route'
import { POST as afgelastenRoute } from '@/app/api/match/[id]/afgelasten/route'
import { POST as afgelastingRoute } from '@/app/api/federatie/afgelastingen/route'
import { POST as blessureRoute } from '@/app/api/matchsheet/[matchId]/blessure/route'
import { POST as deelnameRoute } from '@/app/api/matchsheet/[matchId]/deelname/route'
import { GET as lineupGet, POST as lineupRoute } from '@/app/api/matchsheet/[matchId]/lineup/route'
import { POST as refereeRoute } from '@/app/api/matchsheet/[matchId]/referee/route'
import { POST as signRoute } from '@/app/api/matchsheet/[matchId]/sign/route'
import { POST as submitRoute } from '@/app/api/matchsheet/[matchId]/submit/route'
import { POST as ongevalRoute } from '@/app/api/ongeval/[id]/route'
import { POST as documentRoute } from '@/app/api/ongeval/[id]/document/route'
import { federatieStatistieken } from '@/lib/federatie-statistieken'

// De volledige wedstrijddag in de federatieflow, rol per rol, met echte logins:
// coach kiest selectie + kapitein → scheidsrechter keurt en geeft vrij (opstelling ligt dan vast) →
// aantekentafel start en scoort (ook met een speler uit een lagere ploeg) → blessure doorgegeven →
// einde → kapiteins (op het toestel van de scheidsrechter) en scheidsrechter tekenen af → wie speelde →
// indienen. Daarna: het ongevalsdossier via het profiel, en een afgelasting met foto's.

let payload: Payload
const S = Date.now()
const ids = {
  clubA: 0, clubB: 0, teamA: 0, teamA2: 0, teamB: 0, match: 0, match2: 0, official: 0,
  spelersA: [] as number[], spelersB: [] as number[], geleend: 0,
}
const tok: Record<string, string> = {}
const PW = 'wedstrijddag-123'

const auth = (wie: string): Record<string, string> => ({ Authorization: `JWT ${tok[wie]}` })
const json = (url: string, wie: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(wie) }, body: JSON.stringify(body) })
const p = (id: number) => ({ params: Promise.resolve({ matchId: String(id), id: String(id) }) })

async function login(wie: string, data: Record<string, unknown>) {
  await payload.create({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW, ...data } as never, overrideAccess: true })
  const r = await payload.login({ collection: 'users', data: { email: `${wie}-${S}@test.be`, password: PW } })
  tok[wie] = String(r.token)
  return Number(r.user?.id)
}
async function pdf(): Promise<File> {
  const d = await PDFDocument.create()
  d.addPage()
  return new File([Buffer.from(await d.save())], 'x.pdf', { type: 'application/pdf' })
}
const png = () =>
  new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')], 'veld.png', { type: 'image/png' })
const blad = async () => (await payload.find({ collection: 'matchsheets', where: { match: { equals: ids.match } }, depth: 0, overrideAccess: true })).docs[0]

describe('wedstrijddag van selectie tot indienen', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // In een lege databank wordt de eerste gebruiker admin.
    await payload.create({ collection: 'users', data: { email: `eerste-wd-${S}@test.be`, password: PW }, overrideAccess: true })
    const club = async (n: string) => Number((await payload.create({ collection: 'clubs', data: { name: `${n} ${S}` }, overrideAccess: true })).id)
    ids.clubA = await club('WD Thuis')
    ids.clubB = await club('WD Uit')
    const ploeg = async (n: string, c: number, reeks: string) =>
      Number((await payload.create({ collection: 'teams', data: { name: `${n} ${S}`, club: c, category: 'senioren', reeks: reeks as never }, overrideAccess: true })).id)
    ids.teamA = await ploeg('WD A1', ids.clubA, '1NAHB')
    ids.teamA2 = await ploeg('WD A2', ids.clubA, 'RDB')
    ids.teamB = await ploeg('WD B1', ids.clubB, '1NAHB')
    const speler = async (n: string, team: number, nr: number) =>
      Number(
        (
          await payload.create({
            collection: 'players',
            data: { name: `${n} ${S}`, team, shirtNumber: nr, vergunningsstatus: 'geldig', medischAttest: true, birthDate: '1999-05-05' },
            overrideAccess: true,
          })
        ).id,
      )
    for (let i = 1; i <= 5; i++) ids.spelersA.push(await speler(`Thuis${i}`, ids.teamA, i))
    for (let i = 1; i <= 5; i++) ids.spelersB.push(await speler(`Uit${i}`, ids.teamB, i))
    // Een speler uit de lagere ploeg van dezelfde club, met een rugnummer dat in A1 al bestaat.
    ids.geleend = await speler('Geleend', ids.teamA2, 3)

    ids.official = Number((await payload.create({ collection: 'officials', data: { name: `Ref Eree ${S}`, type: 'scheidsrechter' } as never, overrideAccess: true })).id)
    const datum = new Date(Date.now() + 10 * 60_000).toISOString()
    ids.match = Number((await payload.create({ collection: 'matches', data: { homeTeam: ids.teamA, awayTeam: ids.teamB, reeks: '1NAHB', date: datum, status: 'scheduled', goalAreaDepth: 10 }, overrideAccess: true })).id)
    ids.match2 = Number((await payload.create({ collection: 'matches', data: { homeTeam: ids.teamB, awayTeam: ids.teamA, reeks: '1NAHB', date: datum, status: 'scheduled', goalAreaDepth: 10 }, overrideAccess: true })).id)
    for (const m of [ids.match, ids.match2]) {
      await payload.create({ collection: 'matchsheets', data: { match: m, assignedReferee: ids.official } as never, overrideAccess: true })
    }

    await login('coachA', { roles: ['club-lid'], club: ids.clubA, clubFuncties: ['coach'], functieTeams: [ids.teamA] })
    await login('coachB', { roles: ['club-lid'], club: ids.clubB, clubFuncties: ['coach'], functieTeams: [ids.teamB] })
    await login('tafel', { roles: ['club-medewerker'], club: ids.clubA })
    await login('ref', { roles: ['scheidsrechter'], official: ids.official, name: 'Ref Eree' })
    await login('fed', { roles: ['federatie'] })
    await login('speler', { roles: ['club-lid'], club: ids.clubB, player: ids.spelersB[1] })
    await login('vreemd', { roles: ['club-lid'], club: ids.clubB })
  }, 180_000)

  it('de coach zet de selectie van zijn ploeg (ook een speler uit een lagere ploeg) en duidt de kapitein aan', async () => {
    const rij = (id: number, nr: number) => ({ player: id, rugnummer: nr })
    const thuis = [...ids.spelersA.map((id, i) => rij(id, i + 1)), rij(ids.geleend, 13)]
    expect((await lineupRoute(json(`/x`, 'coachA', { side: 'home', players: thuis, kapitein: ids.spelersA[0] }), p(ids.match))).status).toBe(200)
    // Niet de ploeg van de tegenstander.
    expect((await lineupRoute(json(`/x`, 'coachA', { side: 'away', players: [] }), p(ids.match))).status).toBe(403)
    // De kapitein moet in de selectie staan.
    expect((await lineupRoute(json(`/x`, 'coachB', { side: 'away', players: ids.spelersB.map((id, i) => rij(id, i + 1)), kapitein: ids.spelersA[0] }), p(ids.match))).status).toBe(400)
    expect((await lineupRoute(json(`/x`, 'coachB', { side: 'away', players: ids.spelersB.map((id, i) => rij(id, i + 1)), kapitein: ids.spelersB[0] }), p(ids.match))).status).toBe(200)
    const m = await payload.findByID({ collection: 'matches', id: ids.match, depth: 0, overrideAccess: true })
    expect(m.homeCaptain).toBe(ids.spelersA[0])
  })

  it('de scheidsrechter geeft pas vrij na de keuring; daarna ligt de opstelling vast voor de coach', async () => {
    const code = String((await blad()).vrijgaveCode)
    const vrij = () => refereeRoute(json('/x', 'ref', { action: 'wedstrijdstart', akkoord: true, code }), p(ids.match))
    const zonderKeuring = await vrij()
    expect(zonderKeuring.status).toBe(409)
    expect(((await zonderKeuring.json()) as { error: string }).error).toContain('keuring')
    expect((await refereeRoute(json('/x', 'ref', { action: 'keuring', keuring: {}, bevestigd: true }), p(ids.match))).status).toBe(200)
    // Elke speler moet eerst door de scheidsrechter gecontroleerd zijn.
    const zonderControle = await vrij()
    expect(((await zonderControle.json()) as { error: string }).error).toContain('te controleren')
    expect((await refereeRoute(json('/x', 'ref', { action: 'controle', side: 'home', alle: true }), p(ids.match))).status).toBe(200)
    expect((await refereeRoute(json('/x', 'ref', { action: 'controle', side: 'away', alle: true }), p(ids.match))).status).toBe(200)
    const ok = await vrij()
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { status: string }).status).toBe('wedstrijdklaar')

    const laat = await lineupRoute(json('/x', 'coachA', { side: 'home', players: ids.spelersA.map((id, i) => ({ player: id, rugnummer: i + 1 })) }), p(ids.match))
    expect(laat.status).toBe(409)
    const get = await lineupGet(new Request('http://localhost/x?side=home', { headers: auth('coachA') }), p(ids.match))
    expect(((await get.json()) as { vergrendeld: string | null }).vergrendeld).toContain('scheidsrechter')
    // Wie volgens het reglement niet in orde is, zet ook de scheidsrechter niet op de lijst.
    const geschorst = Number(
      (
        await payload.create({
          collection: 'players',
          data: { name: `Zonder vergunning ${S}`, team: ids.teamA, shirtNumber: 40, vergunningsstatus: 'geen', birthDate: '1999-05-05' },
          overrideAccess: true,
        })
      ).id,
    )
    const metGeschorst = [...ids.spelersA.map((id, i) => ({ player: id, rugnummer: i + 1 })), { player: ids.geleend, rugnummer: 13 }, { player: geschorst, rugnummer: 40 }]
    expect((await lineupRoute(json('/x', 'ref', { side: 'home', players: metGeschorst }), p(ids.match))).status).toBe(400)
    // Een andere scheidsrechter (niet toegewezen) kan hier niets.
    await login('ref2', { roles: ['scheidsrechter'] })
    expect((await refereeRoute(json('/x', 'ref2', { action: 'forfait', uitslag: 'thuis' }), p(ids.match))).status).toBe(403)
  })

  it('de aantekentafel start; het blad gaat mee naar "bezig"; de geleende speler kan scoren', async () => {
    const start = await actie(json('/x', 'tafel', { action: 'simplestart' }), { params: Promise.resolve({ id: String(ids.match) }) })
    expect(start.status).toBe(200)
    expect((await blad()).status).toBe('bezig')
    const doel = await actie(json('/x', 'tafel', { action: 'simplegoal', side: 'home', points: 1, playerId: ids.geleend, shirtNumber: 13 }), {
      params: Promise.resolve({ id: String(ids.match) }),
    })
    expect(doel.status).toBe(200)
    // Aftekenen kan nog niet: de wedstrijd loopt.
    expect((await signRoute(json('/x', 'ref', { who: 'scheidsrechter', akkoord: true, handtekening: 'data:image/png;base64,AAAA' }), p(ids.match))).status).toBe(409)
  })

  it('de coach geeft een blessure door: op het blad, aangifte klaar, speler verwittigd', async () => {
    const r = await blessureRoute(json('/x', 'coachB', { side: 'away', playerId: ids.spelersB[1], omschrijving: 'Verzwikte enkel bij de landing' }), p(ids.match))
    expect(r.status).toBe(200)
    const a = await payload.findByID({ collection: 'accidents', id: ((await r.json()) as { id: number }).id, depth: 0, overrideAccess: true })
    expect(a.club).toBe(ids.clubB)
    expect(a.status).toBe('gemeld')
    expect(String(a.moment)).toContain('1e helft')
    expect(String((await blad()).opmerkingen)).toContain('Verzwikte enkel')
    // Een coach meldt niet voor de andere ploeg.
    expect((await blessureRoute(json('/x', 'coachB', { side: 'home', playerId: ids.spelersA[0], omschrijving: 'x' }), p(ids.match))).status).toBe(403)
  })

  it('na het einde tekenen de kapiteins (op het toestel van de scheidsrechter) en de scheidsrechter af; dan indienen', async () => {
    expect((await actie(json('/x', 'tafel', { action: 'finish' }), { params: Promise.resolve({ id: String(ids.match) }) })).status).toBe(200)
    expect((await blad()).status).toBe('af_te_tekenen')

    const teken = (wie: string, who: string) => signRoute(json('/x', wie, { who, akkoord: true, handtekening: 'data:image/png;base64,AAAA' }), p(ids.match))
    const thuis = await teken('ref', 'kapiteinThuis')
    expect(thuis.status).toBe(200)
    // De naam van de kapitein uit de opstelling, niet die van de scheidsrechter.
    expect(((await thuis.json()) as { naam: string }).naam).toBe(`Thuis1 ${S}`)
    expect((await teken('ref', 'kapiteinThuis')).status).toBe(409)
    expect((await teken('coachA', 'kapiteinUit')).status).toBe(403)
    expect((await teken('coachB', 'kapiteinUit')).status).toBe(200)

    // Officials (1e nationale) invullen.
    await refereeRoute(
      json('/x', 'ref', {
        action: 'officials',
        officials: {
          aantekenaar: 'Anna Aantekenaar', tijdopnemer: 'Tom Tijd', grensrechterThuis: 'Gert Grens', grensrechterUit: 'Guy Grens',
          terreinafgevaardigde: 'Toon Terrein', coachThuis: 'Coen Coach', coachUit: 'Cas Coach',
        },
      }),
      p(ids.match),
    )
    const zonderRef = await submitRoute(json('/x', 'ref', {}), p(ids.match))
    expect(((await zonderRef.json()) as { error: string }).error).toContain('scheidsrechter moet eerst aftekenen')
    expect((await teken('ref', 'scheidsrechter')).status).toBe(200)
    const zonderDeelname = await submitRoute(json('/x', 'ref', {}), p(ids.match))
    expect(((await zonderDeelname.json()) as { error: string }).error).toContain('wie er speelde')
    expect((await deelnameRoute(json('/x', 'ref', { home: [...ids.spelersA.slice(0, 4), ids.geleend], away: ids.spelersB.slice(0, 4) }), p(ids.match))).status).toBe(200)
    const ingediend = await submitRoute(json('/x', 'ref', {}), p(ids.match))
    expect(ingediend.status).toBe(200)
    expect((await blad()).status).toBe('ingediend')
  })

  it('de speler laadt aangifte en getuigschrift op via zijn profiel en dient in; de federatie handelt af', async () => {
    const a = (await payload.find({ collection: 'accidents', where: { match: { equals: ids.match } }, depth: 0, overrideAccess: true })).docs[0]
    const id = Number(a.id)
    const op = (wie: string, soort: string, f: File) => {
      const fd = new FormData()
      fd.set('soort', soort)
      fd.set('bestand', f)
      return documentRoute(new Request('http://localhost/x', { method: 'POST', headers: auth(wie), body: fd }), p(id))
    }
    expect((await op('vreemd', 'aangifte', await pdf())).status).toBe(403)
    expect((await ongevalRoute(json('/x', 'speler', { actie: 'indienen' }), p(id))).status).toBe(400)
    expect((await op('speler', 'aangifte', await pdf())).status).toBe(200)
    expect((await op('speler', 'getuigschrift', png())).status).toBe(200)
    expect((await ongevalRoute(json('/x', 'speler', { actie: 'indienen' }), p(id))).status).toBe(200)
    expect((await ongevalRoute(json('/x', 'speler', { actie: 'afhandelen' }), p(id))).status).toBe(403)
    expect((await ongevalRoute(json('/x', 'fed', { actie: 'afhandelen' }), p(id))).status).toBe(200)
    expect((await payload.findByID({ collection: 'accidents', id, depth: 0, overrideAccess: true })).status).toBe('afgehandeld')

    const st = await federatieStatistieken(payload)
    expect(st.ongevallen.totaal).toBeGreaterThanOrEqual(1)
    expect(st.clubs.find((c) => c.id === ids.clubB)?.ongevallen).toBe(1)
  })

  it("afgelasting: de scheidsrechter met foto's, de wedstrijd start niet, de federatie herplant", async () => {
    const fd = (fotos: File[]) => {
      const f = new FormData()
      f.set('reden', 'terrein')
      f.set('toelichting', 'Plassen op het hele veld')
      for (const x of fotos) f.append('fotos', x)
      return new Request('http://localhost/x', { method: 'POST', headers: auth('ref'), body: f })
    }
    const ctx = { params: Promise.resolve({ id: String(ids.match2) }) }
    expect((await afgelastenRoute(fd([]), ctx)).status).toBe(400)
    const r = await afgelastenRoute(fd([png()]), ctx)
    expect(r.status).toBe(200)
    const afId = ((await r.json()) as { id: number }).id
    expect((await payload.findByID({ collection: 'matches', id: ids.match2, depth: 0, overrideAccess: true })).afgelast).toBe(true)
    expect((await payload.count({ collection: 'afgelasting-fotos', where: { afgelasting: { equals: afId } }, overrideAccess: true })).totalDocs).toBe(1)

    const start = await actie(json('/x', 'fed', { action: 'simplestart' }), ctx)
    expect(start.status).toBe(409)
    expect(((await start.json()) as { error: string }).error).toContain('afgelast')

    const nieuw = new Date(Date.now() + 7 * 86_400_000).toISOString()
    expect((await afgelastingRoute(json('/x', 'fed', { actie: 'herplannen', id: afId, datum: nieuw }))).status).toBe(200)
    const m = await payload.findByID({ collection: 'matches', id: ids.match2, depth: 0, overrideAccess: true })
    expect(m.afgelast).toBe(false)
    expect(new Date(String(m.date)).toISOString()).toBe(nieuw)
  })
})
