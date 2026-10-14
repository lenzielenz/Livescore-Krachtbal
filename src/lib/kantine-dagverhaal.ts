// Het verhaal achter elke uitslag, voor het dagverloop op het kantinescherm.
//
// Een eindstand vertelt wie won, niet HOE. Daarvoor bestaan al losse bouwstenen: het automatische
// krantenverslag (match-report.ts), het scoreverloop (match-momentum.ts), de berichten en reacties
// uit de live tribune, de stemmen voor de held van de match. Deze module legt ze per wedstrijd
// samen tot één verhaal, en vat de hele dag samen in een handvol cijfers.
//
// Puur: geen database, geen tijd. Alles wordt AFGELEID uit wat er al ligt (event-sourcing: de
// doelpunten blijven de enige bron van waarheid); er wordt niets opgeslagen. De route
// /api/kantine/dag haalt de ruwe data op en roept dit aan.

import type { TeamSide } from './krachtbal-rules'
import type { TimelineItem } from './match-engine'
import { buildMomentum } from './match-momentum'
import { buildMatchReport, longestRun, scorerLines, type ReportGoal } from './match-report'

/** Eén punt van de golf: doorlopende matchtijd (s) en het verschil thuis − uit. */
export type GolfPunt = { t: number; diff: number }

export type WedstrijdVerhaal = {
  matchId: number
  /** Krantenkop uit het automatische verslag. */
  kop: string
  /** Hoe het verliep, in een paar zinnen (de verloop-alinea van het verslag, ingekort). */
  inleiding: string
  /** Het scoreverloop als golf; leeg als er geen doelpunten geregistreerd werden (bv. import). */
  golf: GolfPunt[]
  /** Totale speelduur (s) — de breedte van de golf. */
  duur: number
  /** Hoe vaak wisselde de leiding? Het verschil tussen een wandeling en een thriller. */
  leidingWissels: number
  topscorer: { naam: string; side: TeamSide; punten: number } | null
  /** Langste reeks doelpunten op rij van één ploeg. */
  langsteReeks: { side: TeamSide; lengte: number } | null
  mvp: { naam: string; side: TeamSide; stemmen: number } | null
  /** De laatste berichten uit de live tribune, oudste eerst. */
  berichten: { naam: string; tekst: string }[]
  /** Reacties per soort (clap, fire, …), meeste eerst. */
  kudos: { soort: string; aantal: number }[]
  kudosTotaal: number
  /** Het hoogste aantal gelijktijdige kijkers. */
  kijkers: number | null
}

/** Meer berichten passen niet op één scherm dat je van achter in de kantine moet kunnen lezen. */
export const MAX_BERICHTEN = 6
const MAX_TEKST = 140
const KUDOS_SOORTEN = ['clap', 'fire', 'heart', 'goal', 'wow', 'rocket'] as const

/**
 * Een doelpunt uit de tijdlijn terugvertalen naar een verslagregel. De tijdlijn schrijft
 * "Doelpunt +2 #7 Jens" (veldschema én snelscore); een eigen doelpunt draagt geen scorer voor de
 * ploeg die het punt krijgt.
 */
export function doelUitTijdlijn(item: Pick<TimelineItem, 'kind' | 'half' | 'gameClock' | 'side' | 'label'>): ReportGoal | null {
  if (item.kind !== 'goal' || (item.side !== 'home' && item.side !== 'away')) return null
  const punten = Number(/\+\s*(\d)/.exec(item.label)?.[1] ?? 1) || 1
  const eigen = /eigen doelpunt/i.test(item.label)
  const scorer = eigen ? null : /#(\d+|\?)\s+(.+)$/.exec(item.label)
  return {
    half: item.half,
    gameClock: item.gameClock,
    side: item.side,
    points: punten,
    playerName: scorer ? scorer[2].trim() : null,
    shirtNumber: scorer && scorer[1] !== '?' ? Number(scorer[1]) : null,
  }
}

/** Hoe vaak wisselde de leiding? Een gelijke stand ertussen telt niet als wissel. */
export function leidingWissels(golf: GolfPunt[]): number {
  let vorige = 0
  let wissels = 0
  for (const p of golf) {
    const teken = Math.sign(p.diff)
    if (teken === 0) continue
    if (vorige !== 0 && teken !== vorige) wissels += 1
    vorige = teken
  }
  return wissels
}

function berichtenVan(raw: unknown): { naam: string; tekst: string }[] {
  if (!Array.isArray(raw)) return []
  const uit: { naam: string; tekst: string; at: number }[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const o = b as { name?: unknown; text?: unknown; at?: unknown }
    const tekst = typeof o.text === 'string' ? o.text.trim() : ''
    if (!tekst) continue
    const naam = typeof o.name === 'string' && o.name.trim() && !o.name.includes('@') ? o.name.trim() : 'Supporter'
    uit.push({ naam, tekst: tekst.length > MAX_TEKST ? `${tekst.slice(0, MAX_TEKST - 1)}…` : tekst, at: Number(o.at) || 0 })
  }
  // De laatste berichten, maar in de volgorde waarin ze binnenkwamen: een terugblik lees je van
  // de aftrap naar het eindsignaal.
  return uit
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_BERICHTEN)
    .reverse()
    .map(({ naam, tekst }) => ({ naam, tekst }))
}

function kudosVan(raw: unknown): { soort: string; aantal: number }[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  return KUDOS_SOORTEN.map((soort) => ({ soort, aantal: Math.max(0, Math.floor(Number(o[soort]) || 0)) }))
    .filter((k) => k.aantal > 0)
    .sort((a, b) => b.aantal - a.aantal)
}

