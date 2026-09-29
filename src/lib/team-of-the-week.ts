// ── Ploeg van de week ────────────────────────────────────────────────────────────────────────
// Kiest automatisch de vier sterkste spelersprestaties van een speelweekend (krachtbal speelt met
// vier veldspelers) plus de ploeg die het weekend domineerde. Puur en getest — alles wordt
// afgeleid uit de per-wedstrijd statistieken; er wordt niets extra opgeslagen.
//
// Waarom gewogen en niet gewoon "meeste doelpunten": een speler die veel scoort maar even vaak de
// bal weggeeft, heeft zijn ploeg niet vooruitgeholpen. Winst weegt mee, zodat een sterke prestatie
// in een verloren wedstrijd niet automatisch bovenaan komt.

import { isForfaitScore } from './standings'

export interface WeekPlayer {
  playerId: number
  name: string
  shirtNumber: number | null
  teamId: number
  teamName: string
  clubName?: string | null
  reeks?: string | null
  /** Doelpunten in die wedstrijd. */
  goals: number
  /** Punten (nekworp 1, rugworp 2). */
  points: number
  /** Conversie op de doelpogingen (0..1). */
  conversion: number
  /** Balverlies: gevangen + buiten. */
  lost: number
  /** Wedstrijdresultaat van zijn ploeg. */
  result: 'win' | 'draw' | 'loss'
}

export interface WeekSelection extends WeekPlayer {
  /** De berekende weekscore (hoger = betere prestatie). */
  score: number
}

/** Standaardgrootte: krachtbal speelt met vier veldspelers. */
export const TEAM_OF_THE_WEEK_SIZE = 4

const RESULT_BONUS = { win: 3, draw: 1, loss: 0 } as const

/**
 * Weekscore van één prestatie: punten wegen het zwaarst, conversie beloont efficiëntie,
 * balverlies trekt af en winnen levert een bonus.
 */
export function weekScore(p: WeekPlayer): number {
  const raw = p.points * 2 + p.goals + p.conversion * 5 - p.lost + RESULT_BONUS[p.result]
  return Math.round(raw * 100) / 100
}

/**
 * De ploeg van de week: de beste prestaties, met hoogstens één speler per ploeg zodat het een
 * échte selectie wordt en niet gewoon de vier spelers van de sterkste ploeg.
 */
export function buildTeamOfTheWeek(players: WeekPlayer[], size: number = TEAM_OF_THE_WEEK_SIZE): WeekSelection[] {
  const ranked = players
    .map((p) => ({ ...p, score: weekScore(p) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || b.points - a.points || a.name.localeCompare(b.name))

  const picked: WeekSelection[] = []
  const teamsUsed = new Set<number>()
  for (const p of ranked) {
    if (teamsUsed.has(p.teamId)) continue
    picked.push(p)
    teamsUsed.add(p.teamId)
    if (picked.length >= size) break
  }
  // Te weinig verschillende ploegen (klein weekend)? Vul aan met de volgende in de rangschikking.
  if (picked.length < size) {
    for (const p of ranked) {
      if (picked.some((x) => x.playerId === p.playerId)) continue
      picked.push(p)
      if (picked.length >= size) break
    }
  }
  return picked
}

/** De speler van de week: de allerbeste prestatie van het weekend (of null bij een leeg weekend). */
export function playerOfTheWeek(players: WeekPlayer[]): WeekSelection | null {
  return buildTeamOfTheWeek(players, 1)[0] ?? null
}

export interface WeekTeamResult {
  teamId: number
  teamName: string
  reeks?: string | null
  goalsFor: number
  goalsAgainst: number
  result: 'win' | 'draw' | 'loss'
}

export interface WeekTeamRow extends WeekTeamResult {
  diff: number
  score: number
}

/**
 * De ploeg die het weekend domineerde: winst telt, het doelsaldo breekt de gelijkstand.
 * Voedt de "ploeg van de week"-vermelding in de maandag-recap. Een forfaitoverwinning (30–0) telt
 * niet mee — die ploeg heeft er niets voor moeten doen.
 */
export function teamOfTheWeek(results: WeekTeamResult[]): WeekTeamRow | null {
  const rows = results
    .filter((r) => !isForfaitScore(r.goalsFor, r.goalsAgainst))
    .map((r) => ({ ...r, diff: r.goalsFor - r.goalsAgainst, score: RESULT_BONUS[r.result] * 10 + (r.goalsFor - r.goalsAgainst) }))
    .filter((r) => r.result === 'win')
    .sort((a, b) => b.score - a.score || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName))
  return rows[0] ?? null
}
