// @vitest-environment node

import { PDFDocument } from 'pdf-lib'
import { getPayload, type Payload } from 'payload'
import { afterAll, describe, it, beforeAll, expect } from 'vitest'

// Altijd de federatieflow, ook als een andere suite de modus omzet (lib/score-mode.ts).
process.env.PLATFORM_OMGEVING = 'federatie-test'

import config from '@/payload.config'
import { GET as bordGet, POST as bordPost } from '@/app/api/federatie/aanvragen/route'
import { POST as clubsRoute } from '@/app/api/federatie/clubs/route'
import { POST as scheidsrechtersRoute } from '@/app/api/federatie/scheidsrechters/route'
import { POST as toewijzingenRoute } from '@/app/api/federatie/toewijzingen/route'
import { POST as verplaatsenRoute } from '@/app/api/federatie/verplaatsen/route'
import { POST as clubBoetesRoute } from '@/app/api/club/boetes/route'
import { POST as klachtRoute } from '@/app/api/klacht/route'
import { POST as actieRoute } from '@/app/api/match/[id]/action/route'
import { POST as forfaitRoute } from '@/app/api/match/[id]/forfait/route'
import { POST as verplaatsingRoute } from '@/app/api/match/[id]/verplaatsing/route'
import { POST as blessureRoute } from '@/app/api/matchsheet/[matchId]/blessure/route'
import { POST as deelnameRoute } from '@/app/api/matchsheet/[matchId]/deelname/route'
import { POST as lineupRoute } from '@/app/api/matchsheet/[matchId]/lineup/route'
import { POST as refereeRoute } from '@/app/api/matchsheet/[matchId]/referee/route'
import { POST as signRoute } from '@/app/api/matchsheet/[matchId]/sign/route'
import { POST as submitRoute } from '@/app/api/matchsheet/[matchId]/submit/route'
import { POST as ongevalRoute } from '@/app/api/ongeval/[id]/route'
import { POST as documentRoute } from '@/app/api/ongeval/[id]/document/route'
import { POST as srRapportRoute } from '@/app/api/sr-rapport/route'
import { GET as srRapportPdf } from '@/app/api/sr-rapport/[id]/pdf/route'
import { POST as uitleningRoute } from '@/app/api/uitlening/route'
import { GET as uitleningPdf } from '@/app/api/uitlening/[id]/pdf/route'
import { type Aanvraag, actiesVoor, kolomVan } from '@/lib/aanvragen-bord'
import { boeteVoorstellen } from '@/lib/boetes'
import { forfaitMomentVoor } from '@/lib/forfait'
import { buildRoster } from '@/lib/matchsheet-data'
import { accountsVanSpeler } from '@/lib/meldingen'
import { ledenIndienen, lidOpslaan } from '@/lib/registratie-server'
import { aanleidingenVanBlad } from '@/lib/sr-rapport'
import { dagelijkseTermijnen } from '@/lib/termijnen'
import { huidigSeizoen } from '@/lib/uitlening'
import { werkdagenNa } from '@/lib/voorbehoud'

// De hele keten van de federatie in één seizoen, door de echte routes en met echte logins, zoals het
// reglement (RCVK) de stukken aan elkaar hangt:
//   club + login → leden registreren → federatie keurt goed (op het bord) → scheidsrechter met login,
//   toegewezen → wedstrijddag (selectie, controle, vrijgave, spel, uitsluiting, voorbehoud, blessure)
//   → aftekenen → het blad gaat naar iedereen → voorbehoud bekrachtigen / afzien / laten vervallen
//   (item 25) → klacht beslist op het bord → ongeval binnen 8 dagen (item 41) → forfait gemeld door
//   de club, boete volgens het moment (item 34) → opleggen, betalen, bevestigen → een vooraf gemeld
//   forfait vervalt bij verplaatsing → verplaatsingsaanvraag met administratieve kost (item 33) →
//   scheidsrechtersrapport (item 27) → uitlening van een jeugdspeler (item 45) → herinneringen bij termijnen.
// Elke stap controleert wat de volgende partij te zien krijgt: meldingen, het bord, de boetes.

let payload: Payload
const S = Date.now()
const PW = 'keten-wachtwoord-123'
const tok: Record<string, string> = {}
const ids = {
  clubThuis: 0, clubUit: 0, teamThuis: 0, teamUit: 0, jeugdThuis: 0, jeugdUit: 0,
  official: 0, m1: 0, mLaat: 0, mVooraf: 0, mJeugd: 0,
  spelersThuis: [] as number[], spelersUit: [] as number[],
  ffVooraf: 0, ffLaat: 0, ffTerPlaatse: 0, vbSoort: 0, verplSenior: 0, verplJeugd: 0,
}
const DAG = 86_400_000

const auth = (wie: string): Record<string, string> => ({ Authorization: `JWT ${tok[wie]}` })
const req = (wie: string, body?: unknown) =>
  new Request('http://localhost/x', { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...auth(wie) }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: number) => ({ params: Promise.resolve({ matchId: String(id), id: String(id) }) })
const json = async (r: Response) => (await r.json()) as Record<string, unknown>

async function nieuweLogin(wie: string, data: Record<string, unknown>) {
  await payload.create({ collection: 'users', data: { email: `${wie}-${S}@keten.be`, password: PW, ...data } as never, overrideAccess: true })
  const r = await payload.login({ collection: 'users', data: { email: `${wie}-${S}@keten.be`, password: PW } })
  tok[wie] = String(r.token)
  return Number(r.user?.id)
}
/** Een uitnodigingslink gebruiken zoals de persoon zelf: wachtwoord kiezen, dan inloggen. */
async function viaLink(wie: string, link: string, email: string) {
  const token = decodeURIComponent(String(link.match(/token=([^&]+)/)?.[1] ?? ''))
  expect(token.length).toBeGreaterThan(10)
  await payload.resetPassword({ collection: 'users', data: { token, password: PW }, overrideAccess: true })
  const r = await payload.login({ collection: 'users', data: { email, password: PW } })
  tok[wie] = String(r.token)
  return Number(r.user?.id)
}
/** Inloggen als het account van een speler (aangemaakt bij de goedkeuring, wachtwoord zelf te kiezen). */
async function alsSpeler(wie: string, playerId: number) {
  const [userId] = await accountsVanSpeler(payload, playerId)
  expect(userId, `speler ${playerId} heeft een account`).toBeTruthy()
  const u = await payload.update({ collection: 'users', id: userId!, data: { password: PW }, overrideAccess: true })
  const r = await payload.login({ collection: 'users', data: { email: String(u.email), password: PW } })
  tok[wie] = String(r.token)
  return userId!
}
const meldingenVan = async (userId: number, bevat: string) =>
  (
    await payload.find({
      collection: 'meldingen',
      where: { and: [{ user: { equals: userId } }, ...(bevat ? [{ titel: { contains: bevat } }] : [])] },
      depth: 0,
      limit: 50,
      overrideAccess: true,
    })
  ).docs
