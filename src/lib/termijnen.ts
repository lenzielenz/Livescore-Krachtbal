import type { Payload } from 'payload'

import { accountsVanSpeler, clubStaf, federatieAccounts, meldEenmalig } from './meldingen'
import { boeteVoorstellen } from './boetes'
import { brusselsParts, dateStrBE, formatDateBE, shiftDateStr } from './datetime'
import { KEURING_WAARSCHUW_DAGEN, keuringDagen, keuringWhere } from './leden-register'
import { ploegenEnClubs } from './leden-register-server'
import { ONGEVAL_TERMIJN_DAGEN } from './federatie-aanvragen'
import { aanleidingenVanBlad, scheidsrechterAccounts } from './sr-rapport'
import { isWerkdag } from './voorbehoud'
import { vervallenFacturen } from './facturatie-server'
import { lidmaatschappenBijwerken } from './lidmaatschap'
import { formatEuro } from './vergoeding'

// De dagelijkse ronde langs de termijnen van het reglement (aangeroepen door /api/cron/recap, elke
// ochtend). Niets hier beslist iets: de termijnen zelf staan al op het bord (deadlineAuto) en de
// boetes komen uit lib/boetes.ts. Dit zorgt enkel dat wie aan zet is het op tijd hoort, één keer
// (meldEenmalig, met een sleutel per herinnering), en dat de boetevoorstellen er elke dag staan — ook
// als niemand de boetepagina opent.
//
//   · voorbehoud (item 25): op de laatste werkdag om te bekrachtigen → de club;
//   · ongeval (item 41): vanaf dag 6 van de 8 zonder documenten → de speler (of ouder) en de club;
//   · scheidsrechtersrapport (item 27): blad met voorbehoud/uitsluiting/forfait ter plaatse, ingediend
//     en na 1 werkdag nog geen rapport → de scheidsrechter; na 3 werkdagen → ook de federatie;
//   · uitlening (item 45): 3 dagen na het opstellen nog niet getekend door de ontvangende club → die club;
//   · medische keuring: verloopt binnen 30 dagen of is verlopen → één lijst per club per week, en het lid
//     (of de ouder) één keer per keuring.

const DAG = 86_400_000

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const ploegNaam = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '?') : '?')

/** Puur: hoeveel werkdagen liggen er tussen twee momenten (de dag van `van` niet meegeteld)? */
export function werkdagenTussen(van: Date, tot: Date): number {
  let dag = dateStrBE(van)
  const eind = dateStrBE(tot)
  let n = 0
  for (let i = 0; i < 400 && dag < eind; i++) {
    const t = new Date(`${dag}T12:00:00Z`)
    dag = dateStrBE(new Date(t.getTime() + DAG))
    if (isWerkdag(dag)) n++
  }
  return n
}

export type TermijnRonde = { boetes: number; voorbehoud: number; ongeval: number; rapport: number; uitlening: number; keuring: number; facturen: number }

