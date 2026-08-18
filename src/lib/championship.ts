// Mathematisch kampioen: berekent uit de stand + resterende kalender of een ploeg de titel al
// zeker heeft, of hoe dichtbij ze is. Puntenconventie: winst 4, gelijk 3, verlies 2 (zie
// standings.ts) — een overwinning levert dus maximaal 4 punten per resterende wedstrijd op.

import type { StandingRow } from './standings'

const WIN = 4

export interface ClinchResult {
  /** 1-gebaseerde positie in de stand. */
  rank: number
  points: number
  /** Resterende wedstrijden van deze ploeg. */
  remaining: number
  /** Wiskundig al kampioen (niet meer in te halen). */
  clinched: boolean
  /** Staat (mee) aan de leiding. */
  leading: boolean
  /** Aantal punten dat de ploeg nog moet pakken om de titel te verzekeren (null = wiskundig
   * onmogelijk om nog zeker te zijn; 0 = al kampioen). */
  pointsToClinch: number | null
  /** Overeenkomstig aantal overwinningen (afgerond). */
  winsToClinch: number | null
}

/**
 * Eén regel over de titelstrijd voor boven de rangschikking — of null wanneer er niets zinvols te
 * melden valt (begin van het seizoen: iedereen kan nog kampioen worden, dus zwijgen we).
 */
export function titelBoodschap(input: {
  status: ClinchResult | null
  leaderName: string | null
  reeksLabel: string
  /** Aantal ploegen in de stand — met één ploeg is er geen titelstrijd. */
  teamsInTable: number
}): { text: string; clinched: boolean } | null {
  const { status, leaderName, reeksLabel, teamsInTable } = input
  if (!status || !leaderName || teamsInTable < 2) return null
  if (status.clinched) return { text: `${leaderName} is wiskundig kampioen van ${reeksLabel}.`, clinched: true }
  const zeges = status.winsToClinch
  if (zeges == null || zeges <= 0 || status.remaining <= 0) return null
  return {
    text: `${leaderName} leidt en heeft nog ${zeges} ${zeges === 1 ? 'zege' : 'zeges'} nodig om de titel te verzekeren.`,
    clinched: false,
  }
}

/** Status van één ploeg in de titelstrijd van haar reeks. */
export function clinchStatus(standings: StandingRow[], remaining: Map<number, number>, teamId: number): ClinchResult | null {
  const idx = standings.findIndex((r) => r.teamId === teamId)
  if (idx < 0) return null
  const me = standings[idx]
  const myRem = remaining.get(teamId) ?? 0
  const others = standings.filter((r) => r.teamId !== teamId)
  const rivalMax = (r: StandingRow) => r.points + (remaining.get(r.teamId) ?? 0) * WIN
  const bestRivalMax = others.length ? Math.max(...others.map(rivalMax)) : 0

  const anyRemaining = myRem > 0 || others.some((r) => (remaining.get(r.teamId) ?? 0) > 0)
  // Zeker kampioen als geen enkele tegenstander de huidige punten nog kan evenaren of voorbijsteken,
  // of als het seizoen helemaal gespeeld is en deze ploeg bovenaan staat (incl. doelsaldo-tiebreak).
  const clinchedByPoints = others.length > 0 && others.every((r) => me.points > rivalMax(r))
  const clinched = clinchedByPoints || (!anyRemaining && idx === 0)

  const need = Math.max(0, bestRivalMax - me.points + 1)
  const reachable = need <= myRem * WIN

  return {
    rank: idx + 1,
    points: me.points,
    remaining: myRem,
    clinched,
    leading: idx === 0,
    pointsToClinch: clinched ? 0 : reachable ? need : null,
    winsToClinch: clinched ? 0 : reachable ? Math.ceil(need / WIN) : null,
  }
}
