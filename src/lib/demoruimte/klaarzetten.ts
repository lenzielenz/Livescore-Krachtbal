import { createHash } from 'node:crypto'

import type { Payload } from 'payload'

import { isDemoOmgeving } from '../omgeving'
import { aftrapVerschuiven } from '../aftrap'
import type { AuthedUser } from '../api-auth'
import { blessureMelden } from '../blessure'
import { boeteBehandelen, boeteManueel, boeteVoorstellen } from '../boetes'
import { dateStrBE, shiftDateStr, zaterdagVan } from '../datetime'
import { inschrijvingOpslaan } from '../inschrijving'
import { planKalender } from '../kalender-planner'
import { kaartAanvragen } from '../medische-kaart'
import { SYSTEEM_STATUS, volgBladStatus } from '../blad-status'
import { advanceSimpleHalf, recordSimpleGoal } from '../simple-match-engine'
import { verplaatsingAanvragen, verplaatsingBeantwoorden } from '../verplaatsing'
import { demoReferendumKlaarzetten } from './referendum'
import { DEMO_ROLLEN, demoEmail, isDemoAccount } from './rollen'

// De demowereld (zie docs/DEMORUIMTE.md): wist de demodatabank en zet een volledige, geloofwaardige
// competitie klaar, met wedstrijden in elke fase van de wedstrijddag. Alles wat een rol "doet",
// gebeurt via dezelfde routes als in de echte app (selectie, controle, vrijgave, start, blessure,
// aftekenen, afgelasting, aftrap, verplaatsing): zo is de demo nooit iets dat de app zelf niet kan.
//
// Enkel in de demo-omgeving (PLATFORM_OMGEVING=demo). Wissen weigert bovendien een databank die er
// niet als demo uitziet (veel echte gebruikers of spelers) — een verkeerd gezette variabele op live
// mag nooit alles wissen.

/**
 * Het wachtwoord van de demo-accounts: afgeleid van het geheim van de omgeving, dus nergens
 * leesbaar. Rol wisselen gaat via de demoruimte (met de toegangscode), niet via het loginformulier.
 */
export function demoWachtwoord(): string {
  return createHash('sha256').update(`demo-accounts:${process.env.PAYLOAD_SECRET ?? ''}`).digest('base64url').slice(0, 24)
}
const DAG = 86_400_000

type Ctx = { params: Promise<{ id: string; matchId: string }> }
type Route = (req: Request, ctx: Ctx) => Promise<Response>

export type KlaarzetVerslag = { ok: boolean; stappen: string[]; fout?: string; duurMs: number }

// ── Veilig wissen ─────────────────────────────────────────────────────────────────────────────
const NOOIT_WISSEN = new Set(['users', 'payload-preferences', 'payload-locked-documents', 'payload-migrations', 'payload-jobs', 'payload-kv'])

async function lijktDemo(payload: Payload): Promise<string | null> {
  const users = await payload.find({ collection: 'users', depth: 0, limit: 200, pagination: false, overrideAccess: true })
  const echt = users.docs.filter((u) => !isDemoAccount(u.email))
  const spelers = await payload.count({ collection: 'players', overrideAccess: true })
  if (echt.length > 5 || spelers.totalDocs > 600) {
    return `Deze databank lijkt geen demodatabank (${echt.length} echte accounts, ${spelers.totalDocs} spelers). Er is niets gewist.`
  }
  return null
}

async function wissen(payload: Payload) {
  const slugs = Object.keys(payload.collections).filter((s) => !NOOIT_WISSEN.has(s))
  // Verwijzingen tussen collecties bepalen de volgorde; in plaats van die volgorde te onderhouden,
  // proberen we in rondes tot alles weg is (een rij die nog verwezen wordt, valt in een latere ronde).
  for (let ronde = 0; ronde < 8; ronde++) {
    let over = 0
    for (const slug of slugs) {
      const res = await payload.find({ collection: slug as never, depth: 0, limit: 1000, pagination: false, overrideAccess: true }).catch(() => ({ docs: [] }))
      for (const d of res.docs as { id: number | string }[]) {
        await payload.delete({ collection: slug as never, id: d.id, overrideAccess: true }).catch(() => {
          over++
        })
      }
    }
    if (over === 0) break
  }
  // De demo-accounts gaan mee; een echte beheerder (die de omgeving opzette) blijft.
  await payload.delete({ collection: 'users', where: { email: { like: '@demo.krachtbal.be' } }, overrideAccess: true }).catch(() => {})
}