export async function dagelijkseTermijnen(payload: Payload, nu: Date = new Date()): Promise<TermijnRonde> {
  const uit: TermijnRonde = { boetes: 0, voorbehoud: 0, ongeval: 0, rapport: 0, uitlening: 0, keuring: 0, facturen: 0 }
  const vandaag = dateStrBE(nu)

  uit.boetes = await boeteVoorstellen(payload, 120, nu.getTime()).catch(() => 0)

  // Voorbehoud: vandaag is de laatste dag om te bekrachtigen.
  const vb = await payload.find({ collection: 'klachten', where: { status: { equals: 'te_bekrachtigen' } }, depth: 2, limit: 200, overrideAccess: true })
  for (const k of vb.docs) {
    if (!k.bekrachtigTegen || dateStrBE(new Date(String(k.bekrachtigTegen))) !== vandaag) continue
    const m = (k.match ?? {}) as { homeTeam?: unknown; awayTeam?: unknown; id?: unknown }
    const n = await meldEenmalig(payload, await clubStaf(payload, relId(k.club)), {
      sleutel: `herinnering:voorbehoud:${k.id}`,
      titel: `⏰ Vandaag de laatste dag: voorbehoud ${ploegNaam(m.homeTeam)} – ${ploegNaam(m.awayTeam)}`,
      tekst: 'Bekrachtig het voorbehoud vandaag met een uitgebreid relaas, of zie ervan af. Anders volgen 75 euro administratieve kosten (RCVK item 25).',
      url: `/aftekenen/${relId(k.match) ?? ''}`,
    })
    if (n) uit.voorbehoud++
  }

  // Ongeval: dag 6 van de 8 en de documenten zijn er nog niet.
  const ong = await payload.find({ collection: 'accidents', where: { status: { equals: 'gemeld' } }, depth: 0, limit: 300, overrideAccess: true })
  for (const a of ong.docs as unknown as Record<string, unknown>[]) {
    const op = new Date(String(a.ongevalDatum ?? a.createdAt ?? ''))
    if (!Number.isFinite(op.getTime())) continue
    const dagen = (nu.getTime() - op.getTime()) / DAG
    if (dagen < ONGEVAL_TERMIJN_DAGEN - 2 || dagen >= ONGEVAL_TERMIJN_DAGEN) continue
    const speler = relId(a.player)
    const tegen = formatDateBE(new Date(op.getTime() + ONGEVAL_TERMIJN_DAGEN * DAG).toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })
    const n = await meldEenmalig(payload, [...(speler != null ? await accountsVanSpeler(payload, speler) : []), ...(await clubStaf(payload, relId(a.club)))], {
      sleutel: `herinnering:ongeval:${String(a.id)}`,
      titel: '⏰ Ongevalsaangifte: nog twee dagen',
      tekst: `De aangifte en het geneeskundig getuigschrift moeten tegen ${tegen} bij de federatie zijn (RCVK item 41). Zonder die documenten komt de verzekering niet tussen.`,
      url: '/ongevallen',
    })
    if (n) uit.ongeval++
  }

  // Scheidsrechtersrapport: ingediend blad dat een rapport vraagt, zonder rapport.
  const sinds = new Date(nu.getTime() - 30 * DAG).toISOString()
  const bladen = await payload.find({
    collection: 'matchsheets',
    where: { and: [{ status: { equals: 'ingediend' } }, { updatedAt: { greater_than_equal: sinds } }] },
    depth: 0,
    limit: 500,
    overrideAccess: true,
  })
  for (const s of bladen.docs as unknown as Record<string, unknown>[]) {
    const redenen = aanleidingenVanBlad(s as Parameters<typeof aanleidingenVanBlad>[0])
    if (!redenen.length) continue
    const matchId = relId(s.match)
    if (matchId == null) continue
    const wd = werkdagenTussen(new Date(String(s.updatedAt)), nu)
    if (wd < 1) continue
    const al = await payload.count({ collection: 'sr-rapporten', where: { match: { equals: matchId } }, overrideAccess: true })
    if (al.totalDocs) continue
    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
    const titel = match ? `${ploegNaam(match.homeTeam)} – ${ploegNaam(match.awayTeam)}` : `wedstrijd ${matchId}`
    const n = await meldEenmalig(payload, await scheidsrechterAccounts(payload, s), {
      sleutel: `herinnering:rapport:${matchId}`,
      titel: `⏰ Scheidsrechtersrapport nog op te maken: ${titel}`,
      tekst: 'Op het blad staat een voorbehoud, uitsluiting of forfait ter plaatse. Maak het rapport op voor het scheidsrechterscomité (RCVK item 27).',
      url: `/scheidsrechter/${matchId}`,
    })
    if (n) uit.rapport++
    if (wd >= 3) {
      const f = await meldEenmalig(payload, await federatieAccounts(payload), {
        sleutel: `herinnering:rapport-federatie:${matchId}`,
        titel: `🧑‍⚖️ Nog geen scheidsrechtersrapport: ${titel}`,
        tekst: 'Drie werkdagen na het indienen van het blad ontbreekt het rapport nog. De scheidsrechter kreeg al een herinnering.',
        url: `/match/${matchId}`,
      })
      if (f) uit.rapport++
    }
  }

  // Uitlening: drie dagen na het opstellen nog niet getekend door de ontvangende club.
  const grens = new Date(nu.getTime() - 3 * DAG).toISOString()
  const uitl = await payload.find({
    collection: 'uitleningen',
    where: { and: [{ status: { equals: 'wacht_ontvanger' } }, { createdAt: { less_than_equal: grens } }] },
    depth: 0,
    limit: 200,
    overrideAccess: true,
  })
  for (const u of uitl.docs) {
    const n = await meldEenmalig(payload, await clubStaf(payload, relId(u.naarClub)), {
      sleutel: `herinnering:uitlening:${u.id}`,
      titel: `⏰ Uitlening wacht op uw handtekening: ${String(u.spelerNaam)}`,
      tekst: `De overeenkomst voor ${String(u.competitie ?? u.seizoen)} is ondertekend door de uitlenende club. Pas als u tekent, kan de federatie ze bevestigen.`,
      url: '/club/uitleningen',
    })
    if (n) uit.uitlening++
  }

  uit.keuring = await keuringHerinneringen(payload, nu)
  uit.facturen = await factuurHerinneringen(payload, nu).catch(() => 0)
  // Wie vandaag aangesloten is, in de lidmaatschappen (verzekerdenlijst) van dit seizoen.
  await lidmaatschappenBijwerken(payload, nu).catch(() => null)
  return uit
}

