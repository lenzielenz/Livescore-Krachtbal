// ── Maandag-recap ────────────────────────────────────────────────────────────────────────────
// Het wekelijkse ritueel: één overzicht van de voorbije speelweek — uitslagen, opvallende cijfers,
// ploeg van de week en wie klom in de rangschikking. Puur en getest; het verzamelen van de data
// zit in weekly-recap-data.ts.
//
// Waarom een ritueel en niet nog een feature: terugkomen wordt een gewoonte door een vast moment
// (voorspellen vóór het weekend → live volgen → maandag de recap), niet door meer knoppen.

import { brusselsParts } from './datetime'
import { WEEKEND_RESET_HOUR, weekendRange } from './pronostiek-weekend'
import type { WeekSelection, WeekTeamRow } from './team-of-the-week'

export interface RecapMatch {
  matchId: number
  date: string
  reeks: string | null
  home: string
  away: string
  homeTeamId: number
  awayTeamId: number
  homeGoals: number
  awayGoals: number
  /** Kwam de eindstand automatisch binnen (federatie-sync/officiële export) i.p.v. dat iemand ze
   * zelf via de app registreerde (veldschema, wedstrijdblad, of een supporter die de eindstand
   * doorgaf)? Bepaalt het "manueel vs automatisch"-onderscheid in de recap. */
  autoImported?: boolean
}

export interface RecapHighlight {
  key: 'biggest' | 'feast' | 'thriller'
  emoji: string
  title: string
  text: string
  matchId: number
}

export interface Climber {
  teamId: number
  teamName: string
  reeks: string | null
  /** Plaats vóór en ná deze speelweek (1 = leider). */
  from: number
  to: number
  /** Positief = geklommen. */
  delta: number
}

export interface WeekendStats {
  visitors: number
  clubs: number
  goalThrows: number
  backThrows: number
  /** Aantal supportersfoto's gepost bij wedstrijden uit dit venster (foto-tribune). */
  photos: number
}

export interface WeeklyRecap {
  startIso: string
  endIso: string
  /** Aantal gespeelde (afgelopen) wedstrijden in het venster — dit is de DEKKING (manueel +
   * automatisch samen), niet "door supporters ingevuld". */
  matches: number
  /** Subset van `matches` die iemand zelf via de app registreerde (veldschema, wedstrijdblad, of
   * een supporter die de eindstand doorgaf) — dát is het aantal om supporters mee te prikkelen. */
  matchesManual: number
  goals: number
  stats: WeekendStats
  headline: string
  highlights: RecapHighlight[]
  results: RecapMatch[]
  team: WeekTeamRow | null
  players: WeekSelection[]
  climbers: Climber[]
  /** Aantal wedstrijden in de week ervoor — voor het "t.o.v. vorige week"-verschil. Null als dat
   * (nog) niet kon worden opgehaald. */
  previousMatches: number | null
  /** Klaar-om-te-versturen pushtekst. */
  push: { title: string; body: string }
}

/**
 * Het venster van de VORIGE speelweek (maandag 08:00 → maandag 08:00, Belgische tijd) — dat is
 * wat een maandagochtend-recap moet tonen. Hergebruikt de speelweek-logica van de pronostiek,
 * zodat "het weekend" overal exact hetzelfde betekent.
 */
export function previousWeekRange(now: Date = new Date()): { startIso: string; endIso: string } {
  const current = weekendRange(now.toISOString())
  const local = brusselsParts(now)

  // Tussen maandag 00:00 en de pronostiek-reset om 08:00 wijst weekendRange bewust nog naar de
  // speelweek die nét afgelopen is. Voor de recap is dat precies het gewenste weekend; nogmaals
  // een week teruggaan zou op maandagochtend foutief twee weekends geleden tonen.
  if (local.weekdayMon0 === 0 && local.hour < WEEKEND_RESET_HOUR) return current

  // Eén dag vóór de start van de huidige week valt zeker in de vorige week (DST-veilig: de
  // weekgrenzen worden op wandkloktijd berekend, niet met een vaste offset).
  const dayBefore = new Date(new Date(current.startIso).getTime() - 86_400_000)
  return weekendRange(dayBefore.toISOString())
}

const margin = (m: RecapMatch) => Math.abs(m.homeGoals - m.awayGoals)
const total = (m: RecapMatch) => m.homeGoals + m.awayGoals
const label = (m: RecapMatch) => `${m.home} ${m.homeGoals}–${m.awayGoals} ${m.away}`

