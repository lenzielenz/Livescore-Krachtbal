import type { Payload } from 'payload'

import { accountsVanSpeler, clubStaf, federatieAccounts, meldEenmalig } from './meldingen'
import { boeteVoorstellen } from './boetes'
import { dateStrBE, formatDateBE } from './datetime'
import { ONGEVAL_TERMIJN_DAGEN } from './federatie-aanvragen'
import { aanleidingenVanBlad, scheidsrechterAccounts } from './sr-rapport'
import { isWerkdag } from './voorbehoud'

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
//   · uitlening (item 45): 3 dagen na het opstellen nog niet getekend door de ontvangende club → die club.

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

export type TermijnRonde = { boetes: number; voorbehoud: number; ongeval: number; rapport: number; uitlening: number }

export async function dagelijkseTermijnen(payload: Payload, nu: Date = new Date()): Promise<TermijnRonde> {
  const uit: TermijnRonde = { boetes: 0, voorbehoud: 0, ongeval: 0, rapport: 0, uitlening: 0 }
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

  return uit
}