// ── Namen ─────────────────────────────────────────────────────────────────────────────────────
const VOORNAMEN_M = ['Jonas', 'Ruben', 'Lars', 'Wout', 'Milan', 'Bram', 'Sander', 'Tom', 'Stijn', 'Kobe', 'Arne', 'Lucas', 'Pieter', 'Jelle', 'Seppe', 'Thibo', 'Robbe', 'Ward', 'Niels', 'Dries']
const VOORNAMEN_V = ['Lotte', 'Fien', 'Emma', 'Lien', 'Marie', 'Nore', 'Hanne', 'Ellen', 'Julie', 'Sara', 'Laura', 'Elise', 'Febe', 'Ines', 'Amber', 'Jana']
const ACHTERNAMEN = ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Hermans', 'Aerts', 'Smets', 'Lambrechts', 'Van den Bossche', 'De Bruyne', 'Verhoeven', 'Van Damme', 'Cools', 'Dierickx']

const CLUBS = [
  { sleutel: 'SM', naam: 'KBC Sint-Michiels', plaats: 'Sint-Michiels', kleur: '#1d5fbf', kleur2: '#ffffff' },
  { sleutel: 'BA', naam: 'KC Baasrode', plaats: 'Baasrode', kleur: '#c0392b', kleur2: '#ffffff' },
  { sleutel: 'ZB', naam: 'Zandberg KBC', plaats: 'Zandberg', kleur: '#e0a23d', kleur2: '#1a1205' },
  { sleutel: 'LE', naam: 'KBK Lebbeke', plaats: 'Lebbeke', kleur: '#2a9d6a', kleur2: '#ffffff' },
  { sleutel: 'OP', naam: 'Opwijk KC', plaats: 'Opwijk', kleur: '#6c3fb5', kleur2: '#ffffff' },
  { sleutel: 'SG', naam: 'Sint-Gillis KBC', plaats: 'Sint-Gillis', kleur: '#14213d', kleur2: '#fca311' },
] as const

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** Een "foto" van een ondergelopen veld, voor de afgelasting (PNG via sharp). */
async function fotoVeld(): Promise<File> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa3b5"/><stop offset="0.35" stop-color="#c7d2db"/><stop offset="0.36" stop-color="#3f6b3a"/><stop offset="1" stop-color="#2d4f2a"/></linearGradient></defs>
    <rect width="960" height="640" fill="url(#g)"/>
    <ellipse cx="420" cy="470" rx="300" ry="70" fill="#9fb6c8" opacity="0.85"/>
    <ellipse cx="760" cy="390" rx="160" ry="40" fill="#a9bfd0" opacity="0.8"/>
    <ellipse cx="200" cy="560" rx="170" ry="45" fill="#98afc2" opacity="0.8"/>
    <line x1="80" y1="250" x2="880" y2="250" stroke="#e8efe6" stroke-width="5"/>
    <rect x="430" y="175" width="100" height="75" fill="none" stroke="#e8efe6" stroke-width="5"/>
    <text x="30" y="610" font-family="Arial" font-size="26" fill="#ffffff">Terrein onder water — 2 uur voor de aftrap</text>
  </svg>`
  const sharp = (await import('sharp')).default
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return new File([new Uint8Array(png)], 'terrein.png', { type: 'image/png' })
}

export async function demoKlaarzetten(payload: Payload, opties: { forceer?: boolean } = {}): Promise<KlaarzetVerslag> {
  const begin = Date.now()
  const stappen: string[] = []
  const stap = (t: string) => stappen.push(t)
  if (!isDemoOmgeving() && !opties.forceer) return { ok: false, stappen, fout: 'Enkel in de demo-omgeving (PLATFORM_OMGEVING=demo).', duurMs: 0 }
  const twijfel = await lijktDemo(payload)
  if (twijfel) return { ok: false, stappen, fout: twijfel, duurMs: Date.now() - begin }

  try {
    await wissen(payload)
    stap('Demodatabank leeggemaakt')
    const random = rng(20261020)
    const kies = <T,>(l: readonly T[]) => l[Math.floor(random() * l.length)]

    // Een lege databank maakt de eerste gebruiker admin: dat mag nooit een rol uit de demo zijn.
    const totaal = await payload.count({ collection: 'users', overrideAccess: true })
    if (totaal.totalDocs === 0) {
      await payload.create({ collection: 'users', data: { email: demoEmail('beheer'), password: demoWachtwoord(), name: 'Demo beheer', roles: ['admin'] } as never, overrideAccess: true })
    }

    // Het seizoen: startjaar vanaf juli (zoals lib/seasons.ts). De leeftijdscategorieën rekenen ermee.
    const vandaagDag = dateStrBE(new Date())
    const startJaar = Number(vandaagDag.slice(5, 7)) >= 7 ? Number(vandaagDag.slice(0, 4)) : Number(vandaagDag.slice(0, 4)) - 1
    await payload.updateGlobal({ slug: 'season', data: { startYear: startJaar } as never, overrideAccess: true }).catch(() => null)

    // ── Clubs, ploegen, spelers ────────────────────────────────────────────────────────────────
    const club: Record<string, number> = {}
    for (const c of CLUBS) {
      club[c.sleutel] = Number(
        (await payload.create({ collection: 'clubs', data: { name: c.naam, colorPrimary: c.kleur, colorSecondary: c.kleur2, plaats: c.plaats } as never, overrideAccess: true })).id,
      )
    }
    const ploeg: Record<string, number> = {}
    const maakPloeg = async (sleutel: string, c: (typeof CLUBS)[number], soort: 'Heren' | 'Dames' | 'U14', reeks: string, uur: string) => {
      ploeg[sleutel] = Number(
        (
          await payload.create({
            collection: 'teams',
            data: { name: `${c.naam.replace(/^(KBC|KC|KBK) /, '').replace(/ (KBC|KC)$/, '')} ${soort}`, club: club[c.sleutel], reeks, category: soort === 'U14' ? 'U14' : 'senioren', thuisdag: 'za', thuisUur: uur } as never,
            overrideAccess: true,
          })
        ).id,
      )
    }
    for (const c of CLUBS) await maakPloeg(`${c.sleutel}-H`, c, 'Heren', 'RHA', '16:00')
    for (const c of CLUBS.slice(0, 4)) await maakPloeg(`${c.sleutel}-D`, c, 'Dames', 'RDA', '14:00')
    for (const c of CLUBS.slice(0, 2)) await maakPloeg(`${c.sleutel}-U14`, c, 'U14', 'U14J', '11:00')
    for (const c of CLUBS.slice(0, 4)) {
      await payload.update({ collection: 'teams', id: ploeg[`${c.sleutel}-H`], data: { koppelMet: ploeg[`${c.sleutel}-D`] } as never, overrideAccess: true })
      await payload.update({ collection: 'teams', id: ploeg[`${c.sleutel}-D`], data: { koppelMet: ploeg[`${c.sleutel}-H`] } as never, overrideAccess: true })
    }
    stap(`${CLUBS.length} clubs en ${Object.keys(ploeg).length} ploegen (heren en dames gekoppeld)`)

    const spelers: Record<string, { id: number; naam: string; nr: number }[]> = {}
    const gebruikt = new Set<string>()
    const naam = (v: boolean) => {
      for (;;) {
        const n = `${kies(v ? VOORNAMEN_V : VOORNAMEN_M)} ${kies(ACHTERNAMEN)}`
        if (!gebruikt.has(n)) {
          gebruikt.add(n)
          return n
        }
      }
    }
    const maakSpeler = async (p: string, n: string, nr: number, extra: Record<string, unknown> = {}) => {
      const [voornaam, ...rest] = n.split(' ')
      const d = await payload.create({
        collection: 'players',
        data: {
          name: n,
          voornaam,
          achternaam: rest.join(' '),
          team: ploeg[p],
          shirtNumber: nr,
          vergunningsstatus: 'geldig',
          medischAttest: true,
          registratieStatus: 'goedgekeurd',
          soortLid: 'speler',
          medischeKeuringOp: new Date(Date.now() - 60 * DAG).toISOString(),
          // U14: 12 jaar op het peiljaar van dit seizoen (lib/age-categories.ts), zodat de regels hen toelaten.
          birthDate: p.endsWith('U14') ? `${startJaar - 11}-03-14` : p.endsWith('D') ? '1999-06-02' : '1996-09-21',
          geslacht: p.endsWith('D') ? 'v' : 'm',
          ...extra,
        } as never,
        overrideAccess: true,
      })
      return { id: Number(d.id), naam: n, nr }
    }
    for (const p of Object.keys(ploeg)) {
      spelers[p] = []
      const aantal = p.endsWith('U14') ? 6 : 7
      for (let i = 1; i <= aantal; i++) {
        const vast = p === 'BA-H' && i === 3 ? 'Jens Aerts' : p === 'SM-U14' && i === 2 ? 'Robbe Peeters' : null
        if (vast) gebruikt.add(vast)
        spelers[p].push(
          await maakSpeler(p, vast ?? naam(p.endsWith('D')), i, p === 'SM-U14' && i === 2 ? { ouderEmail: demoEmail('ouder') } : {}),
        )
      }
    }
    // Wachtrij van de federatie: twee nieuwe leden van Sint-Michiels, ingediend.
    for (const [n, g] of [
      ['Seppe Verhoeven', 'm'],
      ['Febe Cools', 'v'],
    ] as const) {
      const [voornaam, achternaam] = n.split(' ')
      await payload.create({
        collection: 'players',
        data: {
          name: n, voornaam, achternaam, geslacht: g, team: g === 'm' ? ploeg['SM-H'] : ploeg['SM-D'], shirtNumber: g === 'm' ? 21 : 22, soortLid: 'speler', birthDate: '2004-02-11',
          vergunningsstatus: 'geen', registratieStatus: 'ingediend', ingediendOp: new Date(Date.now() - 2 * DAG).toISOString(),
          medischeKeuringOp: new Date(Date.now() - 10 * DAG).toISOString(), email: `${voornaam.toLowerCase()}@voorbeeld.be`,
        } as never,
        overrideAccess: true,
      })
    }
    stap(`${Object.values(spelers).flat().length} spelers, 2 nieuwe leden wachten op de federatie`)

    // ── Officials en demo-accounts ─────────────────────────────────────────────────────────────
    const official: Record<string, number> = {}
    for (const n of ['Karel Fluit', 'Marc Mertens', 'Ilse Claes']) {
      official[n] = Number((await payload.create({ collection: 'officials', data: { name: n, type: 'scheidsrechter' } as never, overrideAccess: true })).id)
    }
    const extra: Record<string, Record<string, unknown>> = {
      federatie: { roles: ['federatie'] },
      clubbeheer: { roles: ['club-beheerder'], club: club.SM },
      'clubbeheer-baasrode': { roles: ['club-beheerder'], club: club.BA },
      coach: { roles: ['club-lid'], club: club.SM, clubFuncties: ['coach'], functieTeams: [ploeg['SM-H']] },
      'coach-baasrode': { roles: ['club-lid'], club: club.BA, clubFuncties: ['coach'], functieTeams: [ploeg['BA-H']] },
      tafel: { roles: ['club-medewerker'], club: club.SM },
      scheidsrechter: { roles: ['scheidsrechter'], official: official['Karel Fluit'] },
      speler: { roles: ['club-lid'], club: club.BA, player: spelers['BA-H'][2].id },
      ouder: { roles: ['viewer'], kinderen: [spelers['SM-U14'][1].id] },
      supporter: { roles: ['viewer'], club: club.SM },
    }
    const gebruiker: Record<string, AuthedUser> = {}
    for (const r of DEMO_ROLLEN) {
      gebruiker[r.sleutel] = (await payload.create({
        collection: 'users',
        data: { email: demoEmail(r.sleutel), password: demoWachtwoord(), name: r.naam, ...(extra[r.sleutel] ?? { roles: ['viewer'] }) } as never,
        overrideAccess: true,
      })) as unknown as AuthedUser
    }
    stap(`${DEMO_ROLLEN.length} demo-accounts, 3 scheidsrechters`)

    // Routes aanroepen zoals de app het doet: met een echte login per rol.
    const token: Record<string, string> = {}
    const jwt = async (rol: string) => {
      if (!token[rol]) token[rol] = String((await payload.login({ collection: 'users', data: { email: demoEmail(rol), password: demoWachtwoord() } })).token)
      return token[rol]
    }
    const roep = async (route: Route, rol: string, id: number, body: unknown, form?: FormData) => {
      const res = await route(
        new Request('http://demo.local/api', {
          method: 'POST',
          headers: { Authorization: `JWT ${await jwt(rol)}`, ...(form ? {} : { 'Content-Type': 'application/json' }) },
          body: form ?? JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: String(id), matchId: String(id) }) },
      )
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) throw new Error(`${rol}: ${String(j.error ?? res.status)}`)
      return j
    }
    const { POST: lineupRoute } = await import('@/app/api/matchsheet/[matchId]/lineup/route')
    const { POST: refereeRoute } = await import('@/app/api/matchsheet/[matchId]/referee/route')
    const { POST: actieRoute } = await import('@/app/api/match/[id]/action/route')
    const { POST: afgelastenRoute } = await import('@/app/api/match/[id]/afgelasten/route')

    // ── Seizoenskalender (planner met koppels), het verleden gespeeld ──────────────────────────
    const vandaag = dateStrBE(new Date())
    const eersteWeekend = shiftDateStr(zaterdagVan(vandaag), -35)
    const weekends = Array.from({ length: 14 }, (_, i) => shiftDateStr(eersteWeekend, i * 7))
    const planPloegen = Object.entries(ploeg)
      .filter(([k]) => !k.endsWith('U14'))
      .map(([k, id]) => ({ id, naam: k, club: club[k.split('-')[0]], reeks: k.endsWith('D') ? 'RDA' : 'RHA', thuisdag: 'za' as const, thuisUur: k.endsWith('D') ? '14:00' : '16:00' }))
    const plan = planKalender(planPloegen, CLUBS.slice(0, 4).map((c) => ({ a: ploeg[`${c.sleutel}-H`], b: ploeg[`${c.sleutel}-D`] })), [], { weekends })
    const officials = Object.values(official)
    const seizoen = (() => {
      const j = Number(vandaag.slice(0, 4))
      return Number(vandaag.slice(5, 7)) >= 7 ? `${j}-${j + 1}` : `${j - 1}-${j}`
    })()
    let gespeeld = 0
    let forfaitGezet = false
    const verleden: number[] = []
    for (const [i, w] of plan.wedstrijden.entries()) {
      const datum = new Date(w.aftrapUtc)
      const voorbij = datum.getTime() < Date.now() - 3 * 3600_000
      const m = await payload.create({
        collection: 'matches',
        data: { reeks: w.reeks, category: 'senioren', homeTeam: w.thuis, awayTeam: w.uit, date: w.aftrapUtc, status: 'scheduled', goalAreaDepth: 10, seizoen } as never,
        overrideAccess: true,
      })
      const thuisSp = spelers[Object.keys(ploeg).find((k) => ploeg[k] === w.thuis)!]
      const uitSp = spelers[Object.keys(ploeg).find((k) => ploeg[k] === w.uit)!]
      const rij = (s: { id: number; nr: number }) => ({ player: s.id, rugnummer: s.nr, deelgenomen: voorbij, ibGecontroleerd: voorbij })
      const blad = await payload.create({
        collection: 'matchsheets',
        data: { match: m.id, assignedReferee: officials[i % officials.length], refereeKm: 18 + (i % 5) * 7, homeLineup: thuisSp.slice(0, 6).map(rij), awayLineup: uitSp.slice(0, 6).map(rij) } as never,
        overrideAccess: true,
      })
      if (!voorbij) continue
      // Eén keer kwam Opwijk niet opdagen: forfait (de thuisploeg wint 30–0, boetevoorstel volgt).
      const forfait = !forfaitGezet && w.uit === ploeg['OP-H']
      if (forfait) forfaitGezet = true
      // Doelpunten met scorers, verdeeld over twee helften.
      const goals: Record<string, unknown>[] = []
      for (const [side, sp, sterkte] of forfait ? ([] as const) : ([
        ['home', thuisSp, 9 + Math.floor(random() * 8)],
        ['away', uitSp, 7 + Math.floor(random() * 8)],
      ] as const)) {
        for (let g = 0; g < sterkte; g++) {
          const s = sp[Math.floor(random() * 6)]
          goals.push({ side, points: random() < 0.25 ? 2 : 1, half: g < sterkte / 2 ? 1 : 2, clock: Math.floor(random() * 1500), ts: datum.getTime() + g * 60_000, scorerId: s.id, scorerNumber: s.nr, scorerName: s.naam })
        }
      }
      await payload.update({
        collection: 'matches',
        id: m.id,
        data: {
          status: 'finished',
          currentHalf: 2,
          clockRunning: false,
          finishedAt: new Date(datum.getTime() + 105 * 60_000).toISOString(),
          simpleScore: { goals: forfait ? Array.from({ length: 30 }, (_, k) => ({ side: 'home', points: 1, half: 1, clock: 0, ts: k })) : goals, crosses: { home: 0, away: 0 } },
        } as never,
        overrideAccess: true,
      })
      const sig = (n: string) => ({ naam: n, akkoord: true, tijdstip: new Date(datum.getTime() + 110 * 60_000).toISOString(), handtekening: 'data:image/png;base64,iVBORw0KGgo=' })
      verleden.push(Number(m.id))
      // Het laatste gespeelde weekend: één blad blijft "af te tekenen" (federatie ziet het, boetevoorstel).
      const nietIngediend = verleden.length === 3
      await payload.update({
        collection: 'matchsheets',
        id: blad.id,
        data: nietIngediend
          ? { status: 'af_te_tekenen' }
          : forfait
            ? { status: 'ingediend', forfait: { uitslag: 'uit', km: 24 }, awayLineup: [], kapiteinThuis: sig(thuisSp[0].naam), scheidsrechter: sig('Karel Fluit'), keuringBevestigd: true }
            : { status: 'ingediend', kapiteinThuis: sig(thuisSp[0].naam), kapiteinUit: sig(uitSp[0].naam), scheidsrechter: sig('Karel Fluit'), keuringBevestigd: true },
        overrideAccess: true,
        context: { [SYSTEEM_STATUS]: true },
      } as never)
      gespeeld++
    }
    stap(`Seizoenskalender: ${plan.wedstrijden.length} wedstrijden over ${weekends.length} weekends, ${gespeeld} al gespeeld (met scorers)`)

    // ── De wedstrijddag van vandaag ────────────────────────────────────────────────────────────
    const nu = Date.now()
    const maakWedstrijd = async (thuis: string, uit: string, reeks: string, datum: number, ref: string) => {
      const m = await payload.create({
        collection: 'matches',
        data: { reeks, category: reeks === 'U14J' ? 'U14' : 'senioren', homeTeam: ploeg[thuis], awayTeam: ploeg[uit], date: new Date(datum).toISOString(), status: 'scheduled', goalAreaDepth: 10, seizoen } as never,
        overrideAccess: true,
      })
      await payload.create({ collection: 'matchsheets', data: { match: m.id, assignedReferee: official[ref], refereeKm: 22 } as never, overrideAccess: true })
      return Number(m.id)
    }
    const selectie = async (rol: string, id: number, side: 'home' | 'away', p: string, n = 6) =>
      roep(lineupRoute as Route, rol, id, { side, players: spelers[p].slice(0, n).map((s) => ({ player: s.id, rugnummer: s.nr })), kapitein: spelers[p][0].id })
    const klaarVoorStart = async (rol: string, id: number) => {
      await roep(refereeRoute as Route, rol, id, { action: 'keuring', keuring: {}, bevestigd: true })
      await roep(refereeRoute as Route, rol, id, { action: 'controle', side: 'home', alle: true })
      await roep(refereeRoute as Route, rol, id, { action: 'controle', side: 'away', alle: true })
      const code = (await payload.find({ collection: 'matchsheets', where: { match: { equals: id } }, limit: 1, overrideAccess: true })).docs[0]?.vrijgaveCode
      await roep(refereeRoute as Route, rol, id, { action: 'wedstrijdstart', akkoord: true, code })
    }

    // 1. Hoofdwedstrijd: beide selecties staan, de scheidsrechter moet nog controleren en vrijgeven.
    const hoofd = await maakWedstrijd('SM-H', 'BA-H', 'RHA', nu + 10 * 60_000, 'Karel Fluit')
    await selectie('coach', hoofd, 'home', 'SM-H', 7)
    await selectie('coach-baasrode', hoofd, 'away', 'BA-H', 7)
    // Baasrode staat in de file: de coach meldt het zelf.
    await aftrapVerschuiven(payload, gebruiker['coach-baasrode'], hoofd, { nieuw: new Date(nu + 25 * 60_000).toISOString(), reden: 'file', toelichting: 'Ongeval op de E17 bij Temse' })
    stap('Hoofdwedstrijd Sint-Michiels – Baasrode: selecties klaar, aftrap 15 min later (file)')

    // 2. Dameswedstrijd later vandaag: de coach moet nog selecteren.
    await maakWedstrijd('SM-D', 'BA-D', 'RDA', nu + 3 * 3600_000, 'Ilse Claes')
    stap('Dames Sint-Michiels – Baasrode: selectie nog te maken')

    // 3. Jeugdwedstrijd die live loopt (tweede helft), aangetekend door de tafel van Sint-Michiels.
    const live = await maakWedstrijd('SM-U14', 'BA-U14', 'U14J', nu - 40 * 60_000, 'Karel Fluit')
    await selectie('tafel', live, 'home', 'SM-U14')
    await selectie('federatie', live, 'away', 'BA-U14')
    await klaarVoorStart('scheidsrechter', live)
    await roep(actieRoute as Route, 'tafel', live, { action: 'simplestart', opId: `demo-start-${live}` })
    await payload.update({ collection: 'matches', id: live, data: { clockRunning: true, clockSeconds: 0, clockUpdatedAt: new Date(nu - 32 * 60_000).toISOString() }, overrideAccess: true })
    const doel = async (side: 'home' | 'away', p: string, k: number, pts: 1 | 2, minGeleden: number) => {
      const s = spelers[p][k]
      await recordSimpleGoal(payload, live, side, pts, { id: s.id, number: s.nr, name: s.naam }, nu - minGeleden * 60_000)
    }
    await doel('home', 'SM-U14', 1, 1, 30)
    await doel('away', 'BA-U14', 0, 1, 27)
    await doel('home', 'SM-U14', 3, 2, 24)
    await doel('home', 'SM-U14', 1, 1, 21)
    await doel('away', 'BA-U14', 2, 1, 19)
    await advanceSimpleHalf(payload, live)
    await payload.update({ collection: 'matches', id: live, data: { clockRunning: true, clockSeconds: 0, clockUpdatedAt: new Date(nu - 9 * 60_000).toISOString() }, overrideAccess: true })
    await doel('away', 'BA-U14', 0, 1, 7)
    await doel('home', 'SM-U14', 4, 1, 4)
    stap('U14 Sint-Michiels – Baasrode loopt live (2e helft), aangetekend door de tafel')

    // 4. Net afgelopen, met een blessure: wacht op aftekenen.
    const af = await maakWedstrijd('ZB-H', 'BA-H', 'RHA', nu - 150 * 60_000, 'Karel Fluit')
    await selectie('federatie', af, 'home', 'ZB-H')
    await selectie('coach-baasrode', af, 'away', 'BA-H')
    await klaarVoorStart('scheidsrechter', af)
    await roep(actieRoute as Route, 'federatie', af, { action: 'simplestart', opId: `demo-start-${af}` })
    // De klok liep al 20 minuten: doelpunten en blessure krijgen een echte minuut.
    await payload.update({ collection: 'matches', id: af, data: { clockRunning: true, clockSeconds: 0, clockUpdatedAt: new Date(nu - 20 * 60_000).toISOString() }, overrideAccess: true })
    let minuut = 19
    for (const [side, p, k] of [
      ['home', 'ZB-H', 0], ['away', 'BA-H', 2], ['home', 'ZB-H', 3], ['away', 'BA-H', 1], ['home', 'ZB-H', 1], ['away', 'BA-H', 4], ['home', 'ZB-H', 0], ['away', 'BA-H', 2],
    ] as const) {
      const s = spelers[p][k]
      await recordSimpleGoal(payload, af, side, 1, { id: s.id, number: s.nr, name: s.naam }, nu - minuut * 60_000)
      minuut -= 2
    }
    await blessureMelden(payload, gebruiker['coach-baasrode'], af, { side: 'away', playerId: spelers['BA-H'][2].id, omschrijving: 'Verzwikte enkel bij de landing na een rugworp' })
    await roep(actieRoute as Route, 'federatie', af, { action: 'finish', opId: `demo-einde-${af}` })
    await volgBladStatus(payload, af).catch(() => null)
    stap('Zandberg – Baasrode afgelopen: blessure van Jens Aerts, wacht op aftekenen')

    // 5. Afgelast door de scheidsrechter, met een foto: de federatie moet herplannen.
    const regen = await maakWedstrijd('LE-D', 'ZB-D', 'RDA', nu + 2 * 3600_000, 'Marc Mertens')
    const fd = new FormData()
    fd.set('reden', 'terrein')
    fd.set('toelichting', 'Plassen op het hele veld, de doelzones staan onder water.')
    fd.append('fotos', await fotoVeld())
    await roep(afgelastenRoute as unknown as Route, 'federatie', regen, null, fd)
    stap('Lebbeke – Zandberg dames afgelast met foto, wacht op een nieuwe datum')

    // ── Verplaatsingsaanvraag: Baasrode vraagt, Sint-Michiels gaat akkoord, de federatie beslist ─
    const toekomst = (await payload.find({
      collection: 'matches',
      where: { and: [{ homeTeam: { equals: ploeg['BA-H'] } }, { status: { equals: 'scheduled' } }, { date: { greater_than: new Date(nu + 3 * DAG).toISOString() } }] },
      sort: 'date',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })).docs[0]
    if (toekomst) {
      const nieuw = new Date(new Date(String(toekomst.date)).getTime() + DAG).toISOString()
      const v = await verplaatsingAanvragen(payload, gebruiker['clubbeheer-baasrode'], Number(toekomst.id), nieuw, 'Terrein bezet door de jaarmarkt van Baasrode')
      if (v.ok && v.id) {
        const tegen = Number(toekomst.awayTeam) === ploeg['SM-H'] ? 'clubbeheer' : null
        if (tegen) await verplaatsingBeantwoorden(payload, gebruiker[tegen], v.id, 'akkoord', 'Geen probleem voor ons')
      }
      stap('Verplaatsingsaanvraag van Baasrode')
    }

    // ── Boetes en kosten ───────────────────────────────────────────────────────────────────────
    await payload.updateGlobal({ slug: 'settings', data: { scheidsrechterKostenBetaler: 'thuisclub', forfaitKostenBetaler: 'forfaitploeg' } as never, overrideAccess: true })
    for (const s of [
      { naam: 'Forfait', artikel: 'HR art. 21', bedrag: 50, trigger: 'forfait' },
      { naam: 'Wedstrijdblad niet tijdig ingediend', artikel: 'HR art. 34', bedrag: 15, trigger: 'blad_te_laat', termijnDagen: 2 },
      { naam: 'Te late aftrap door de ploeg', artikel: 'HR art. 18', bedrag: 20, trigger: 'te_laat', termijnDagen: 10 },
      { naam: 'Geen terreinafgevaardigde', artikel: 'HR art. 12', bedrag: 25, trigger: 'geen' },
    ]) {
      await payload.create({ collection: 'boete-soorten', data: { ...s, actief: true } as never, overrideAccess: true })
    }
    await boeteVoorstellen(payload)
    await boeteManueel(payload, { club: club.SM, omschrijving: 'Geen terreinafgevaardigde (vorige thuiswedstrijd)', bedrag: 25 })
    const voorstel = (await payload.find({ collection: 'boetes', where: { status: { equals: 'voorstel' } }, limit: 1, overrideAccess: true })).docs[0]
    if (voorstel) await boeteBehandelen(payload, Number(voorstel.id), 'opleggen')
    stap('Boetelijst ingevuld, voorstellen gemaakt, twee boetes opgelegd')

    // ── Inschrijvingen voor volgend seizoen ────────────────────────────────────────────────────
    const jaar = Number(seizoen.slice(0, 4)) + 1
    const ronde = await payload.create({
      collection: 'inschrijvingsrondes',
      data: {
        seizoen: `${jaar}-${jaar + 1}`,
        deadline: new Date(nu + 12 * DAG).toISOString(),
        status: 'open',
        eersteWeekend: zaterdagVan(`${jaar}-09-06`),
        laatsteWeekend: zaterdagVan(`${jaar + 1}-03-14`),
        vrijeWeekends: [
          { weekend: zaterdagVan(`${jaar}-12-27`), reden: 'Kerstvakantie' },
          { weekend: zaterdagVan(`${jaar + 1}-01-03`), reden: 'Kerstvakantie' },
        ],
        toelichting: 'Schrijf jullie ploegen in en geef jullie wensen door. Koppel heren en dames als jullie samen op verplaatsing willen.',
      } as never,
      overrideAccess: true,
    })
    const inschrijf = async (rol: string, c: (typeof CLUBS)[number], indienen: boolean, kermis?: string) => {
      const kort = c.naam.replace(/^(KBC|KC|KBK) /, '').replace(/ (KBC|KC)$/, '')
      await inschrijvingOpslaan(payload, gebruiker[rol] ?? gebruiker.federatie, Number(ronde.id), club[c.sleutel], {
        ploegen: [
          { team: ploeg[`${c.sleutel}-H`], naam: `${kort} Heren`, reeks: 'RHA', thuisdag: 'za', thuisUur: '16:00', koppelMet: ploeg[`${c.sleutel}-D`] ? `${kort} Dames` : null },
          ...(ploeg[`${c.sleutel}-D`] ? [{ team: ploeg[`${c.sleutel}-D`], naam: `${kort} Dames`, reeks: 'RDA', thuisdag: 'za' as const, thuisUur: '14:00' }] : []),
        ],
        aantalVelden: 1,
        onbeschikbaar: kermis ? [{ weekend: kermis, reden: 'Kermis', hard: true }] : [],
        wensen: null,
      }, indienen)
    }
    await inschrijf('clubbeheer-baasrode', CLUBS[1], true, zaterdagVan(`${jaar}-09-20`))
    await inschrijf('federatie', CLUBS[2], true)
    await inschrijf('federatie', CLUBS[3], false)
    stap('Inschrijvingen volgend seizoen open: Baasrode en Zandberg ingediend, Lebbeke in concept')

    // ── Medische kaart door de ouder ───────────────────────────────────────────────────────────
    await kaartAanvragen(payload, gebruiker.ouder, spelers['SM-U14'][1].id).catch(() => null)
    stap('Medische kaart aangevraagd door de ouder van Robbe Peeters')

    // ── Referendum: open stemronde, de demo-speler mag stemmen ─────────────────────────────────
    stap(await demoReferendumKlaarzetten(payload))

    return { ok: true, stappen, duurMs: Date.now() - begin }
  } catch (e) {
    return { ok: false, stappen, fout: e instanceof Error ? e.message : String(e), duurMs: Date.now() - begin }
  }
}

/** De sleutelwedstrijden van het draaiboek, terug te vinden zonder ze op te slaan. */
export async function demoWedstrijden(payload: Payload) {
  const ploeg = async (naam: string) => (await payload.find({ collection: 'teams', where: { name: { equals: naam } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]?.id
  const vandaag = dateStrBE(new Date())
  const zoek = async (thuis: string, uit: string) => {
    const [h, a] = [await ploeg(thuis), await ploeg(uit)]
    if (h == null || a == null) return null
    const res = await payload.find({ collection: 'matches', where: { and: [{ homeTeam: { equals: h } }, { awayTeam: { equals: a } }] }, sort: '-date', limit: 5, depth: 0, overrideAccess: true })
    const m = res.docs.find((d) => dateStrBE(new Date(String(d.date))) === vandaag) ?? null
    return m ? Number(m.id) : null
  }
  return {
    hoofd: await zoek('Sint-Michiels Heren', 'Baasrode Heren'),
    dames: await zoek('Sint-Michiels Dames', 'Baasrode Dames'),
    live: await zoek('Sint-Michiels U14', 'Baasrode U14'),
    afgelopen: await zoek('Zandberg Heren', 'Baasrode Heren'),
    afgelast: await zoek('Lebbeke Dames', 'Zandberg Dames'),
  }
}
