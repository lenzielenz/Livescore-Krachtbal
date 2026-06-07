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
  freeThrowNorm,
  goalLineNorm,
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

/**
 * Punten voor één worp: rugworp-doelpunt telt dubbel (+2), nekworp +1, anders 0.
 * Reglement §48.1: een vrije worp (en bekerstrafworp) levert ALTIJD 1 punt op, ongeacht
 * de werpwijze. Voor een nationale uitrol volgen we het reglement (uitslag-bepalend).
 */
export function pointsForThrow(t: { type: ThrowType; outcome: ThrowOutcome; freeThrow?: boolean }): 0 | 1 | 2 {
  if (t.outcome !== 'goal') return 0
  if (t.freeThrow) return 1
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
  goalAreaDepthM?: number
}): ThrowOutcome {
  const { tapCount, point, dir, goalAreaDepthM } = input
  if (tapCount === 2) return 'caught'
  if (isOutBack(point, dir)) return 'out_back'
  if (isOutSide(point)) return 'out_side'
  if (isInTargetGoalArea(point, dir, goalAreaDepthM)) return 'goal'
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
export function deriveGeometry(
  origin: Point,
  landing: Point,
  dir: AttackDir,
  goalAreaDepthM?: number,
): DerivedThrowGeometry {
  return {
    distance: Math.round(distanceM(origin, landing, goalAreaDepthM) * 100) / 100,
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
  goalAreaDepthM?: number
  /** Bij een out (zij/achter): aangeraakt door de tegenstander vóór buiten? */
  touchedBeforeOut?: boolean
}): NextSetup {
  const { outcome, landing, throwerTeam, throwerDir, goalAreaDepthM } = input
  const team: TeamSide = throwerTeam === 'home' ? 'away' : 'home'
  const dir: AttackDir = throwerDir === 'up' ? 'down' : 'up'
  const ftLine = freeThrowNorm(goalAreaDepthM)

  // Buitenspel (zij-/achterlijn): de inworp is voor de ploeg die het buitenspel NIET
  // veroorzaakte (reglement §6.11.1). Aangeraakt door de tegenstander vóór buiten →
  // de werpende ploeg houdt de bal; anders gaat hij naar de tegenpartij.
  // Reglement §6.8: het aantal worpen ná de inworp hangt af van de HELFT waar de bal
  // buiten ging — eigen helft → meer worpen (3/4), tegenhelft → minder (2/3). Daarom
  // bepaalt de plek (landing) de setupSide; de inworp herstart op die diepte.
  if (outcome === 'out_side' || outcome === 'out_back') {
    const keep = Boolean(input.touchedBeforeOut)
    const newTeam = keep ? throwerTeam : team
    const newDir = keep ? throwerDir : dir
    // §6.11.1: er wordt ingeworpen "van rechtover die plaats" — behoud dus de breedte-positie
    // (links/midden/rechts) i.p.v. altijd centraal te herstarten, zodat afstand/zone kloppen.
    return {
      team: newTeam,
      dir: newDir,
      setupSide: isOnOwnHalf(landing, newDir) ? 'own' : 'opponent',
      point: { x: Math.max(0, Math.min(1, landing.x)), y: Math.max(0, Math.min(1, landing.y)) },
    }
  }

  // Vangst: de tegenploeg speelt verder vanaf waar de bal gevangen werd. MAAR wordt de bal in een
  // doelgebied gevangen en gaat ze daarna de andere richting op, dan start de meting vanaf het
  // MIDDEN van die doellijn (niet diep in het doelgebied) — anders zou de afstand vertekend zijn.
  if (outcome === 'caught') {
    const g = goalLineNorm(goalAreaDepthM)
    let point: Point = landing
    if (landing.y < g) point = { x: 0.5, y: g } // gevangen in het doelgebied aan de y=0-zijde
    else if (landing.y > 1 - g) point = { x: 0.5, y: 1 - g } // … aan de y=1-zijde
    return { team, dir, setupSide: isOnOwnHalf(point, dir) ? 'own' : 'opponent', point }
  }

  // Opzetpunt = waar de bal lag; het worpaantal volgt uit de helft.
  // Geldt voor opgebruikte worpen en de middellijn-fout (opzet vanaf grondcontact).
  if (outcome === 'throws_exhausted' || outcome === 'midline_fault') {
    return { team, dir, setupSide: isOnOwnHalf(landing, dir) ? 'own' : 'opponent', point: landing }
  }

  // goal: tegenploeg zet op vanaf de eigen vrijeworplijn (eigen helft, volle breedte).
  const ftY = dir === 'up' ? ftLine : 1 - ftLine
  return { team, dir, setupSide: 'own', point: { x: 0.5, y: ftY } }
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
  /** True als de worp uit een vrije worp kwam (telt niet als kruisje, §6.7/§10.2). */
  freeThrow?: boolean
}

/**
 * Een kruisje: de doelworp gaat rechtstreeks buiten (zij- of achterlijn = rode zone)
 * zonder aanraking. Intermediaire worpen die buiten gaan tellen niet mee. Een VRIJE WORP
 * is geen doelworp in open spel en mag de kruisjes-teller nooit raken (§6.7/§10.2-18).
 */
export function isCrossThrow(t: {
  outcome: ThrowOutcome
  isDoelworp: boolean
  touchedBeforeOut?: boolean
  freeThrow?: boolean
}): boolean {
  if (t.freeThrow) return false
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
    score[t.team] += pointsForThrow({ type: t.type, outcome: t.outcome, freeThrow: t.freeThrow })
    if (isCrossThrow(t)) {
      crosses[t.team] += 1
      if (crosses[t.team] >= CROSS_LIMIT) crosses[t.team] = 0
    }
  }

  return { score, crosses }
}
