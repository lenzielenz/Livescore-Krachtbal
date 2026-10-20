import type { Payload } from 'payload'

import { maakKalender } from './kalender-generator'
import { meld } from './meldingen'
import { buildReeksStandings } from './reeks-standings'
import { EINDRONDE_REEKS, reeksRang } from './reeksen'
import { seasonFromDate } from './seasons'
import { dateStrBE, shiftDateStr } from './datetime'

// Het reglement als bron van hoe alles werkt. De federatie zet de regels uit het reglement en de
// verslagen als bouwstenen (collections/Reglement.ts → competitieregels); deze module voert ze uit.
// Zonder bouwsteen gebeurt er niets: het systeem verzint geen regels.
//
//  - vastspelen: wie in een hogere ploeg van zijn club meespeelt, krijgt een "knipje". Na het
//    maximum (bv. 3) zit hij vast in die hogere reeks en mag hij niet meer lager spelen.
//  - eindronde: zodra de bronreeksen uitgespeeld zijn, gaan de besten per reeks door naar een
//    nieuwe reeks met eigen kalender. Het systeem maakt die zelf aan.

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

// ─── Vastspelen ─────────────────────────────────────────────────────────────

export type VastRegel = { id: number; naam: string; max: number; categorie: string; bron: string }
export type HogerTeller = { teamId: number; reeks: string; keer: number }
export type VastStatus = { max: number; hoger: HogerTeller[]; vastIn: HogerTeller | null }

/** De actieve vastspeel-regel voor deze categorie (of null: dan telt er niets). */
export async function vastRegel(payload: Payload, categorie: string): Promise<VastRegel | null> {
  const res = await payload.find({
    collection: 'competitieregels',
    where: { and: [{ soort: { equals: 'vastspelen' } }, { actief: { equals: true } }] },
    depth: 1,
    limit: 20,
    overrideAccess: true,
  })
  const r = res.docs.find((d) => d.categorie === categorie) ?? res.docs.find((d) => !d.categorie || d.categorie === 'alle')
  if (!r || !r.maxKeerHoger) return null
  return { id: Number(r.id), naam: String(r.naam), max: Number(r.maxKeerHoger), categorie: String(r.categorie ?? 'alle'), bron: bronTekst(r) }
}

export function bronTekst(r: { reglement?: unknown; verslag?: unknown; artikel?: unknown }): string {
  const titel = (v: unknown) => (v && typeof v === 'object' ? String((v as { titel?: unknown }).titel ?? '') : '')
  return [titel(r.reglement) || titel(r.verslag), r.artikel ? String(r.artikel) : ''].filter(Boolean).join(', ')
}

/**
 * Zit een speler vast? Pure regel: de hoogste reeks waarin hij minstens `max` keer speelde. Bij een
 * gelijk aantal telt de hoogste reeks (laagste rang).
 */
export function vastStatus(hoger: HogerTeller[], max: number): VastStatus {
  const vast = hoger
    .filter((h) => h.keer >= max)
    .sort((a, b) => (reeksRang(a.reeks) ?? 99) - (reeksRang(b.reeks) ?? 99))[0]
  return { max, hoger: [...hoger].sort((a, b) => b.keer - a.keer), vastIn: vast ?? null }
}

/**
 * Wat betekent het vastspelen voor deze speler in de ploeg van `team`? Geblokkeerd als hij vast zit
 * in een hogere reeks dan deze ploeg; een waarschuwing als hij hier hoger speelt en zijn teller
 * oploopt (met wat er na deze wedstrijd gebeurt).
 */