/** Een alinea inkorten tot de zinnen die samen op een tv-scherm passen (minstens één). */
export function kortVerhaal(alinea: string, max = 200): string {
  const zinnen = (alinea.match(/[^.!?]+[.!?]+/g) ?? [alinea]).map((z) => z.trim()).filter(Boolean)
  let uit = ''
  for (const z of zinnen) {
    const volgende = uit ? `${uit} ${z}` : z
    if (uit && volgende.length > max) break
    uit = volgende
  }
  return uit
}

export type VerhaalInput = {
  matchId: number
  home: string
  away: string
  reeks: string | null
  /** De officiële eindstand (die van het bord), niet herberekend uit de tijdlijn. */
  score: { home: number; away: number }
  tijdlijn: TimelineItem[]
  halfSeconds: number
  /** Ruwe velden van de wedstrijd: liveShoutouts, liveReactions, peakViewers. */
  berichten: unknown
  kudos: unknown
  kijkers: unknown
  mvp: { naam: string; side: TeamSide; stemmen: number } | null
}

export function bouwVerhaal(i: VerhaalInput): WedstrijdVerhaal {
  const doelen = i.tijdlijn.map(doelUitTijdlijn).filter((g): g is ReportGoal => g != null)
  const kruisjes = { home: 0, away: 0 }
  for (const t of i.tijdlijn) if (t.kind === 'cross' && (t.side === 'home' || t.side === 'away')) kruisjes[t.side] += 1
  const verslag = buildMatchReport({ home: i.home, away: i.away, score: i.score, crosses: kruisjes, goals: doelen, reeks: i.reeks, mvp: i.mvp ? { name: i.mvp.naam, votes: i.mvp.stemmen } : null })
  const halfSeconds = i.halfSeconds > 0 ? i.halfSeconds : 1500
  const golf = doelen.length > 0 ? buildMomentum(i.tijdlijn, halfSeconds).map((p) => ({ t: p.t, diff: p.diff })) : []
  const duur = Math.max(2 * halfSeconds, ...golf.map((p) => p.t))
  const top = scorerLines(doelen)[0] ?? null
  const reeks = longestRun(doelen)
  const kudos = kudosVan(i.kudos)
  const kijkers = Math.floor(Number(i.kijkers))
  return {
    matchId: i.matchId,
    kop: verslag.headline,
    inleiding: kortVerhaal(verslag.paragraphs[0] ?? verslag.lead),
    golf,
    duur,
    leidingWissels: leidingWissels(golf),
    topscorer: top ? { naam: top.name, side: top.side, punten: top.points } : null,
    // Een "reeks" van één doelpunt is geen verhaal.
    langsteReeks: reeks && reeks.length >= 3 ? { side: reeks.side, lengte: reeks.length } : null,
    mvp: i.mvp && i.mvp.stemmen > 0 ? i.mvp : null,
    berichten: berichtenVan(i.berichten),
    kudos,
    kudosTotaal: kudos.reduce((s, k) => s + k.aantal, 0),
    kijkers: Number.isFinite(kijkers) && kijkers > 0 ? kijkers : null,
  }
}

export type DagSamenvatting = {
  wedstrijden: number
  doelpunten: number
  berichten: number
  kudos: number
  fotos: number
  /** Wedstrijd met de meeste leidingwissels (minstens één). */
  spannendste: { matchId: number; wissels: number } | null
  /** Grootste verschil in de eindstand (minstens één punt). */
  grootsteZege: { matchId: number; verschil: number } | null
  /** Wie scoorde het meest van iedereen vandaag. */
  topscorer: { naam: string; matchId: number; punten: number } | null
  /** Waar de tribune het luidst was. */
  meesteKudos: { matchId: number; aantal: number } | null
}

export function dagSamenvatting(
  wedstrijden: { matchId: number; score: { home: number; away: number } }[],
  verhalen: WedstrijdVerhaal[],
  fotos: number,
): DagSamenvatting {
  const verhaalVan = new Map(verhalen.map((v) => [v.matchId, v]))
  let spannendste: DagSamenvatting['spannendste'] = null
  let grootsteZege: DagSamenvatting['grootsteZege'] = null
  let topscorer: DagSamenvatting['topscorer'] = null
  let meesteKudos: DagSamenvatting['meesteKudos'] = null
  let berichten = 0
  let kudos = 0
  let doelpunten = 0
  for (const w of wedstrijden) {
    doelpunten += w.score.home + w.score.away
    const verschil = Math.abs(w.score.home - w.score.away)
    if (verschil > 0 && (!grootsteZege || verschil > grootsteZege.verschil)) grootsteZege = { matchId: w.matchId, verschil }
    const v = verhaalVan.get(w.matchId)
    if (!v) continue
    berichten += v.berichten.length
    kudos += v.kudosTotaal
    if (v.leidingWissels > 0 && (!spannendste || v.leidingWissels > spannendste.wissels)) spannendste = { matchId: w.matchId, wissels: v.leidingWissels }
    if (v.topscorer && (!topscorer || v.topscorer.punten > topscorer.punten)) topscorer = { naam: v.topscorer.naam, matchId: w.matchId, punten: v.topscorer.punten }
    if (v.kudosTotaal > 0 && (!meesteKudos || v.kudosTotaal > meesteKudos.aantal)) meesteKudos = { matchId: w.matchId, aantal: v.kudosTotaal }
  }
  return { wedstrijden: wedstrijden.length, doelpunten, berichten, kudos, fotos, spannendste, grootsteZege, topscorer, meesteKudos }
}
