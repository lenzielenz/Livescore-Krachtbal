// Regellogica voor krachtbal — puur en getest. Bron: KVKBF reglement 01072025.
//
// Alle afgeleide grootheden (score, balbezit-omkering, worpteller, kruisjes, statistieken)
// worden hier berekend uit de ruwe worp-events. Niets wordt apart opgeslagen.

import { type Category, categoryConfig } from './categories'
import {
  type AttackDir,
  type Point,
  type Zone,
  distanceM,
  isInTargetGoalArea,
  isOnOwnHalf,
  isOutBack,
  isOutSide,
  reachedMidline,
  zoneOf,
} from './field'

export type TeamSide = 'home' | 'away'
export type ThrowType = 'nek' | 'rug'
export type ThrowOutcome = 'in_field' | 'goal' | 'caught' | 'out_side' | 'out_back'
export type SetupSide = 'own' | 'opponent'

export const CROSS_LIMIT = 3

/**
 * Speelrichting van een ploeg in een gegeven helft. Thuis valt in helft 1 aan richting
 * 'up' (naar y=1); in helft 2 draait alles om. Puur, dus ook bruikbaar in de UI.
 */
export function attackDirForSide(side: TeamSide, half: number): AttackDir {
  const homeUp = half === 1
  if (side === 'home') return homeUp ? 'up' : 'down'
  return homeUp ? 'down' : 'up'
}

// ── Score ────────────────────────────────────────────────────────────────────

/** Punten voor één worp: rugworp-doelpunt telt dubbel (+2), nekworp +1, anders 0. */
export function pointsForThrow(t: { type: ThrowType; outcome: ThrowOutcome }): 0 | 1 | 2 {
  if (t.outcome !== 'goal') return 0
  return t.type === 'rug' ? 2 : 1
}

// ── Worpteller ────────────────────────────────────────────────────────────────

/** Aantal toegestane worpen, afhankelijk van categorie en opzetpunt. */
export function throwsAllowed(category: Category, setupSide: SetupSide): number {
  const cfg = categoryConfig(category)
  return setupSide === 'own' ? cfg.throwsFromOwnHalf : cfg.throwsFromOpponentHalf
}

// ── Uitkomst afleiden uit de tik ────────────────────────────────────────────

/**
 * Leidt de worp-uitkomst af uit de tik. Twee tikken = gevangen (balbezit draait om),
 * ongeacht plek. Eén tik: voorbij achterlijn → out_back, voorbij zijlijn → out_side,
 * in doelgebied → goal, anders → in_field (doorspelen).
 */
export function deriveOutcome(input: {
  tapCount: 1 | 2
  point: Point
  dir: AttackDir
}): ThrowOutcome {
  const { tapCount, point, dir } = input
  if (tapCount === 2) return 'caught'
  if (isOutBack(point, dir)) return 'out_back'
  if (isOutSide(point)) return 'out_side'
  if (isInTargetGoalArea(point, dir)) return 'goal'
  return 'in_field'
}

/** Een terminale uitkomst sluit het balbezit af (geen doorspelen meer). */
export function isTerminalOutcome(outcome: ThrowOutcome): boolean {
  return outcome !== 'in_field'
}

// ── Afgeleide worp-eigenschappen (afstand + zone), bewaard op het worp-record ──

export interface DerivedThrowGeometry {
  distance: number
  zone: Zone
}

/** Afstand (hemelsbreed, vanaf vertrekpunt) en zone — berekend bij het registreren. */
export function deriveGeometry(origin: Point, landing: Point, dir: AttackDir): DerivedThrowGeometry {
  return {
    distance: Math.round(distanceM(origin, landing) * 100) / 100,
    zone: zoneOf(landing, dir),
  }
}

// ── 2e-worp-regel ──────────────────────────────────────────────────────────

/**
 * Bij opzet vanaf eigen helft moet de 2e worp de middellijn raken/overschrijden,
 * anders opzet voor de tegenpartij. True = fout (balverlies).
 */
export function isMidlineFault(input: {
  setupSide: SetupSide
  throwNumber: number
  outcome: ThrowOutcome
  landing: Point
  dir: AttackDir
}): boolean {
  const { setupSide, throwNumber, outcome, landing, dir } = input
  if (setupSide !== 'own' || throwNumber !== 2) return false
  if (outcome === 'caught' || outcome === 'out_side' || outcome === 'out_back') return false
  return !reachedMidline(landing, dir)
}