export function vastspelenOordeel(
  status: VastStatus | null,
  eigenReeks: string | null,
  team: { id: number; reeks: string | null },
): { level: 'ok' | 'warn' | 'block'; reden?: string } {
  if (!status) return { level: 'ok' }
  const hier = reeksRang(team.reeks)
  if (status.vastIn && status.vastIn.teamId !== team.id) {
    const vastRang = reeksRang(status.vastIn.reeks)
    if (vastRang != null && hier != null && hier > vastRang) {
      return { level: 'block', reden: `Vastgespeeld in ${status.vastIn.reeks} (${status.vastIn.keer}× hoger) — mag niet meer lager spelen.` }
    }
  }
  const eigen = reeksRang(eigenReeks)
  if (hier != null && eigen != null && hier < eigen) {
    const keer = status.hoger.find((h) => h.teamId === team.id)?.keer ?? 0
    if (keer >= status.max) return { level: 'ok' }
    const na = keer + 1
    return {
      level: 'warn',
      reden:
        na >= status.max
          ? `Speelt hoger: dit wordt keer ${na} van ${status.max} — daarna zit hij vast in ${team.reeks}.`
          : `Speelt hoger: dit wordt keer ${na} van ${status.max} in ${team.reeks}.`,
    }
  }
  return { level: 'ok' }
}

/**
 * Tel per speler van deze club hoe vaak hij dit seizoen meespeelde in een HOGERE ploeg van de club
 * (zelfde categorie). Uit de wedstrijdbladen: bevestigde deelname, of — zonder bevestiging op dat
 * blad — de selectie van de coach.
 */
