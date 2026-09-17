// ── Seizoenstotaal + archief ─────────────────────────────────────────────────────────────────
// Naast de maandag-recap van één speelweek toont /recap ook het seizoen tot nu toe, en een
// archief waar elke voorbije speelweek naartoe linkt. Puur en getest; het verzamelen van de data
// (DB) zit in season-recap-data.ts — zelfde opsplitsing als weekly-recap.ts/-data.ts.

import { buildHighlights, type RecapHighlight, type RecapMatch, type WeekendStats } from './weekly-recap'
import { teamOfTheWeek, type WeekTeamResult, type WeekTeamRow } from './team-of-the-week'

export interface SeasonRecapWeek {
  startIso: string
  endIso: string
  matches: number
  goals: number
  team: WeekTeamRow | null
}

export interface SeasonRecap {
  seizoen: string
  matches: number
  goals: number
  weekends: number
  stats: WeekendStats
  headline: string
  highlights: RecapHighlight[]
  /** Nieuwste speelweek eerst. */
  archive: SeasonRecapWeek[]
}

export interface SeasonWeekBucket {
  startIso: string
  endIso: string
  results: RecapMatch[]
  teamResults: WeekTeamResult[]
}

export interface SeasonRecapInput {
  seizoen: string
  results: RecapMatch[]
  weeks: SeasonWeekBucket[]
  stats?: WeekendStats
}

const total = (m: RecapMatch) => m.homeGoals + m.awayGoals

function seasonHeadline(seizoen: string, matches: number, goals: number): string {
  if (matches === 0) return `Seizoen ${seizoen} is nog niet begonnen`
  const wedstrijden = `${matches} ${matches === 1 ? 'wedstrijd' : 'wedstrijden'}`
  const punten = `${goals} ${goals === 1 ? 'punt' : 'punten'}`
  return `${wedstrijden} en ${punten} sinds de start van ${seizoen}`
}

/** Stelt het seizoenstotaal en -archief samen. Een seizoen zonder wedstrijden levert null op —
 * dan is er nog niets om te tonen. */
export function buildSeasonRecap(input: SeasonRecapInput): SeasonRecap | null {
  if (input.results.length === 0) return null
  const goals = input.results.reduce((s, m) => s + total(m), 0)
  const archive: SeasonRecapWeek[] = input.weeks
    .filter((w) => w.results.length > 0)
    .map((w) => ({
      startIso: w.startIso,
      endIso: w.endIso,
      matches: w.results.length,
      goals: w.results.reduce((s, m) => s + total(m), 0),
      team: teamOfTheWeek(w.teamResults),
    }))
    .sort((a, b) => b.startIso.localeCompare(a.startIso))

  return {
    seizoen: input.seizoen,
    matches: input.results.length,
    goals,
    weekends: archive.length,
    stats: input.stats ?? { visitors: 0, clubs: 0, goalThrows: 0, backThrows: 0, photos: 0 },
    headline: seasonHeadline(input.seizoen, input.results.length, goals),
    highlights: buildHighlights(input.results),
    archive,
  }
}
