// De pass — pure regellogica. Bron: KVKBF reglement 01072025, §6.10 en Item 14.10.
//
// Spelers mogen de bal vóór een worp aan elkaar doorgeven, maar enkel ZIJWAARTS (evenwijdig aan de
// middellijn) of ACHTERWAARTS. Een voorwaartse of schuin-voorwaartse pass is een fout: opzet voor de
// tegenpartij vanaf de vórige werpplaats. Uitzondering: in het eigen doelgebied mag voorwaarts.
//
// Een pass verbruikt géén werpbeurt; hij verlegt enkel de werpplaats naar waar de vanger staat.

import {
  type AttackDir,
  type Point,
  FIELD,
  isInOwnGoalArea,
  totalLengthM,
} from './field'

/**
 * Speling op "evenwijdig aan de middellijn". Een tik op het veldschema is niet millimeterprecies en
 * een scheidsrechter fluit een pass van een halve meter vooruit niet af — zonder deze marge zou elke
 * zijwaartse pass die toevallig 20 cm naar voren gaat als fout geregistreerd worden.
 */
export const PASS_TOLERANCE_M = 1

/**
 * Voorwaartse (of schuin-voorwaartse) pass = fout (§6.10 / Item 14.10).
 * `from` is de huidige werpplaats, `to` waar de vanger staat.
 */
export function isForwardPass(
  from: Point,
  to: Point,
  dir: AttackDir,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
): boolean {
  // In het eigen doelgebied mag wél voorwaarts gepast worden (§6.10).
  if (isInOwnGoalArea(from, dir, goalAreaDepthM)) return false
  const tol = PASS_TOLERANCE_M / totalLengthM(goalAreaDepthM)
  const gained = dir === 'up' ? to.y - from.y : from.y - to.y
  return gained > tol
}

/** Hoeveel meter winst (+) of terugloop (−) een pass richting het doel oplevert — voor de analyse. */
export function passGainM(
  from: Point,
  to: Point,
  dir: AttackDir,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
): number {
  const gained = dir === 'up' ? to.y - from.y : from.y - to.y
  return Math.round(gained * totalLengthM(goalAreaDepthM) * 100) / 100
}