// ── Volgend opzetpunt na een terminale worp ─────────────────────────────────

export interface NextSetup {
  team: TeamSide
  dir: AttackDir
  setupSide: SetupSide
  /** Genormaliseerd herstartpunt (vertrekpunt voor de volgende ploeg). */
  point: Point
}

/**
 * Bepaalt wie de bal krijgt en vanwaar, na een terminale worp.
 * - caught: tegenploeg vertrekt vanaf het vangpunt (spel draait om).
 * - out_side: tegenploeg herstart vanuit het midden. (DECISION: behandeld als eigen-helft-opzet.)
 * - out_back: tegenploeg herstart vanaf haar eigen doellijn → eigen-helft-opzet.
 * - goal: tegenploeg herstart vanaf eigen helft.
 * - midline_fault wordt door de aanroeper als out behandeld → eigen-helft-opzet vanuit midden.
 */
export function nextSetup(input: {
  outcome: ThrowOutcome | 'midline_fault' | 'throws_exhausted'
  landing: Point
  throwerTeam: TeamSide
  throwerDir: AttackDir
}): NextSetup {
  const { outcome, landing, throwerTeam, throwerDir } = input
  const team: TeamSide = throwerTeam === 'home' ? 'away' : 'home'
  const dir: AttackDir = throwerDir === 'up' ? 'down' : 'up'

  if (outcome === 'caught' || outcome === 'throws_exhausted') {
    // Bal ligt/wordt gevangen op het landingspunt = vertrek voor de tegenploeg.
    return { team, dir, setupSide: isOnOwnHalf(landing, dir) ? 'own' : 'opponent', point: landing }
  }

  // out_side / midline_fault: herstart vanuit het midden.
  if (outcome === 'out_side' || outcome === 'midline_fault') {
    return { team, dir, setupSide: 'own', point: { x: 0.5, y: 0.5 } }
  }

  // out_back: herstart vanaf de eigen doellijn van de tegenploeg.
  if (outcome === 'out_back') {
    const y = dir === 'up' ? 10 / 46 : 36 / 46 // eigen doellijn van de nieuwe ploeg
    return { team, dir, setupSide: 'own', point: { x: 0.5, y } }
  }

  // goal: tegenploeg herstart vanaf eigen helft (midden).
  return { team, dir, setupSide: 'own', point: { x: 0.5, y: 0.5 } }
}

// ── Aggregatie van een reeks worpen ──────────────────────────────────────────

export interface ReducibleThrow {
  team: TeamSide
  type: ThrowType
  outcome: ThrowOutcome
  /** True als dit de doelworp was (laatste toegestane worp van het balbezit). */
  isDoelworp: boolean
  /** Enkel relevant bij een out (zij-/achterlijn). */
  touchedBeforeOut?: boolean
}

/**
 * Een kruisje: de doelworp gaat rechtstreeks buiten (zij- of achterlijn = rode zone)
 * zonder aanraking. Intermediaire worpen die buiten gaan tellen niet mee.
 */
export function isCrossThrow(t: {
  outcome: ThrowOutcome
  isDoelworp: boolean
  touchedBeforeOut?: boolean
}): boolean {
  return t.isDoelworp && (t.outcome === 'out_side' || t.outcome === 'out_back') && !t.touchedBeforeOut
}

export interface MatchTotals {
  score: { home: number; away: number }
  crosses: { home: number; away: number }
}

/**
 * Score + kruisjes uit een geordende reeks worpen. Bij het 3e kruisje reset de teller
 * naar 0 (en krijgt de tegenstander een vrije worp).
 */
export function reduceTotals(throws: ReducibleThrow[]): MatchTotals {
  const score = { home: 0, away: 0 }
  const crosses = { home: 0, away: 0 }

  for (const t of throws) {
    score[t.team] += pointsForThrow(t)
    if (isCrossThrow(t)) {
      crosses[t.team] += 1
      if (crosses[t.team] >= CROSS_LIMIT) crosses[t.team] = 0
    }
  }

  return { score, crosses }
}
