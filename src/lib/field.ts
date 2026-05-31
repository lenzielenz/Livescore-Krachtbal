// Veldgeometrie — pure helpers. Bron: KVKBF reglement 01072025.
//
// Coördinaten zijn genormaliseerd: x ∈ [0,1] over de breedte (14 m), y ∈ [0,1] over de
// volledige lengte incl. beide doelgebieden (46 m). y=0 = achterlijn-zijde "thuis",
// y=1 = achterlijn-zijde "uit".
//
// Aanvalsrichting (`AttackDir`): 'up' = naar y=1 (uitdoel), 'down' = naar y=0 (thuisdoel).
// De aantekenlaag levert de richting per balbezit aan (afhankelijk van helft + ploeg),
// zodat alle functies hier puur en zijde-onafhankelijk blijven.

export const FIELD = {
  totalLengthM: 46,
  widthM: 14,
  goalAreaDepthM: 10,
  playingLengthM: 26,
  /** Doellijn aan de y=0-zijde, in meters. */
  homeGoalLineM: 10,
  /** Doellijn aan de y=1-zijde, in meters. */
  awayGoalLineM: 36,
  midlineM: 23,
  freeThrowOffsetM: 4,
} as const

export type AttackDir = 'up' | 'down'
export type Zone = 'links' | 'midden' | 'rechts'

export interface Point {
  /** 0..1 over de breedte; <0 of >1 = buiten de zijlijn. */
  x: number
  /** 0..1 over de lengte; <0 of >1 = voorbij de achterlijn. */
  y: number
}

export interface MetersPoint {
  x: number
  y: number
}

export function toMeters(p: Point): MetersPoint {
  return { x: p.x * FIELD.widthM, y: p.y * FIELD.totalLengthM }
}

/** Hemelsbrede afstand (meters) tussen twee genormaliseerde punten. */
export function distanceM(from: Point, to: Point): number {
  const a = toMeters(from)
  const b = toMeters(to)
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Zone links/midden/rechts vanuit het perspectief van de aanvallende ploeg
 * (zodat 'links' consistent is ongeacht speelrichting). Breedte in gelijke derden.
 */
export function zoneOf(p: Point, dir: AttackDir): Zone {
  // Bij 'down' kijkt de ploeg de andere kant op → links/rechts spiegelen.
  const x = dir === 'up' ? p.x : 1 - p.x
  if (x < 1 / 3) return 'links'
  if (x > 2 / 3) return 'rechts'
  return 'midden'
}

/** Ligt het punt op de eigen helft van de aanvallende ploeg? (Middellijn op 23 m.) */
export function isOnOwnHalf(p: Point, dir: AttackDir): boolean {
  const yM = p.y * FIELD.totalLengthM
  return dir === 'up' ? yM < FIELD.midlineM : yM > FIELD.midlineM
}

/** Raakt/overschrijdt het punt de middellijn richting tegenhelft? (voor de 2e-worp-regel) */
export function reachedMidline(p: Point, dir: AttackDir): boolean {
  const yM = p.y * FIELD.totalLengthM
  return dir === 'up' ? yM >= FIELD.midlineM : yM <= FIELD.midlineM
}

/** Ligt het punt in het doelgebied dat de aanvallende ploeg bespeelt? */
export function isInTargetGoalArea(p: Point, dir: AttackDir): boolean {
  if (p.x < 0 || p.x > 1) return false
  const yM = p.y * FIELD.totalLengthM
  return dir === 'up' ? yM >= FIELD.awayGoalLineM : yM <= FIELD.homeGoalLineM
}

/** Voorbij de zijlijn? */
export function isOutSide(p: Point): boolean {
  return p.x < 0 || p.x > 1
}

/** Voorbij de achterlijn aan de aangevallen zijde (achter het doel)? */
export function isOutBack(p: Point, dir: AttackDir): boolean {
  return dir === 'up' ? p.y > 1 : p.y < 0
}