/** Maandag van de week (Belgische kalender), als sleutel voor de wekelijkse clublijst. */
export function weekVan(nu: Date): string {
  return shiftDateStr(dateStrBE(nu), -brusselsParts(nu).weekdayMon0)
}

async function keuringHerinneringen(payload: Payload, nu: Date): Promise<number> {
  const res = await payload.db.find<{ id: number; name?: string | null; team?: unknown; medischeKeuringOp?: string | null; soortLid?: string | null; actief?: boolean | null }>({
    collection: 'players',
    where: { and: [{ analyseOnly: { not_equals: true } }, { or: [keuringWhere('verloopt', nu), keuringWhere('verlopen', nu)] }] },
    limit: 0,
    pagination: false,
    select: { name: true, team: true, medischeKeuringOp: true, soortLid: true, actief: true },
  })
  if (!res.docs.length) return 0
  const pc = await ploegenEnClubs(payload)
  const perClub = new Map<number, string[]>()
  let n = 0
  for (const p of res.docs) {
    const d = keuringDagen(p, nu)
    if (d == null) continue
    const club = pc.clubVanPloeg.get(relId(p.team) ?? -1)
    const regel = `${String(p.name ?? '')} — ${d < 0 ? `verlopen sinds ${formatDateBE(new Date(nu.getTime() + d * DAG).toISOString())}` : `verloopt ${d === 0 ? 'vandaag' : `over ${d} dagen`}`}`
    if (club != null) perClub.set(club, [...(perClub.get(club) ?? []), regel])
    // Het lid (of de ouder): één keer per keuring, zolang ze nog niet verlopen is of net verlopen is.
    if (d >= -KEURING_WAARSCHUW_DAGEN) {
      const aan = await accountsVanSpeler(payload, Number(p.id))
      const k = await meldEenmalig(payload, aan, {
        sleutel: `herinnering:keuring-lid:${p.id}:${String(p.medischeKeuringOp).slice(0, 10)}`,
        titel: d < 0 ? '🩺 Je medische keuring is verlopen' : '🩺 Je medische keuring verloopt binnenkort',
        tekst: `${String(p.name ?? '')}: ${d < 0 ? 'de keuring is verlopen' : `nog ${d} dagen geldig`}. Laat je opnieuw keuren en geef het nieuwe attest aan je club (of laad het zelf op).`,
        url: '/profiel',
      })
      if (k) n++
    }
  }
  const week = weekVan(nu)
  for (const [club, regels] of perClub) {
    const k = await meldEenmalig(payload, await clubStaf(payload, club), {
      sleutel: `herinnering:keuring-club:${club}:${week}`,
      titel: `🩺 ${regels.length} medische keuring${regels.length === 1 ? '' : 'en'} (bijna) verlopen`,
      tekst: [...regels.slice(0, 40), ...(regels.length > 40 ? [`… en nog ${regels.length - 40}`] : [])].join('\n'),
      url: '/club/leden',
    })
    if (k) n++
  }
  return n
}

/** Vervallen facturen: de club één keer per week een herinnering, met wat er open staat. */
async function factuurHerinneringen(payload: Payload, nu: Date): Promise<number> {
  const vervallen = await vervallenFacturen(payload, nu)
  const perClub = new Map<number, typeof vervallen>()
  for (const f of vervallen) perClub.set(f.club.id, [...(perClub.get(f.club.id) ?? []), f])
  const week = weekVan(nu)
  let n = 0
  for (const [club, lijst] of perClub) {
    const open = lijst.reduce((t, f) => t + f.beeld.open, 0)
    const k = await meldEenmalig(payload, await clubStaf(payload, club), {
      sleutel: `herinnering:facturen:${club}:${week}`,
      titel: `🧾 ${lijst.length === 1 ? 'Een factuur is' : `${lijst.length} facturen zijn`} vervallen`,
      tekst: `Nog te betalen: ${formatEuro(open)} (${lijst.map((f) => `${f.nummer}, mededeling ${f.ogm}`).join('; ')}).`,
      url: '/club/facturen',
    })
    if (k) n++
  }
  return n
}