/** De opvallende wedstrijden: de zwaarste zege, de doelpuntenkermis en de spannendste partij. */
export function buildHighlights(results: RecapMatch[]): RecapHighlight[] {
  if (results.length === 0) return []
  const out: RecapHighlight[] = []

  const biggest = results.reduce((a, b) => (margin(b) > margin(a) ? b : a))
  if (margin(biggest) >= 5) {
    out.push({
      key: 'biggest',
      emoji: '💥',
      title: 'Zwaarste zege',
      text: `${label(biggest)} — ${margin(biggest)} punten verschil.`,
      matchId: biggest.matchId,
    })
  }

  const feast = results.reduce((a, b) => (total(b) > total(a) ? b : a))
  if (total(feast) > 0 && feast.matchId !== biggest.matchId) {
    out.push({
      key: 'feast',
      emoji: '🎯',
      title: 'Meeste doelpunten',
      text: `${label(feast)} — samen ${total(feast)} punten.`,
      matchId: feast.matchId,
    })
  }

  // Spannendste partij: krap beslist. Een wedstrijd die hierboven al genoemd is, slaan we over —
  // drie keer dezelfde match uitlichten is geen overzicht.
  const close = results.filter((m) => margin(m) <= 2 && !out.some((h) => h.matchId === m.matchId))
  if (close.length > 0) {
    const thriller = close.reduce((a, b) => (total(b) > total(a) ? b : a))
    out.push({
      key: 'thriller',
      emoji: '🔥',
      title: 'Spannendste partij',
      text:
        margin(thriller) === 0
          ? `${label(thriller)} — niemand die won.`
          : `${label(thriller)} — beslist met ${margin(thriller)} ${margin(thriller) === 1 ? 'punt' : 'punten'} verschil.`,
      matchId: thriller.matchId,
    })
  }

  return out
}

/**
 * Verschuivingen in de rangschikking tussen twee momenten. Beide lijsten staan al gesorteerd
 * (plaats 1 eerst). Ploegen die er vóór nog niet in stonden, tellen niet als klimmer.
 */
export function positionDeltas(
  before: { teamId: number }[],
  after: { teamId: number }[],
): Map<number, { from: number; to: number; delta: number }> {
  const pos = (list: { teamId: number }[]) => new Map(list.map((r, i) => [r.teamId, i + 1]))
  const b = pos(before)
  const out = new Map<number, { from: number; to: number; delta: number }>()
  pos(after).forEach((to, teamId) => {
    const from = b.get(teamId)
    if (from == null) return
    out.set(teamId, { from, to, delta: from - to })
  })
  return out
}

function headlineFor(matches: number, goals: number, team: WeekTeamRow | null): string {
  if (matches === 0) return 'Een weekend zonder wedstrijden'
  const wedstrijden = `${matches} ${matches === 1 ? 'wedstrijd' : 'wedstrijden'}`
  const punten = `${goals} ${goals === 1 ? 'punt' : 'punten'}`
  if (team) return `${wedstrijden}, ${punten} — en ${team.teamName} zette de sterkste prestatie neer`
  return `${wedstrijden} en ${punten} in de voorbije speelweek`
}

function pushFor(matches: number, results: RecapMatch[], players: WeekSelection[]): { title: string; body: string } {
  if (matches === 0) {
    return { title: '📰 Weekoverzicht', body: 'Geen wedstrijden de voorbije week. Volgend weekend opnieuw!' }
  }
  const star = players[0]
  const bits = [`${matches} ${matches === 1 ? 'wedstrijd' : 'wedstrijden'} gespeeld`]
  if (star) bits.push(`${star.name} was de uitblinker`)
  else if (results[0]) bits.push(label(results[0]))
  return { title: '📰 Het weekend in het kort', body: `${bits.join(' · ')}. Bekijk de recap.` }
}

export interface RecapInput {
  startIso: string
  endIso: string
  results: RecapMatch[]
  team: WeekTeamRow | null
  players: WeekSelection[]
  climbers: Climber[]
  stats?: WeekendStats
  previousMatches?: number | null
}

/** Stelt de volledige recap samen. Een lege week levert een nette "niets gespeeld"-recap op. */
export function buildWeeklyRecap(input: RecapInput): WeeklyRecap {
  const results = input.results.slice().sort((a, b) => a.date.localeCompare(b.date))
  const goals = results.reduce((s, m) => s + total(m), 0)
  const climbers = input.climbers
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.to - b.to || a.teamName.localeCompare(b.teamName))
  return {
    startIso: input.startIso,
    endIso: input.endIso,
    matches: results.length,
    matchesManual: results.filter((m) => !m.autoImported).length,
    goals,
    stats: input.stats ?? { visitors: 0, clubs: 0, goalThrows: 0, backThrows: 0, photos: 0 },
    headline: headlineFor(results.length, goals, input.team),
    highlights: buildHighlights(results),
    results,
    team: input.team,
    players: input.players,
    climbers,
    previousMatches: input.previousMatches ?? null,
    push: pushFor(results.length, results, input.players),
  }
}