// Payload bewaart e-mailadressen in kleine letters.
const userVan = async (wie: string) =>
  Number((await payload.find({ collection: 'users', where: { email: { equals: `${wie}-${S}@keten.be`.toLowerCase() } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]?.id)
const bord = async (): Promise<Aanvraag[]> => (await json(await bordGet(req('fed'))) as { aanvragen: Aanvraag[] }).aanvragen
const kaart = async (sleutel: string) => (await bord()).find((a) => a.sleutel === sleutel)
const blad = async (m: number) => (await payload.find({ collection: 'matchsheets', where: { match: { equals: m } }, depth: 0, overrideAccess: true })).docs[0]!
const mijnBoetes = async (match: number) =>
  (
    await payload.find({
      collection: 'boetes',
      where: { and: [{ match: { equals: match } }, { soort: { in: [ids.ffVooraf, ids.ffLaat, ids.ffTerPlaatse, ids.vbSoort, ids.verplSenior, ids.verplJeugd] } }] },
      depth: 0,
      limit: 20,
      overrideAccess: true,
    })
  ).docs
const soortVan = (b: { soort?: unknown }) => Number(typeof b.soort === 'object' && b.soort ? (b.soort as { id: number }).id : b.soort)

async function attest(playerId: number, club: number) {
  const d = await PDFDocument.create()
  d.addPage([200, 200])
  const pdf = Buffer.from(await d.save())
  const a = await payload.create({
    collection: 'medische-attesten',
    data: { player: playerId, club },
    file: { data: pdf, mimetype: 'application/pdf', name: `attest-${playerId}-${S}.pdf`, size: pdf.length },
    overrideAccess: true,
  })
  await payload.update({ collection: 'players', id: playerId, data: { medischAttestBestand: a.id }, overrideAccess: true })
}
async function pdfBestand(): Promise<File> {
  const d = await PDFDocument.create()
  d.addPage()
  return new File([Buffer.from(await d.save())], 'x.pdf', { type: 'application/pdf' })
}

describe('de keten van de federatie: van eerste lid tot boete en document', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.create({ collection: 'users', data: { email: `eerste-keten-${S}@keten.be`, password: PW }, overrideAccess: true })
    await nieuweLogin('fed', { roles: ['federatie'], name: 'Fien Federatie' })
    // De boetelijst zoals de federatie ze opzet: per forfaitmoment een bedrag, voorbehoud 75 euro,
    // verplaatsing 20 (senioren) of 10 (jeugd).
    const soort = async (naam: string, bedrag: number, trigger: string, extra: Record<string, unknown> = {}) =>
      Number((await payload.create({ collection: 'boete-soorten', data: { naam: `${naam} ${S}`, bedrag, trigger, actief: true, ...extra } as never, overrideAccess: true })).id)
    ids.ffVooraf = await soort('Forfait tijdig', 25, 'forfait', { forfaitMoment: 'vooraf' })
    ids.ffLaat = await soort('Forfait laat', 50, 'forfait', { forfaitMoment: 'laat' })
    ids.ffTerPlaatse = await soort('Forfait ter plaatse', 75, 'forfait', { forfaitMoment: 'ter_plaatse' })
    ids.vbSoort = await soort('Voorbehoud niet bekrachtigd', 75, 'voorbehoud')
    ids.verplSenior = await soort('Verplaatsing senioren', 20, 'verplaatsing', { doelgroep: 'senioren' })
    ids.verplJeugd = await soort('Verplaatsing jeugd', 10, 'verplaatsing', { doelgroep: 'jeugd' })
  }, 180_000)

  // De boetelijst van deze suite niet actief laten: andere suites in dezelfde databank zouden er
  // anders voorstellen uit krijgen.
  afterAll(async () => {
    for (const id of [ids.ffVooraf, ids.ffLaat, ids.ffTerPlaatse, ids.vbSoort, ids.verplSenior, ids.verplJeugd]) {
      if (id) await payload.update({ collection: 'boete-soorten', id, data: { actief: false }, overrideAccess: true }).catch(() => null)
    }
  })

  it('de federatie maakt twee clubs en nodigt hun beheerder uit; die kiezen zelf een wachtwoord', async () => {
    for (const [kant, naam] of [['Thuis', `Keten Thuis ${S}`], ['Uit', `Keten Uit ${S}`]] as const) {
      const c = await json(await clubsRoute(req('fed', { actie: 'club', naam })))
      const clubId = Number(c.id)
      expect(clubId).toBeGreaterThan(0)
      const email = `beheer${kant.toLowerCase()}-${S}@keten.be`
      const u = await json(await clubsRoute(req('fed', { actie: 'uitnodigen', clubId, email, naam: `Beheerder ${kant}` })))
      expect(u.ok).toBe(true)
      await viaLink(`staf${kant}`, String(u.link), email)
      if (kant === 'Thuis') ids.clubThuis = clubId
      else ids.clubUit = clubId
    }
    // Een club kan geen andere club aanmaken.
    expect((await clubsRoute(req('stafThuis', { actie: 'club', naam: 'x' }))).status).toBe(403)
    const ploeg = async (n: string, club: number, category: string, reeks: string) =>
      Number((await payload.create({ collection: 'teams', data: { name: `${n} ${S}`, club, category, reeks } as never, overrideAccess: true })).id)
    ids.teamThuis = await ploeg('KT Heren', ids.clubThuis, 'senioren', 'LH')
    ids.teamUit = await ploeg('KU Heren', ids.clubUit, 'senioren', 'LH')
    ids.jeugdThuis = await ploeg('KT U14', ids.clubThuis, 'U14', 'U14J')
    ids.jeugdUit = await ploeg('KU U14', ids.clubUit, 'U14', 'U14J')
  }, 120_000)

  it('de clubs registreren hun spelers; de federatie keurt ze goed op het bord; elk lid krijgt een login', async () => {
    for (const [club, team, lijst, prefix] of [
      [ids.clubThuis, ids.teamThuis, ids.spelersThuis, 'Thuis'],
      [ids.clubUit, ids.teamUit, ids.spelersUit, 'Uit'],
    ] as const) {
      for (let i = 1; i <= 5; i++) {
        const r = await lidOpslaan(payload, club, {
          teamId: team, voornaam: `${prefix}${i}`, achternaam: `Keten${S}`, birthDate: '2000-03-0' + i, geslacht: 'm',
          email: `${prefix.toLowerCase()}${i}-${S}@keten.be`, soortLid: 'speler', medischeKeuringOp: new Date().toISOString().slice(0, 10),
        })
        expect(r.ok, JSON.stringify(r)).toBe(true)
        const id = (r as { id: number }).id
        await attest(id, club)
        lijst.push(id)
      }
      expect((await ledenIndienen(payload, club, [...lijst])).ingediend).toHaveLength(5)
    }
    // Ze staan als nieuw op het bord; de federatie keurt goed met één knop per kaart.
    const kaarten = (await bord()).filter((a) => a.bron === 'registratie' && [...ids.spelersThuis, ...ids.spelersUit].includes(a.bronId))
    expect(kaarten).toHaveLength(10)
    expect(kaarten.every((a) => kolomVan(a) === 'nieuw')).toBe(true)
    // Een club kan niet beslissen.
    expect((await bordPost(req('stafThuis', { sleutel: `registratie:${ids.spelersThuis[0]}`, actie: 'goedkeuren' }))).status).toBe(403)
    for (const id of [...ids.spelersThuis, ...ids.spelersUit]) {
      expect((await bordPost(req('fed', { sleutel: `registratie:${id}`, actie: 'goedkeuren' }))).status).toBe(200)
    }
    const p = await payload.findByID({ collection: 'players', id: ids.spelersThuis[0]!, depth: 0, overrideAccess: true })
    expect([p.registratieStatus, p.vergunningsstatus, p.medischAttest]).toEqual(['goedgekeurd', 'geldig', true])
    expect((await accountsVanSpeler(payload, ids.spelersThuis[0]!)).length).toBe(1)
    expect((await kaart(`registratie:${ids.spelersThuis[0]}`))?.open).toBe(false)
  }, 240_000)

  it('de federatie voegt een scheidsrechter toe met login en wijst hem twee wedstrijden toe', async () => {
    const email = `scheids-${S}@keten.be`
    const r = await json(await scheidsrechtersRoute(req('fed', { naam: `Karel Keten ${S}`, email, federationNumber: '777' })))
    expect(r.ok).toBe(true)
    ids.official = Number(r.officialId)
    const refUser = await viaLink('ref', String(r.link), email)
    expect(Number((await payload.findByID({ collection: 'users', id: refUser, depth: 0, overrideAccess: true })).official)).toBe(ids.official)

    const wedstrijd = async (home: number, away: number, reeks: string, date: Date) =>
      Number((await payload.create({ collection: 'matches', data: { homeTeam: home, awayTeam: away, reeks, date: date.toISOString(), status: 'scheduled', goalAreaDepth: 10 } as never, overrideAccess: true })).id)
    ids.m1 = await wedstrijd(ids.teamThuis, ids.teamUit, 'LH', new Date(Date.now() + 10 * 60_000))
    ids.mLaat = await wedstrijd(ids.teamThuis, ids.teamUit, 'LH', new Date(Date.now() + 30 * 60_000))
    ids.mVooraf = await wedstrijd(ids.teamUit, ids.teamThuis, 'LH', new Date(Date.now() + 20 * DAG))
    ids.mJeugd = await wedstrijd(ids.jeugdThuis, ids.jeugdUit, 'U14J', new Date(Date.now() + 15 * DAG))
    const t = await json(await toewijzingenRoute(req('fed', { toewijzingen: [{ matchId: ids.m1, officialId: ids.official }, { matchId: ids.mLaat, officialId: ids.official }] })))
    expect(t.ok).toBe(true)
    expect(Number((await blad(ids.m1)).assignedReferee)).toBe(ids.official)
    // Hij ziet het in zijn meldingen, niet enkel als push die hij misschien niet aanzette.
    expect((await meldingenVan(refUser, 'Je fluit een wedstrijd')).length).toBe(2)

    // Een tweede scheidsrechter neemt mLaat over en dan terug: wie er een kwijtraakt, hoort het ook.
    const tweede = Number((await json(await scheidsrechtersRoute(req('fed', { naam: `Reserve Keten ${S}`, email: `reserve-${S}@keten.be` })))).officialId)
    const reserveUser = Number((await payload.find({ collection: 'users', where: { official: { equals: tweede } }, depth: 0, overrideAccess: true })).docs[0]?.id)
    await toewijzingenRoute(req('fed', { toewijzingen: [{ matchId: ids.mLaat, officialId: tweede }] }))
    expect((await meldingenVan(refUser, 'niet meer')).length).toBe(1)
    await toewijzingenRoute(req('fed', { toewijzingen: [{ matchId: ids.mLaat, officialId: ids.official }] }))
    expect((await meldingenVan(reserveUser, 'niet meer')).length).toBe(1)
  }, 120_000)

  it('wedstrijddag: selectie, controle en vrijgave, spel, uitsluiting, voorbehoud en een blessure', async () => {
    await nieuweLogin('coachThuis', { roles: ['club-lid'], club: ids.clubThuis, clubFuncties: ['coach'], functieTeams: [ids.teamThuis] })
    await nieuweLogin('coachUit', { roles: ['club-lid'], club: ids.clubUit, clubFuncties: ['coach'], functieTeams: [ids.teamUit] })
    await nieuweLogin('tafel', { roles: ['club-medewerker'], club: ids.clubThuis })
    const rijen = (lijst: number[]) => lijst.map((player, i) => ({ player, rugnummer: i + 1 }))
    expect((await lineupRoute(req('coachThuis', { side: 'home', players: rijen(ids.spelersThuis), kapitein: ids.spelersThuis[0] }), ctx(ids.m1))).status).toBe(200)
    expect((await lineupRoute(req('coachUit', { side: 'away', players: rijen(ids.spelersUit), kapitein: ids.spelersUit[0] }), ctx(ids.m1))).status).toBe(200)

    const ref = (body: unknown) => refereeRoute(req('ref', body), ctx(ids.m1))
    expect((await ref({ action: 'keuring', keuring: {}, bevestigd: true })).status).toBe(200)
    expect((await ref({ action: 'controle', side: 'home', alle: true })).status).toBe(200)
    expect((await ref({ action: 'controle', side: 'away', alle: true })).status).toBe(200)
    const vrij = await ref({ action: 'wedstrijdstart', akkoord: true, code: String((await blad(ids.m1)).vrijgaveCode) })
    expect(vrij.status, JSON.stringify(await vrij.clone().json())).toBe(200)

    const tafel = (body: unknown) => actieRoute(req('tafel', body), { params: Promise.resolve({ id: String(ids.m1) }) })
    expect((await tafel({ action: 'simplestart' })).status).toBe(200)
    expect((await tafel({ action: 'simplegoal', side: 'home', points: 2, playerId: ids.spelersThuis[1], shirtNumber: 2 })).status).toBe(200)
    expect((await tafel({ action: 'simplegoal', side: 'away', points: 1, playerId: ids.spelersUit[2], shirtNumber: 3 })).status).toBe(200)

    // Uitsluiting en voorbehoud: enkel de scheidsrechter noteert ze, met ploeg, feiten, score en speeltijd.
    expect((await refereeRoute(req('coachUit', { action: 'voorbehoud', side: 'uit', naam: 'x', reden: 'xxxxxxxx' }), ctx(ids.m1))).status).toBe(403)
    expect((await ref({ action: 'voorbehoud', naam: 'Kapitein', reden: 'Doelpunt niet toegekend' })).status).toBe(400)
    // Zonder onderwerp weet niemand welk comité het behandelt (item 25.3).
    const zonder = await ref({ action: 'voorbehoud', side: 'uit', naam: 'Uit1', reden: 'Doelpunt niet toegekend' })
    expect([zonder.status, String((await json(zonder)).error)]).toEqual([400, expect.stringContaining('comité')])
    expect((await ref({ action: 'uitsluiting', side: 'uit', playerId: ids.spelersUit[4], reden: 'Opzettelijk naar het hoofd geworpen', score: '2-1', speeltijd: "1e helft 18'" })).status).toBe(200)
    const v = (side: string, reden: string, onderwerp = side === 'uit' ? 'aantekenblad' : 'spelregels') =>
      ref({ action: 'voorbehoud', side, naam: side === 'uit' ? 'Uit1' : 'Thuis1', reden, score: '2-1', speeltijd: "1e helft 20'", onderwerp })
    expect((await v('uit', 'Rugworp van #3 werd als nekworp genoteerd')).status).toBe(200)
    expect((await v('thuis', 'Grensrechter stond niet op de lijn')).status).toBe(200)
    // Een verkeerde regel schrappen kan, zolang de scheidsrechter niet aftekende.
    expect((await v('uit', 'Per vergissing genoteerd')).status).toBe(200)
    expect((await ref({ action: 'voorbehoud-schrappen', index: 2 })).status).toBe(200)
    expect((await v('uit', 'Speler #5 stond niet op de ledenlijst')).status).toBe(200)
    const b = await blad(ids.m1)
    expect((b.voorbehoud ?? []).map((r) => r.side)).toEqual(['uit', 'thuis', 'uit'])
    expect(b.uitsluitingen?.[0]?.side).toBe('uit')

    const blessure = await blessureRoute(req('coachUit', { side: 'away', playerId: ids.spelersUit[1], omschrijving: 'Verzwikte enkel bij de landing' }), ctx(ids.m1))
    expect(blessure.status).toBe(200)
  }, 240_000)

  it('aftekenen en indienen: het blad wordt bewaard en gaat naar iedereen die het moet hebben', async () => {
    expect((await actieRoute(req('tafel', { action: 'finish' }), { params: Promise.resolve({ id: String(ids.m1) }) })).status).toBe(200)
    const teken = (wie: string, who: string) => signRoute(req(wie, { who, akkoord: true, handtekening: 'data:image/png;base64,AAAA' }), ctx(ids.m1))
    expect((await teken('ref', 'kapiteinThuis')).status).toBe(200)
    expect((await teken('coachUit', 'kapiteinUit')).status).toBe(200)
    await refereeRoute(
      req('ref', {
        action: 'officials',
        officials: { aantekenaar: 'Anna Aantekenaar', tijdopnemer: 'Tom Tijd', grensrechterThuis: 'Gert Grens', grensrechterUit: 'Guy Grens', terreinafgevaardigde: 'Toon Terrein', coachThuis: 'Coen Coach', coachUit: 'Cas Coach' },
      }),
      ctx(ids.m1),
    )
    expect((await deelnameRoute(req('ref', { home: ids.spelersThuis.slice(0, 4), away: ids.spelersUit.slice(0, 5) }), ctx(ids.m1))).status).toBe(200)
    expect((await teken('ref', 'scheidsrechter')).status).toBe(200)
    // Na de handtekening van de scheidsrechter verandert er niets meer (item 37).
    expect((await refereeRoute(req('ref', { action: 'voorbehoud', side: 'uit', naam: 'x', reden: 'te laat bedacht' }), ctx(ids.m1))).status).toBe(409)

    // Na de laatste handtekening dient het systeem zelf in; anders doet de scheidsrechter het.
    if ((await blad(ids.m1)).status !== 'ingediend') expect((await submitRoute(req('ref', {}), ctx(ids.m1))).status).toBe(200)
    const b = await blad(ids.m1)
    expect(b.status).toBe('ingediend')
    expect(b.pdf, 'de PDF is bewaard').toBeTruthy()

    // Wie het blad krijgt: beide clubs, de federatie, de scheidsrechter, beide kapiteins, beide coaches.
    const m = await payload.findByID({ collection: 'matches', id: ids.m1, depth: 0, overrideAccess: true })
    const kapThuis = (await accountsVanSpeler(payload, Number(m.homeCaptain)))[0]!
    const kapUit = (await accountsVanSpeler(payload, Number(m.awayCaptain)))[0]!
    const ontvangers = {
      stafThuis: await userVan('beheerthuis'), stafUit: await userVan('beheeruit'), fed: await userVan('fed'), ref: await userVan('scheids'),
      kapiteinThuis: kapThuis, kapiteinUit: kapUit, coachThuis: await userVan('coachThuis'), coachUit: await userVan('coachUit'),
    }
    for (const [wie, id] of Object.entries(ontvangers)) {
      expect((await meldingenVan(id, 'Wedstrijdblad ingediend')).length, `${wie} kreeg het blad`).toBe(1)
    }

    // Elk voorbehoud werd een dossier bij de club van die ploeg, te bekrachtigen binnen 5 werkdagen.
    const dossiers = (await payload.find({ collection: 'klachten', where: { and: [{ match: { equals: ids.m1 } }, { soort: { equals: 'voorbehoud' } }] }, sort: 'id', depth: 0, overrideAccess: true })).docs
    expect(dossiers.map((k) => [Number(k.club), k.status])).toEqual([
      [ids.clubUit, 'te_bekrachtigen'],
      [ids.clubThuis, 'te_bekrachtigen'],
      [ids.clubUit, 'te_bekrachtigen'],
    ])
    expect(new Date(String(dossiers[0]!.bekrachtigTegen)).getTime()).toBeGreaterThan(Date.now() + 5 * DAG)
    // Het onderwerp bepaalt het comité (item 25.3): aantekenblad → sportcomité, spelregels → scheidsrechterscomité.
    expect(dossiers.map((k) => k.comite)).toEqual(['sport', 'scheidsrechters', 'sport'])
    expect((await kaart(`klacht:${dossiers[1]!.id}`))?.detail).toContain('[Scheidsrechterscomité]')
    expect((await meldingenVan(ontvangers.stafUit, 'Voorbehoud te bekrachtigen')).length).toBe(2)
  }, 240_000)

  it('voorbehoud: de ene club bekrachtigt, de andere ziet af, een derde vervalt; de federatie beslist op het bord', async () => {
    const dossiers = (await payload.find({ collection: 'klachten', where: { and: [{ match: { equals: ids.m1 } }, { soort: { equals: 'voorbehoud' } }] }, sort: 'id', depth: 0, overrideAccess: true })).docs
    const [uitA, thuis, uitB] = dossiers.map((k) => Number(k.id))
    // Op het bord: wacht op de club, met de termijn.
    const k = await kaart(`klacht:${uitA}`)
    expect(k && kolomVan(k)).toBe('wacht')
    expect(k?.deadlineAuto).toBeTruthy()
    expect(k?.status).toContain('bekrachtiging')

    expect((await klachtRoute(req('stafUit', { actie: 'afzien', id: thuis }))).status).toBe(403)
    expect((await klachtRoute(req('stafThuis', { actie: 'afzien', id: thuis }))).status).toBe(200)
    expect((await klachtRoute(req('stafUit', { actie: 'bekrachtigen', id: uitA, relaas: 'te kort' }))).status).toBe(400)
    const relaas = 'Speler #3 wierp met de rug naar het doel, de aantekenaar noteerde een nekworp: dat scheelt één punt in de eindstand.'
    expect((await klachtRoute(req('stafUit', { actie: 'bekrachtigen', id: uitA, relaas }))).status).toBe(200)
    expect((await klachtRoute(req('stafUit', { actie: 'bekrachtigen', id: uitA, relaas }))).status).toBe(409)

    // Bekrachtigd: nu bij de federatie, met haar knoppen. Ze wijst af met een toelichting.
    const open = await kaart(`klacht:${uitA}`)
    expect(open && kolomVan(open)).toBe('nieuw')
    expect(open?.detail).toContain('rug naar het doel')
    expect((await bordPost(req('fed', { sleutel: `klacht:${uitA}`, actie: 'afwijzen' }))).status).toBe(400)
    expect((await bordPost(req('fed', { sleutel: `klacht:${uitA}`, actie: 'afwijzen', toelichting: 'De scheidsrechter bevestigt een nekworp.' }))).status).toBe(200)
    expect((await payload.findByID({ collection: 'klachten', id: uitA!, depth: 0, overrideAccess: true })).status).toBe('afgewezen')

    // Het derde voorbehoud blijft liggen: na de termijn vervalt het en volgt het voorstel van 75 euro.
    await boeteVoorstellen(payload, 120, Date.now() + 10 * DAG)
    expect((await payload.findByID({ collection: 'klachten', id: uitB!, depth: 0, overrideAccess: true })).status).toBe('vervallen')
    const kosten = (await mijnBoetes(ids.m1)).filter((b) => soortVan(b) === ids.vbSoort)
    expect(kosten.map((b) => [Number(b.club), b.bedrag, b.status])).toEqual([[ids.clubUit, 75, 'voorstel']])
    // Wie afzag of bekrachtigde, betaalt niets.
    expect((await payload.findByID({ collection: 'klachten', id: thuis!, depth: 0, overrideAccess: true })).status).toBe('afgezien')
  }, 180_000)

  it('ongeval: de termijn van 8 dagen staat op het bord; de speler dient in; de federatie handelt af', async () => {
    const a = (await payload.find({ collection: 'accidents', where: { match: { equals: ids.m1 } }, depth: 0, overrideAccess: true })).docs[0]!
    const id = Number(a.id)
    const k = await kaart(`ongeval:${id}`)
    expect(k && kolomVan(k)).toBe('wacht')
    const termijn = new Date(String(k?.deadlineAuto)).getTime() - new Date(String(a.ongevalDatum ?? a.createdAt)).getTime()
    expect(Math.round(termijn / DAG)).toBe(8)

    await alsSpeler('geblesseerde', ids.spelersUit[1]!)
    const op = async (soort: string) => {
      const fd = new FormData()
      fd.set('soort', soort)
      fd.set('bestand', await pdfBestand())
      return documentRoute(new Request('http://localhost/x', { method: 'POST', headers: auth('geblesseerde'), body: fd }), ctx(id))
    }
    expect((await op('aangifte')).status).toBe(200)
    expect((await op('getuigschrift')).status).toBe(200)
    expect((await ongevalRoute(req('geblesseerde', { actie: 'indienen' }), ctx(id))).status).toBe(200)
    const ingediend = await kaart(`ongeval:${id}`)
    expect(ingediend && kolomVan(ingediend)).toBe('nieuw')
    expect((await bordPost(req('fed', { sleutel: `ongeval:${id}`, actie: 'afhandelen' }))).status).toBe(200)
    const klaar = await kaart(`ongeval:${id}`)
    expect(klaar && kolomVan(klaar)).toBe('klaar')
  }, 180_000)

  it('forfait: de club meldt het; iedereen hoort het; precies één boete volgens het moment; opleggen, betalen, bevestigen', async () => {
    expect((await forfaitRoute(req('stafThuis', { kant: 'uit', reden: 'Griep' }), ctx(ids.mLaat))).status).toBe(403)
    expect((await forfaitRoute(req('stafUit', { kant: 'uit', reden: '' }), ctx(ids.mLaat))).status).toBe(400)
    const voor = Date.now()
    const r = await forfaitRoute(req('stafUit', { kant: 'uit', reden: 'Te weinig spelers door griep' }), ctx(ids.mLaat))
    expect(r.status).toBe(200)
    const m = await payload.findByID({ collection: 'matches', id: ids.mLaat, depth: 0, overrideAccess: true })
    const verwacht = forfaitMomentVoor(new Date(voor), new Date(String(m.date)))
    expect((await json(r)).moment).toBe(verwacht)
    expect(m.status).toBe('finished')
    const ff = (await blad(ids.mLaat)).forfait as { uitslag?: string; gemeldUit?: boolean; gemeldOp?: string; moment?: string }
    expect([ff.uitslag, ff.gemeldUit, Boolean(ff.gemeldOp), ff.moment]).toEqual(['uit', true, true, verwacht])
    // Nog eens melden kan niet.
    expect((await forfaitRoute(req('stafUit', { kant: 'uit', reden: 'Te weinig spelers door griep' }), ctx(ids.mLaat))).status).toBe(409)

    for (const [wie, user] of [['tegenpartij', await userVan('beheerthuis')], ['scheidsrechter', await userVan('scheids')], ['federatie', await userVan('fed')]] as const) {
      expect((await meldingenVan(user, 'Forfait')).length, `${wie} hoorde het`).toBe(1)
    }

    // Eén voorstel, van de soort die bij het moment hoort — niet één per forfaitsoort.
    const boetes = await mijnBoetes(ids.mLaat)
    expect(boetes.map((b) => [Number(b.club), soortVan(b)])).toEqual([[ids.clubUit, verwacht === 'laat' ? ids.ffLaat : ids.ffVooraf]])
    const sleutel = `boete:${boetes[0]!.id}`

    // De federatie legt op via het bord; de club meldt de betaling; de federatie bevestigt.
    expect((await bordPost(req('fed', { sleutel, actie: 'opleggen' }))).status).toBe(200)
    expect((await kaart(sleutel))?.open).toBe(false)
    expect((await clubBoetesRoute(req('stafUit', { actie: 'betaling', id: boetes[0]!.id }))).status).toBe(200)
    const gemeld = await kaart(sleutel)
    expect([gemeld?.statusCode, gemeld && kolomVan(gemeld)]).toEqual(['betaling_gemeld', 'nieuw'])
    expect((await bordPost(req('fed', { sleutel, actie: 'betaald' }))).status).toBe(200)
    expect((await payload.findByID({ collection: 'boetes', id: boetes[0]!.id, depth: 0, overrideAccess: true })).status).toBe('betaald')
  }, 180_000)

  it('een vooraf gemeld forfait vervalt bij een verplaatsing, en zijn boetevoorstel met hem', async () => {
    const r = await forfaitRoute(req('stafThuis', { kant: 'uit', reden: 'Ploeg trekt zich terug voor dit weekend' }), ctx(ids.mVooraf))
    expect(r.status).toBe(200)
    expect((await json(r)).moment).toBe('vooraf')
    const voorstel = (await mijnBoetes(ids.mVooraf)).filter((b) => b.status === 'voorstel')
    expect(voorstel.map(soortVan)).toEqual([ids.ffVooraf])

    const nieuw = new Date(Date.now() + 27 * DAG).toISOString()
    const v = await json(await verplaatsenRoute(req('fed', { wijzigingen: [{ matchId: ids.mVooraf, date: nieuw }] })))
    expect(v.verplaatst).toBe(1)
    const m = await payload.findByID({ collection: 'matches', id: ids.mVooraf, depth: 0, overrideAccess: true })
    expect([m.status, new Date(String(m.date)).toISOString()]).toEqual(['scheduled', nieuw])
    expect(((await blad(ids.mVooraf)).forfait as { uitslag?: string }).uitslag).toBe('geen')
    expect((await mijnBoetes(ids.mVooraf)).map((b) => b.status)).toEqual(['vernietigd'])
  }, 120_000)

  it('verplaatsingsaanvraag: club vraagt, tegenpartij akkoord, federatie keurt goed op het bord, administratieve kost voor de jeugd', async () => {
    const nieuw = new Date(Date.now() + 22 * DAG).toISOString()
    const a = await json(await verplaatsingRoute(req('stafThuis', { actie: 'aanvragen', voorgesteld: nieuw, reden: 'Terrein bezet door de gemeente (kermis)' }), ctx(ids.mJeugd)))
    const aid = Number(a.id)
    expect(aid).toBeGreaterThan(0)
    let k = await kaart(`verplaatsing:${aid}`)
    expect(k && kolomVan(k)).toBe('wacht')
    // Bij de tegenpartij beslist de federatie nog niet.
    expect((await bordPost(req('fed', { sleutel: `verplaatsing:${aid}`, actie: 'goedkeuren' }))).status).toBe(409)
    expect((await verplaatsingRoute(req('stafUit', { actie: 'akkoord', id: aid }), ctx(ids.mJeugd))).status).toBe(200)
    k = await kaart(`verplaatsing:${aid}`)
    expect(k && kolomVan(k)).toBe('nieuw')
    expect((await bordPost(req('fed', { sleutel: `verplaatsing:${aid}`, actie: 'goedkeuren' }))).status).toBe(200)
    const m = await payload.findByID({ collection: 'matches', id: ids.mJeugd, depth: 0, overrideAccess: true })
    expect(new Date(String(m.date)).toISOString()).toBe(nieuw)
    // De jeugdkost (10), niet die van de senioren (20), voor de club die vroeg.
    expect((await mijnBoetes(ids.mJeugd)).map((b) => [Number(b.club), soortVan(b), b.bedrag])).toEqual([[ids.clubThuis, ids.verplJeugd, 10]])
  }, 120_000)

  it('het bord klopt: wat afgehandeld is staat bij Afgehandeld, wat bij een club ligt bij Wacht', async () => {
    const alles = await bord()
    const van = (s: string) => alles.find((a) => a.sleutel === s)
    const klachten = (await payload.find({ collection: 'klachten', where: { match: { equals: ids.m1 } }, sort: 'id', depth: 0, overrideAccess: true })).docs.map((x) => Number(x.id))
    for (const s of [`registratie:${ids.spelersUit[0]}`, `klacht:${klachten[0]}`, `klacht:${klachten[1]}`, `klacht:${klachten[2]}`]) {
      const x = van(s)
      expect(x, s).toBeTruthy()
      expect(kolomVan(x!), s).toBe('klaar')
    }
    const voorstel = alles.filter((a) => a.bron === 'boete' && a.open && a.titel.includes(`Keten Uit ${S}`))
    expect(voorstel.length).toBeGreaterThanOrEqual(1) // het voorbehoud-voorstel van 75 euro wacht op de federatie
  }, 60_000)

  it('scheidsrechtersrapport (item 27): verplicht na voorbehoud/uitsluiting, herinnering, ondertekend met bijlage, enkel comité en scheidsrechter lezen het, afgehandeld op het bord', async () => {
    const b = await blad(ids.m1)
    expect(aanleidingenVanBlad(b as never)).toEqual(['voorbehoud', 'uitsluiting'])
    const refUser = await userVan('scheids')
    const fedUser = await userVan('fed')

    // Een werkdag na het indienen nog geen rapport: de scheidsrechter krijgt één herinnering, ook als de ronde twee keer loopt.
    const ingediend = new Date(String(b.updatedAt))
    const later = werkdagenNa(ingediend, 1)
    await dagelijkseTermijnen(payload, later)
    await dagelijkseTermijnen(payload, later)
    expect((await meldingenVan(refUser, 'Scheidsrechtersrapport nog op te maken')).length).toBe(1)
    expect((await meldingenVan(fedUser, 'Nog geen scheidsrechtersrapport')).length).toBe(0)
    // Na drie werkdagen hoort ook de federatie het.
    await dagelijkseTermijnen(payload, werkdagenNa(ingediend, 3))
    expect((await meldingenVan(fedUser, 'Nog geen scheidsrechtersrapport')).length).toBe(1)

    const rapport = async (wie: string, velden: Record<string, string | string[]>, bijlage?: File) => {
      const fd = new FormData()
      fd.set('matchId', String(ids.m1))
      for (const [k, v] of Object.entries(velden)) for (const x of [v].flat()) fd.append(k, x)
      if (bijlage) fd.append('bijlagen', bijlage)
      return srRapportRoute(new Request('http://localhost/x', { method: 'POST', headers: auth(wie), body: fd }))
    }
    const relaas = 'In de 18e minuut wierp #5 van de bezoekers de bal opzettelijk naar het hoofd van een tegenstrever. Uitgesloten. Daarna voorbehoud over een nekworp.'
    expect((await rapport('coachUit', { aanleidingen: 'uitsluiting', relaas, naam: 'Coach' })).status).toBe(403)
    expect((await rapport('ref', { aanleidingen: 'uitsluiting', relaas: 'te kort', naam: 'Karel' })).status).toBe(400)
    expect((await rapport('ref', { aanleidingen: [], relaas, naam: 'Karel' })).status).toBe(400)
    const ok = await rapport('ref', { aanleidingen: ['voorbehoud', 'uitsluiting'], relaas, naam: 'Karel Keten' }, await pdfBestand())
    expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200)
    const rid = Number((await json(ok)).id)
    const doc = await payload.findByID({ collection: 'sr-rapporten', id: rid, depth: 0, overrideAccess: true })
    expect([doc.status, doc.ondertekendNaam, (doc.bijlagen ?? []).length]).toEqual(['ingediend', 'Karel Keten', 1])
    // (contains is hoofdletterongevoelig: 'Nog geen scheidsrechtersrapport:' niet meetellen)
    expect((await meldingenVan(fedUser, 'Scheidsrechtersrapport:')).filter((m) => !String(m.titel).includes('Nog geen')).length).toBe(1)

    // Lezen: de scheidsrechter en het comité, niet de clubs. Ook de bijlage niet.
    const pdf = (wie: string) => srRapportPdf(req(wie), ctx(rid))
    const eigen = await pdf('ref')
    expect([eigen.status, eigen.headers.get('content-type')]).toEqual([200, 'application/pdf'])
    expect((await PDFDocument.load(await eigen.arrayBuffer())).getPageCount()).toBeGreaterThanOrEqual(1)
    expect((await pdf('fed')).status).toBe(200)
    expect((await pdf('stafUit')).status).toBe(403)
    const stafUit = await payload.findByID({ collection: 'users', id: await userVan('beheeruit'), depth: 0, overrideAccess: true })
    const alsClub = { overrideAccess: false, user: { ...stafUit, collection: 'users' } } as never
    expect((await payload.find({ collection: 'rapport-bijlagen', where: { match: { equals: ids.m1 } }, ...(alsClub as object) })).docs).toHaveLength(0)
    expect((await payload.find({ collection: 'sr-rapporten', where: { match: { equals: ids.m1 } }, ...(alsClub as object) })).docs).toHaveLength(0)

    // Op het bord: nieuw, met de PDF als link en "Afhandelen" als knop.
    const k = await kaart(`rapport:${rid}`)
    expect(k && kolomVan(k)).toBe('nieuw')
    expect(actiesVoor(k!).map((a) => a.id)).toEqual(['lezen', 'afhandelen'])
    expect((await bordPost(req('fed', { sleutel: `rapport:${rid}`, actie: 'lezen' }))).status).toBe(400)
    expect((await bordPost(req('stafThuis', { sleutel: `rapport:${rid}`, actie: 'afhandelen' }))).status).toBe(403)
    expect((await bordPost(req('fed', { sleutel: `rapport:${rid}`, actie: 'afhandelen', toelichting: 'Speler #5 wordt opgeroepen door het comité.' }))).status).toBe(200)
    const af = await payload.findByID({ collection: 'sr-rapporten', id: rid, depth: 0, overrideAccess: true })
    expect([af.status, af.besluit]).toEqual(['afgehandeld', 'Speler #5 wordt opgeroepen door het comité.'])
    expect((await meldingenVan(refUser, 'rapport is afgehandeld')).length).toBe(1)
    expect((await bordPost(req('fed', { sleutel: `rapport:${rid}`, actie: 'afhandelen' }))).status).toBe(409)

    // Na de handtekening van de scheidsrechter kan "zie scheidsrechtersrapport" niet meer aangevinkt worden.
    expect((await refereeRoute(req('ref', { action: 'rapport-volgt', aan: true }), ctx(ids.m1))).status).toBe(409)
  }, 180_000)

  it('uitlening van een jeugdspeler (item 45): club tekent, andere club tekent, federatie bevestigt; dan pas op de selectielijst; iedereen heeft de overeenkomst', async () => {
    const { startJaar } = await huidigSeizoen(payload)
    const jeugdspeler = async (n: string) =>
      Number(
        (
          await payload.create({
            collection: 'players',
            data: {
              name: `${n} ${S}`,
              team: ids.jeugdThuis,
              club: ids.clubThuis,
              birthDate: `${startJaar - 12}-03-01`,
              vergunningsstatus: 'geldig',
              medischAttest: true,
              actief: true,
              shirtNumber: 9,
            } as never,
            overrideAccess: true,
          })
        ).id,
      )
    const jan = await jeugdspeler('Jan Jeugd')
    const pol = await jeugdspeler('Pol Jeugd')
    const post = (wie: string, body: Record<string, unknown>) => uitleningRoute(req(wie, body))
    const opstellen = (wie: string, speler: number, extra: Record<string, unknown> = {}) =>
      post(wie, { actie: 'opstellen', spelerId: speler, naarPloegId: ids.jeugdUit, adres: 'Kerkstraat 1, 9000 Gent', naam: 'Bea Beheerder', ...extra })

    // Wie mag wat: enkel de club van de speler stelt op; een senior kan niet; een adres hoort erbij; naar een andere club.
    expect((await opstellen('stafUit', jan)).status).toBe(403)
    expect((await opstellen('stafThuis', ids.spelersThuis[0]!)).status).toBe(400)
    expect((await opstellen('stafThuis', jan, { adres: '' })).status).toBe(400)
    expect((await opstellen('stafThuis', jan, { naarPloegId: ids.jeugdThuis })).status).toBe(400)
    const r = await opstellen('stafThuis', jan)
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200)
    const uid = Number((await json(r)).id)
    expect((await opstellen('stafThuis', jan)).status).toBe(400) // er loopt er al een
    const stafUitUser = await userVan('beheeruit')
    expect((await meldingenVan(stafUitUser, 'Uitlening te ondertekenen')).length).toBe(1)

    // Wacht op de ontvangende club: op het bord bij "wacht", de federatie kan nog niet bevestigen.
    let k = await kaart(`uitlening:${uid}`)
    expect(k && kolomVan(k)).toBe('wacht')
    expect((await bordPost(req('fed', { sleutel: `uitlening:${uid}`, actie: 'bevestigen' }))).status).toBe(409)
    // Tekenen doet enkel de ontvangende club zelf.
    expect((await post('stafThuis', { actie: 'tekenen', id: uid, naam: 'X' })).status).toBe(403)
    expect((await post('fed', { actie: 'tekenen', id: uid, naam: 'Fien' })).status).toBe(403)
    expect((await post('stafUit', { actie: 'tekenen', id: uid, naam: 'Uwe Uit' })).status).toBe(200)
    expect((await meldingenVan(await userVan('fed'), 'Uitlening te bevestigen')).length).toBe(1)
    k = await kaart(`uitlening:${uid}`)
    expect([k && kolomVan(k), actiesVoor(k!).map((a) => a.id)]).toEqual(['nieuw', ['lezen', 'bevestigen', 'weigeren']])

    // Nog niet bevestigd: niet op de selectielijst, en de server weigert hem.
    const opRoster = async () => ((await buildRoster(payload, ids.mJeugd, 'away'))?.players ?? []).find((p) => p.id === jan)
    expect(await opRoster()).toBeUndefined()
    const lineup = () => lineupRoute(req('stafUit', { side: 'away', players: [{ player: jan, rugnummer: 9 }] }), ctx(ids.mJeugd))
    expect((await lineup()).status).toBe(400)

    // Weigeren vraagt een reden; bevestigen niet.
    expect((await bordPost(req('fed', { sleutel: `uitlening:${uid}`, actie: 'weigeren' }))).status).toBe(400)
    expect((await bordPost(req('fed', { sleutel: `uitlening:${uid}`, actie: 'bevestigen' }))).status).toBe(200)
    expect((await payload.findByID({ collection: 'uitleningen', id: uid, depth: 0, overrideAccess: true })).status).toBe('bevestigd')
    for (const wie of ['beheerthuis', 'beheeruit']) expect((await meldingenVan(await userVan(wie), 'Uitlening bevestigd')).length, wie).toBe(1)

    // Nu wel: op de lijst van de ploeg die hem leent, met zijn eigen club erbij; opstellen lukt. Zijn club blijft dezelfde.
    const p = await opRoster()
    expect(p?.uitgeleendVan).toBe(`Keten Thuis ${S}`)
    expect(p?.selectability.level).not.toBe('block')
    const ls = await lineup()
    expect(ls.status, JSON.stringify(await ls.clone().json())).toBe(200)
    const zelf = await payload.findByID({ collection: 'players', id: jan, depth: 0, overrideAccess: true })
    expect([Number(zelf.club), Number(zelf.team)]).toEqual([ids.clubThuis, ids.jeugdThuis])

    // De overeenkomst: beide clubs en de federatie lezen ze; een coach (geen clubstaf) niet.
    for (const wie of ['stafThuis', 'stafUit', 'fed']) {
      const d = await uitleningPdf(req(wie), ctx(uid))
      expect([wie, d.status, d.headers.get('content-type')]).toEqual([wie, 200, 'application/pdf'])
    }
    expect((await uitleningPdf(req('coachThuis'), ctx(uid))).status).toBe(404)

    // Een bevestigde uitlening beëindigt enkel de federatie.
    expect((await post('stafThuis', { actie: 'intrekken', id: uid, reden: 'Speler wil terug' })).status).toBe(409)

    // Een ondertekend document verdwijnt niet stil: speler en ploeg kunnen niet weg.
    await expect(payload.delete({ collection: 'players', id: jan, overrideAccess: true })).rejects.toThrow(/uitleenovereenkomst/)
    await expect(payload.delete({ collection: 'teams', id: ids.jeugdUit, overrideAccess: true })).rejects.toThrow(/uitleenovereenkomst/)

    expect((await post('fed', { actie: 'intrekken', id: uid, reden: 'Einde van de uitlening op vraag van beide clubs' })).status).toBe(200)
    expect(await opRoster()).toBeUndefined()

    // Een tweede overeenkomst die blijft liggen: na drie dagen een herinnering aan de ontvangende club, één keer.
    const r2 = await opstellen('stafThuis', pol)
    expect(r2.status).toBe(200)
    await dagelijkseTermijnen(payload, new Date(Date.now() + 4 * DAG))
    await dagelijkseTermijnen(payload, new Date(Date.now() + 5 * DAG))
    expect((await meldingenVan(stafUitUser, 'wacht op uw handtekening')).length).toBe(1)
    // De club die opstelde, kan intrekken zolang de federatie niet bevestigde.
    expect((await post('stafThuis', { actie: 'intrekken', id: Number((await json(r2)).id), reden: 'Toch niet' })).status).toBe(200)
  }, 240_000)

  it('termijnen: herinnering op de laatste dag van een voorbehoud en op dag 6 van een ongeval, telkens één keer', async () => {
    const nu = new Date()
    const tegen = werkdagenNa(nu, 5)
    const kl = await payload.create({
      collection: 'klachten',
      data: { match: ids.mLaat, club: ids.clubThuis, soort: 'voorbehoud', status: 'te_bekrachtigen', reden: 'Test termijn', bekrachtigTegen: tegen.toISOString(), sleutel: `test-termijn-${S}` },
      overrideAccess: true,
    })
    const stafThuisUser = await userVan('beheerthuis')
    // De dag ervoor: nog niets. Op de laatste dag 's ochtends: de herinnering. Een tweede ronde: niet opnieuw.
    await dagelijkseTermijnen(payload, new Date(tegen.getTime() - 30 * 3600_000))
    expect((await meldingenVan(stafThuisUser, 'Vandaag de laatste dag')).length).toBe(0)
    await dagelijkseTermijnen(payload, new Date(tegen.getTime() - 14 * 3600_000))
    await dagelijkseTermijnen(payload, new Date(tegen.getTime() - 13 * 3600_000))
    expect((await meldingenVan(stafThuisUser, 'Vandaag de laatste dag')).length).toBe(1)
    await payload.update({ collection: 'klachten', id: kl.id, data: { status: 'afgezien' }, overrideAccess: true })

    const ong = await payload.create({
      collection: 'accidents',
      data: { titel: `Termijntest ${S}`, slachtofferNaam: 'Thuis3 Keten', player: ids.spelersThuis[2], club: ids.clubThuis, ongevalDatum: new Date(nu.getTime() - 6.5 * DAG).toISOString(), status: 'gemeld' } as never,
      overrideAccess: true,
    })
    await dagelijkseTermijnen(payload, nu)
    await dagelijkseTermijnen(payload, nu)
    expect((await meldingenVan(stafThuisUser, 'Ongevalsaangifte: nog twee dagen')).length).toBe(1)
    const spelerUser = (await accountsVanSpeler(payload, ids.spelersThuis[2]!))[0]!
    expect((await meldingenVan(spelerUser, 'Ongevalsaangifte: nog twee dagen')).length).toBe(1)
    await payload.update({ collection: 'accidents', id: ong.id, data: { status: 'afgehandeld' } as never, overrideAccess: true })
  }, 120_000)
})
