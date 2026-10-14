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

import { dateStrBE } from './datetime'
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
  /** Nog te spelen wedstrijden — voor de onderlinge duels met een rivaal. De datum is enkel nodig
   *  voor de vooruitblik (titelProjectie). */
  fixtures: { homeId: number; awayId: number; date?: string | null }[]
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
  /** Vooruitblik (zie titelProjectie): wanneer de titel kan vallen als de leider blijft winnen. */
  projectie?: { datum: string; tegenstander: string | null } | null
}): { text: string; clinched: boolean } | null {
  const { status, leaderName, reeksLabel, teamsInTable, projectie } = input
  if (!status || !leaderName || teamsInTable < 2) return null
  if (status.clinched) return { text: `${leaderName} is wiskundig kampioen van ${reeksLabel}.`, clinched: true }
  if (status.remaining <= 0) return null
  const zeges = status.winsToClinch
  // Dicht bij de meet is het exacte aantal zeges het sterkste nieuws: dat staat vast.
  if (zeges != null && zeges > 0 && zeges <= DICHTBIJ_ZEGES) return { text: zegesTekst(leaderName, zeges), clinched: false }
  // Daarvoor zegt "nog 17 zeges" weinig. De vooruitblik verschuift elke week met de uitslagen.
  if (projectie) {
    const tegen = projectie.tegenstander ? ` tegen ${projectie.tegenstander}` : ''
    return {
      text: `${leaderName} leidt. Blijft ${leaderName} winnen en speelt de rest zoals tot nu, dan valt de titel op ${projectie.datum}${tegen}.`,
      clinched: false,
    }
  }
  if (zeges == null || zeges <= 0) return null
  return { text: zegesTekst(leaderName, zeges), clinched: false }
}

/** Vanaf hoeveel resterende zeges het exacte aantal de vooruitblik vervangt. */
const DICHTBIJ_ZEGES = 3

const zegesTekst = (leader: string, zeges: number) =>
  `${leader} leidt en heeft nog ${zeges} ${zeges === 1 ? 'zege' : 'zeges'} nodig om de titel te verzekeren.`

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

/** Onder dit verschil in punten per wedstrijd tellen twee ploegen als even sterk: gelijkspel. */
const GELIJKE_VORM = 0.05

/**
 * Vooruitblik: op welke speeldag kan deze ploeg de titel vastleggen?
 *
 * "Nog 17 zeges" klopt wiskundig, maar zegt in oktober niets: het rekent alsof elke achtervolger
 * al zijn wedstrijden wint, ook die tegen elkaar. In werkelijkheid pakken ze punten van elkaar af.
 * Deze vooruitblik speelt daarom de resterende kalender speeldag per speeldag af:
 *  • de ploeg zelf wint al haar wedstrijden (de vraag is "wanneer KAN je kampioen spelen");
 *  • elke andere wedstrijd gaat naar de ploeg in de beste vorm, gemeten in punten per gespeelde
 *    wedstrijd tot nu toe; bij gelijke vorm wordt het gelijkspel.
 * Na elke speeldag toetst ze met clinchStatus of de titel wiskundig vastligt. De eerste speeldag
 * waarop dat zo is, is het antwoord. Omdat de vorm uit de echte uitslagen komt, verschuift de
 * datum elke week mee.
 *
 * Geeft null als het niet te bepalen valt (geen datums in de kalender, of nooit zeker).
 */
export function titelProjectie(
  standings: StandingRow[],
  ctx: ClinchContext,
  teamId: number,
): { datum: string; tegenstanderId: number | null } | null {
  if (!standings.some((r) => r.teamId === teamId)) return null
  const vorm = new Map(standings.map((r) => [r.teamId, r.played > 0 ? r.points / r.played : STANDINGS_POINTS.draw]))
  const punten = new Map(standings.map((r) => [r.teamId, r.points]))

  // Enkel wedstrijden met een datum laten zich op een speeldag zetten.
  const gedateerd = ctx.fixtures
    .filter((f): f is { homeId: number; awayId: number; date: string } => typeof f.date === 'string' && f.date.length > 0)
    .filter((f) => !Number.isNaN(new Date(f.date).getTime()))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (gedateerd.length === 0) return null
  const dagen = new Map<string, typeof gedateerd>()
  for (const f of gedateerd) {
    const dag = dateStrBE(new Date(f.date))
    dagen.set(dag, [...(dagen.get(dag) ?? []), f])
  }

  let resterend = [...ctx.fixtures]
  const uitslagen = [...ctx.results]
  for (const [, wedstrijden] of dagen) {
    let tegenstanderId: number | null = null
    for (const f of wedstrijden) {
      let thuis: number
      if (f.homeId === teamId || f.awayId === teamId) {
        thuis = f.homeId === teamId ? STANDINGS_POINTS.win : STANDINGS_POINTS.loss
        tegenstanderId = f.homeId === teamId ? f.awayId : f.homeId
      } else {
        const verschil = (vorm.get(f.homeId) ?? 0) - (vorm.get(f.awayId) ?? 0)
        thuis = Math.abs(verschil) < GELIJKE_VORM ? STANDINGS_POINTS.draw : verschil > 0 ? STANDINGS_POINTS.win : STANDINGS_POINTS.loss
      }
      const uit = thuis === STANDINGS_POINTS.draw ? STANDINGS_POINTS.draw : thuis === STANDINGS_POINTS.win ? STANDINGS_POINTS.loss : STANDINGS_POINTS.win
      punten.set(f.homeId, (punten.get(f.homeId) ?? 0) + thuis)
      punten.set(f.awayId, (punten.get(f.awayId) ?? 0) + uit)
      // Ook als uitslag bewaren: het onderling resultaat bij gelijke punten telt mee.
      const goals = thuis === STANDINGS_POINTS.win ? [1, 0] : thuis === STANDINGS_POINTS.loss ? [0, 1] : [0, 0]
      uitslagen.push({ homeId: f.homeId, awayId: f.awayId, homeGoals: goals[0], awayGoals: goals[1], forfait: 'none' })
      const i = resterend.indexOf(f)
      if (i >= 0) resterend = [...resterend.slice(0, i), ...resterend.slice(i + 1)]
    }

    const stand = standings
      .map((r) => ({ ...r, points: punten.get(r.teamId) ?? r.points }))
      .sort((a, b) => b.points - a.points)
    const nogTeSpelen = new Map<number, number>()
    for (const f of resterend) {
      nogTeSpelen.set(f.homeId, (nogTeSpelen.get(f.homeId) ?? 0) + 1)
      nogTeSpelen.set(f.awayId, (nogTeSpelen.get(f.awayId) ?? 0) + 1)
    }
    const status = clinchStatus(stand, nogTeSpelen, teamId, { fixtures: resterend, results: uitslagen })
    if (status?.clinched) return { datum: wedstrijden[0].date, tegenstanderId }
  }
  return null
}