export async function vastspelenVoorClub(payload: Payload, clubId: number, seizoen: string = seasonFromDate(new Date())): Promise<Map<number, VastStatus>> {
  const uit = new Map<number, VastStatus>()
  const ploegen = await payload.find({ collection: 'teams', where: { and: [{ club: { equals: clubId } }, { analyseOnly: { not_equals: true } }] }, depth: 0, limit: 100, overrideAccess: true })
  if (ploegen.docs.length < 2) return uit
  const ploeg = new Map(ploegen.docs.map((t) => [Number(t.id), { reeks: String(t.reeks ?? ''), categorie: String(t.category ?? 'senioren') }]))
  const regels = new Map<string, VastRegel | null>()
  for (const cat of new Set([...ploeg.values()].map((p) => p.categorie))) regels.set(cat, await vastRegel(payload, cat))
  if (![...regels.values()].some(Boolean)) return uit

  const spelers = await payload.find({ collection: 'players', where: { team: { in: [...ploeg.keys()] } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true })
  const eigenPloeg = new Map(spelers.docs.map((p) => [Number(p.id), relId(p.team)]))
  const matches = await payload.find({
    collection: 'matches',
    where: { and: [{ seizoen: { equals: seizoen } }, { or: [{ homeTeam: { in: [...ploeg.keys()] } }, { awayTeam: { in: [...ploeg.keys()] } }] }] },
    depth: 0,
    limit: 2000,
    pagination: false,
    overrideAccess: true,
  })
  if (!matches.docs.length) return uit
  const bladen = await payload.find({ collection: 'matchsheets', where: { match: { in: matches.docs.map((m) => m.id) } }, depth: 0, limit: 2000, pagination: false, overrideAccess: true })
  const matchVan = new Map(matches.docs.map((m) => [Number(m.id), m]))

  const teller = new Map<number, Map<number, number>>()
  for (const b of bladen.docs) {
    const m = matchVan.get(relId(b.match) ?? -1)
    if (!m) continue
    for (const [kant, team] of [
      [b.homeLineup, relId(m.homeTeam)],
      [b.awayLineup, relId(m.awayTeam)],
    ] as const) {
      if (team == null || !ploeg.has(team)) continue
      const rijen = (Array.isArray(kant) ? kant : []) as { player?: unknown; deelgenomen?: boolean | null }[]
      const bevestigd = rijen.some((r) => r.deelgenomen)
      for (const r of rijen) {
        const sp = relId(r.player)
        if (sp == null || (bevestigd && !r.deelgenomen)) continue
        const eigen = eigenPloeg.get(sp)
        if (eigen == null || eigen === team) continue
        const er = reeksRang(ploeg.get(eigen)?.reeks)
        const hr = reeksRang(ploeg.get(team)?.reeks)
        if (er == null || hr == null || hr >= er || ploeg.get(eigen)?.categorie !== ploeg.get(team)?.categorie) continue
        const t = teller.get(sp) ?? new Map<number, number>()
        t.set(team, (t.get(team) ?? 0) + 1)
        teller.set(sp, t)
      }
    }
  }
  for (const [sp, eigen] of eigenPloeg) {
    const regel = eigen != null ? regels.get(ploeg.get(eigen)?.categorie ?? '') : null
    if (!regel) continue
    const hoger = [...(teller.get(sp) ?? new Map()).entries()].map(([teamId, keer]) => ({ teamId, reeks: ploeg.get(teamId)?.reeks ?? '', keer }))
    uit.set(sp, vastStatus(hoger, regel.max))
  }
  return uit
}

// ─── Eindronde ──────────────────────────────────────────────────────────────

export type EindrondeStatus = {
  regelId: number
  naam: string
  seizoen: string
  klaar: boolean
  resterend: number
  doorgaan: { teamId: number; reeks: string; plaats: number }[]
  bestaat: number | null
}

type RegelDoc = {
  id: number
  naam?: string | null
  eindrondeNaam?: string | null
  bronReeksen?: string[] | null
  topPerReeks?: number | null
  heenEnTerug?: boolean | null
  dagenNaEinde?: number | null
}

/** Staat een eindronde klaar om te beginnen? Wie gaat door? Bestaat ze al? */
export async function eindrondeStatus(payload: Payload, regel: RegelDoc, seizoen: string = seasonFromDate(new Date())): Promise<EindrondeStatus> {
  const top = Math.max(1, Number(regel.topPerReeks) || 4)
  let resterend = 0
  let gespeeld = 0
  const doorgaan: EindrondeStatus['doorgaan'] = []
  for (const reeks of regel.bronReeksen ?? []) {
    const { standings, remaining } = await buildReeksStandings(payload, reeks)
    resterend += [...remaining.values()].reduce((a, b) => a + b, 0) / 2
    gespeeld += standings.reduce((a, r) => a + r.played, 0)
    standings.slice(0, top).forEach((r, i) => doorgaan.push({ teamId: r.teamId, reeks, plaats: i + 1 }))
  }
  const bestaat = await payload.find({
    collection: 'eindrondes',
    where: { and: [{ regel: { equals: regel.id } }, { seizoen: { equals: seizoen } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return {
    regelId: regel.id,
    naam: String(regel.eindrondeNaam || regel.naam || 'Eindronde'),
    seizoen,
    klaar: (regel.bronReeksen ?? []).length > 0 && resterend === 0 && gespeeld > 0 && doorgaan.length >= 2,
    resterend: Math.round(resterend),
    doorgaan,
    bestaat: bestaat.docs[0] ? Number(bestaat.docs[0].id) : null,
  }
}

/**
 * Maak de eindronde aan: de ploegen die doorgaan, en hun kalender (round robin, heen of heen en
 * terug). Eerste speeldag = `dagenNaEinde` na de laatste gespeelde wedstrijd van de bronreeksen.
 * Doet niets als ze al bestaat of nog niet klaar is (tenzij `forceer`).
 */
export async function maakEindronde(payload: Payload, regel: RegelDoc, opts: { seizoen?: string; start?: string; forceer?: boolean } = {}): Promise<{ id: number; wedstrijden: number } | null> {
  const st = await eindrondeStatus(payload, regel, opts.seizoen)
  if (st.bestaat || (!st.klaar && !opts.forceer) || st.doorgaan.length < 2) return null
  const teamIds = st.doorgaan.map((d) => d.teamId)
  const teams = await payload.find({ collection: 'teams', where: { id: { in: teamIds } }, depth: 0, limit: teamIds.length, overrideAccess: true })
  const categorie = String(teams.docs[0]?.category ?? 'senioren')

  let start = opts.start
  if (!start) {
    const laatste = await payload.find({
      collection: 'matches',
      where: { reeks: { in: regel.bronReeksen ?? [] } },
      sort: '-date',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const basis = laatste.docs[0]?.date ? dateStrBE(new Date(String(laatste.docs[0].date))) : dateStrBE()
    start = shiftDateStr(basis, Math.max(1, Number(regel.dagenNaEinde) || 7))
  }
  const kalender = maakKalender(
    teams.docs.map((t) => ({ id: Number(t.id), naam: String(t.name ?? ''), thuisUur: (t.thuisUur as string | null) ?? null })),
    { start, enkelHeen: !regel.heenEnTerug },
  )
  const er = await payload.create({
    collection: 'eindrondes',
    data: { naam: st.naam, seizoen: st.seizoen, regel: regel.id, categorie: categorie as never, ploegen: teamIds },
    overrideAccess: true,
  })
  for (const w of kalender) {
    await payload.create({
      collection: 'matches',
      data: {
        reeks: EINDRONDE_REEKS as never,
        eindronde: er.id,
        category: categorie as never,
        seizoen: st.seizoen,
        homeTeam: w.thuis,
        awayTeam: w.uit,
        date: w.aftrapUtc,
        status: 'scheduled',
        goalAreaDepth: 10,
      },
      overrideAccess: true,
    })
  }
  return { id: Number(er.id), wedstrijden: kalender.length }
}

/**
 * Na elke afgelopen wedstrijd: zijn er eindrondes die nu kunnen beginnen? Die maakt het systeem
 * zelf aan, en de federatie krijgt een melding om de kalender na te kijken (verplaatsen kan altijd).
 */
export async function controleerEindrondes(payload: Payload): Promise<number> {
  const regels = await payload.find({
    collection: 'competitieregels',
    where: { and: [{ soort: { equals: 'eindronde' } }, { actief: { equals: true } }] },
    depth: 0,
    limit: 50,
    overrideAccess: true,
  })
  let gemaakt = 0
  for (const r of regels.docs) {
    const res = await maakEindronde(payload, r as unknown as RegelDoc).catch((err) => {
      console.error(`[eindronde] "${String(r.naam)}" kon niet aangemaakt worden:`, (err as Error).message)
      return null
    })
    if (!res) continue
    gemaakt += 1
    const fed = await payload.find({ collection: 'users', where: { or: [{ roles: { contains: 'federatie' } }, { roles: { contains: 'admin' } }] }, depth: 0, limit: 50, overrideAccess: true })
    await meld(payload, fed.docs.map((u) => Number(u.id)), {
      titel: `🏁 ${String(r.eindrondeNaam || r.naam)} aangemaakt`,
      tekst: `${res.wedstrijden} wedstrijden volgens de regel "${String(r.naam)}". Kijk de kalender na.`,
      url: `/eindronde/${res.id}`,
    })
  }
  return gemaakt
}

/** Korte tekst voor de speler, de club en de spelerspagina: "🔒 vast in 1NAH" of "🎟️ 2/3× hoger in 1NAH". */
export function knipjesTekst(status: VastStatus | null | undefined): string | null {
  if (!status) return null
  if (status.vastIn) return `🔒 Vastgespeeld in ${status.vastIn.reeks} (${status.vastIn.keer}× hoger gespeeld)`
  const hoogste = status.hoger[0]
  if (!hoogste) return `🎟️ Nog niet hoger gespeeld (vast na ${status.max}×)`
  const nog = status.max - hoogste.keer
  return `🎟️ ${hoogste.keer}/${status.max}× hoger in ${hoogste.reeks} — nog ${nog} ${nog === 1 ? 'keer' : 'keer'}, dan vast`
}
