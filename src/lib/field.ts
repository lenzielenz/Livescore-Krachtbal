// Veldgeometrie — pure helpers. Bron: KVKBF reglement 01072025.
//
// Coördinaten zijn genormaliseerd: x ∈ [0,1] over de breedte (14 m), y ∈ [0,1] over de
// volledige lengte incl. beide doelgebieden. y=0 = achterlijn-zijde "thuis", y=1 = "uit".
//
// De doelgebied-DIEPTE verschilt per terrein (min. 10 m, 15 m voor nieuwe terreinen). Het
// speelveld tussen de doellijnen is altijd 26 m, dus de totale lengte = 26 + 2×diepte.
// De middellijn ligt altijd exact in het midden (genormaliseerd 0.5), maar de doellijn en
// vrijeworplijn verschuiven mét de diepte — en dus ook de afstandsberekening.

export const FIELD = {
  widthM: 14,
  playingLengthM: 26,
  freeThrowOffsetM: 4,
  defaultGoalAreaDepthM: 10,
} as const

export type AttackDir = 'up' | 'down'
export type Zone = 'links' | 'midden' | 'rechts'

export interface Point {
  x: number
  y: number
}

/** Totale veldlengte (m) = speelveld (26 m) + 2 doelgebieden van `goalAreaDepthM`. */
export function totalLengthM(goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM): number {
  return FIELD.playingLengthM + 2 * goalAreaDepthM
}

/** Genormaliseerde y van de doellijn aan de y=0-zijde (de uit-zijde = 1 − dit). */
export function goalLineNorm(goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM): number {
  return goalAreaDepthM / totalLengthM(goalAreaDepthM)
}

/** Genormaliseerde y van de vrijeworplijn aan de y=0-zijde (4 m vóór de doellijn). */
export function freeThrowNorm(goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM): number {
  return (goalAreaDepthM + FIELD.freeThrowOffsetM) / totalLengthM(goalAreaDepthM)
}

export function toMeters(p: Point, goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM): { x: number; y: number } {
  return { x: p.x * FIELD.widthM, y: p.y * totalLengthM(goalAreaDepthM) }
}

/** Hemelsbrede afstand (meters) — de y-component schaalt met de werkelijke veldlengte. */
export function distanceM(
  from: Point,
  to: Point,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
): number {
  const dx = (to.x - from.x) * FIELD.widthM
  const dy = (to.y - from.y) * totalLengthM(goalAreaDepthM)
  return Math.hypot(dx, dy)
}

/** Zone links/midden/rechts vanuit het perspectief van de aanvallende ploeg (breedte in derden). */
export function zoneOf(p: Point, dir: AttackDir): Zone {
  const x = dir === 'up' ? p.x : 1 - p.x
  if (x < 1 / 3) return 'links'
  if (x > 2 / 3) return 'rechts'
  return 'midden'
}

/** Eigen helft? De middellijn ligt altijd in het midden → genormaliseerd 0.5 (diepte-onafhankelijk). */
export function isOnOwnHalf(p: Point, dir: AttackDir): boolean {
  return dir === 'up' ? p.y < 0.5 : p.y > 0.5
}

/** Raakt/overschrijdt het punt de middellijn richting tegenhelft? */
export function reachedMidline(p: Point, dir: AttackDir): boolean {
  return dir === 'up' ? p.y >= 0.5 : p.y <= 0.5
}

/** Ligt het punt áchter de doellijn van de aangevallen zijde? (diepte-afhankelijk) */
export function isInTargetGoalArea(
  p: Point,
  dir: AttackDir,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
): boolean {
  if (p.x < 0 || p.x > 1) return false
  const g = goalLineNorm(goalAreaDepthM)
  return dir === 'up' ? p.y > 1 - g : p.y < g
}

/**
 * Reglement §6.4: "Bal raakt grond tussen doellijn en vrijeworplijn → werpplaats loodrecht
 * geprojecteerd tot juist vóór de vrijeworplijn." Je mag dus nooit van dichter dan 4 m van een
 * doellijn werpen; de werper schuift terug tot op de vrijeworplijn (breedte blijft behouden).
 *
 * Punten ín een doelgebied blijven ongemoeid: die zijn een doelpunt (of een vangst, waarvoor
 * §6.4 een eigen regel heeft — werpplaats naar de doellijn).
 */
export function projectWerpplaats(p: Point, goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM): Point {
  const g = goalLineNorm(goalAreaDepthM)
  const ft = freeThrowNorm(goalAreaDepthM)
  if (p.y >= g && p.y < ft) return { x: p.x, y: ft }
  if (p.y <= 1 - g && p.y > 1 - ft) return { x: p.x, y: 1 - ft }
  return p
}

/** Voorbij de zijlijn? */
export function isOutSide(p: Point): boolean {
  return p.x < 0 || p.x > 1
}

/** Voorbij de achterlijn aan de aangevallen zijde? */
export function isOutBack(p: Point, dir: AttackDir): boolean {
  return dir === 'up' ? p.y > 1 : p.y < 0
}
