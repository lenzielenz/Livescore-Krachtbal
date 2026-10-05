// Mathematisch kampioen: berekent uit de stand + resterende kalender of een ploeg de titel al
// zeker heeft, of hoe dichtbij ze is. Puntenconventie: winst 4, gelijk 3, verlies 2 (zie
// standings.ts) — ook een verlies levert dus nog 2 punten op, een zege maar 2 méér.
//
// Wat telt (alles in het slechtste geval voor de leider):
//  1. De leider verliest elke wedstrijd die hij niet wint (2 punten, niet 0), elke rivaal wint
//     al zijn wedstrijden (4 punten).
//  2. Een zege van de leider tégen een rivaal telt dubbel: hij pakt 4 i.p.v. 2, en de rivaal
//     krijgt 2 i.p.v. 4. De zeges die de leider nodig heeft, worden dus eerst in wedstrijden
//     tegen derden gerekend (die tellen voor 2) en pas daarna in de onderlinge duels (voor 4).
//  3. Bij gelijke punten beslist het onderling resultaat (punten in de duels tussen die twee).
//     Dat telt enkel als het al vaststaat, ook als de rivaal de resterende duels nog wint.
//
// Wat NIET telt: de wedstrijden van rivalen onderling. Elke rivaal kan afzonderlijk nog alles
// winnen, en één rivaal die de leider kan bijhalen is genoeg om de titel open te houden. Zodra
// zo'n duel gespeeld is, verandert de stand en dus de uitkomst — dat gaat vanzelf.
// Forfaits zijn niet voorzien (een leider die forfait geeft, krijgt 0 i.p.v. 2 punten).

import { computeStandings, STANDINGS_POINTS, type StandingRow, type StandingsMatch } from './standings'

const WIN = STANDINGS_POINTS.win
const LOSS = STANDINGS_POINTS.loss
/** Wat een zege méér oplevert dan een verlies. */
const WIN_BONUS = WIN - LOSS

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
  /** Aantal punten dat de ploeg nog uit haar resterende wedstrijden moet halen om de titel te
   * verzekeren, verliezen meegeteld (null = niet af te dwingen met eigen resultaten; 0 = al
   * kampioen). */
  pointsToClinch: number | null
  /** Aantal zeges dat daarvoor nodig is, welke wedstrijden het ook zijn (null = niet af te
   * dwingen). */
  winsToClinch: number | null
}

/** Wat de berekening buiten de stand nog nodig heeft: wie speelt nog tegen wie, en wie won al. */
export interface ClinchContext {
  /** Nog te spelen wedstrijden — voor de onderlinge duels met een rivaal. */
  fixtures: { homeId: number; awayId: number }[]
  /** Afgespeelde wedstrijden — voor het onderling resultaat bij gelijke punten. */
  results: StandingsMatch[]
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

type Rivaal = {
  points: number
  remaining: number
  /** Nog te spelen duels tussen de leider en deze rivaal. */
  onderling: number
  /** Punten in de al gespeelde duels tussen die twee; null = onderling resultaat onbekend. */
  h2h: { lead: number; rival: number } | null
}

/** Staat de leider na `wins` zeges (en verder enkel verliezen) gegarandeerd boven deze rivaal? */
function houdtStand(lead: { points: number; remaining: number }, r: Rivaal, wins: number): boolean {
  const andere = lead.remaining - r.onderling
  // De zeges gaan eerst naar wedstrijden tegen derden; pas daarna naar duels met deze rivaal.
  const winsOnderling = Math.max(0, wins - andere)
  const leadEind = lead.points + LOSS * lead.remaining + WIN_BONUS * wins
  const rivalEind = r.points + WIN * r.remaining - WIN_BONUS * winsOnderling
  if (leadEind !== rivalEind) return leadEind > rivalEind
  if (!r.h2h) return false
  const leadH = r.h2h.lead + WIN * winsOnderling + LOSS * (r.onderling - winsOnderling)
  const rivalH = r.h2h.rival + LOSS * winsOnderling + WIN * (r.onderling - winsOnderling)
  return leadH > rivalH
}

/** Status van één ploeg in de titelstrijd van haar reeks. */
export function clinchStatus(
  standings: StandingRow[],
  remaining: Map<number, number>,
  teamId: number,
  ctx?: ClinchContext,
): ClinchResult | null {
  const idx = standings.findIndex((r) => r.teamId === teamId)
  if (idx < 0) return null
  const me = standings[idx]
  const myRem = remaining.get(teamId) ?? 0
  const others = standings.filter((r) => r.teamId !== teamId)

  const rivalen: Rivaal[] = others.map((o) => {
    const oRem = remaining.get(o.teamId) ?? 0
    let onderling = 0
    let h2h: Rivaal['h2h'] = null
    if (ctx) {
      const tussen = (a: number, b: number) => (a === teamId && b === o.teamId) || (a === o.teamId && b === teamId)
      onderling = Math.min(ctx.fixtures.filter((f) => tussen(f.homeId, f.awayId)).length, myRem, oRem)
      const duels = computeStandings(ctx.results.filter((m) => tussen(m.homeId, m.awayId)), [teamId, o.teamId])
      h2h = {
        lead: duels.find((d) => d.teamId === teamId)?.points ?? 0,
        rival: duels.find((d) => d.teamId === o.teamId)?.points ?? 0,
      }
    }
    return { points: o.points, remaining: oRem, onderling, h2h }
  })

  // Het kleinste aantal zeges waarmee deze ploeg tegen elke rivaal gedekt is.
  let wins: number | null = null
  for (let w = 0; w <= myRem; w++) {
    if (rivalen.every((r) => houdtStand({ points: me.points, remaining: myRem }, r, w))) {
      wins = w
      break
    }
  }
  // Seizoen helemaal gespeeld en bovenaan: dan beslist de stand zelf (incl. doelsaldo-tiebreak).
  const anyRemaining = myRem > 0 || others.some((r) => (remaining.get(r.teamId) ?? 0) > 0)
  const clinched = (others.length > 0 && wins === 0) || (!anyRemaining && idx === 0)

  return {
    rank: idx + 1,
    points: me.points,
    remaining: myRem,
    clinched,
    leading: idx === 0,
    pointsToClinch: clinched ? 0 : wins == null ? null : LOSS * myRem + WIN_BONUS * wins,
    winsToClinch: clinched ? 0 : wins,
  }
}
