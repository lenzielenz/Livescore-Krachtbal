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
  /** Nog te spelen wedstrijden — voor de onderlinge duels met een rivaal. De datum is enkel nodig
   *  om de duels met de rivalen chronologisch te noemen (openDuels). */
  fixtures: { homeId: number; awayId: number; date?: string | null }[]
  /** Afgespeelde wedstrijden — voor het onderling resultaat bij gelijke punten. */
  results: StandingsMatch[]
}

/** Wat de titelsimulatie (titelKansen) voor de boodschap oplevert, met namen ingevuld. */
export interface TitelKansInfo {
  /** Titelkans van de eigen ploeg (0–1). */
  eigen: number
  /** De andere ploeg met de grootste titelkans. */
  favoriet: { naam: string; kans: number } | null
  /** Enkel voor de leider: de nummer twee in de stand, voor de voorsprong. */
  naaste: { naam: string; punten: number } | null
  /** Nog te spelen duels tegen titelrivalen, chronologisch — bv. "D&W Koekelare (za 13 maart)". */
  duels: string[]
}

/**
 * Eén regel over de titelstrijd voor boven de rangschikking, vanuit de eigen ploeg van wie kijkt —
 * of null wanneer er niets zinvols te melden valt (begin van het seizoen, of geen titelkans meer).
 *
 * Wat er staat, klopt altijd: wiskundig kampioen of het exacte aantal zeges dat nog nodig is (dicht
 * bij de meet), en anders een titelkans uit de simulatie van de rest van het seizoen — nooit een
 * vaste datum, want die hangt af van uitslagen die nog niet gespeeld zijn.
 */
export function titelBoodschap(input: {
  /** Titelstatus van de eigen ploeg (clinchStatus). */
  status: ClinchResult | null
  ploegNaam: string | null
  reeksLabel: string
  /** Aantal ploegen in de stand — met één ploeg is er geen titelstrijd. */
  teamsInTable: number
  /** Hoeveel punten de eigen ploeg achter de leider staat (0 = gedeelde leiding). */
  achterstand?: number
  /** Titelkansen uit de simulatie (titelKansen); zonder valt de boodschap terug op de zeges. */
  kansen?: TitelKansInfo | null
}): { text: string; clinched: boolean } | null {
  const { status, ploegNaam, reeksLabel, teamsInTable, kansen } = input
  if (!status || !ploegNaam || teamsInTable < 2) return null
  if (status.clinched) return { text: `${ploegNaam} is wiskundig kampioen van ${reeksLabel}.`, clinched: true }
  if (status.remaining <= 0) return null
  const plaats = plaatsTekst(ploegNaam, status, input.achterstand ?? 0)
  const zeges = status.winsToClinch
  // Dicht bij de meet is het exacte aantal zeges het sterkste nieuws: dat staat vast.
  if (zeges != null && zeges > 0 && zeges <= DICHTBIJ_ZEGES) return { text: zegesTekst(plaats, zeges), clinched: false }
  if (kansen) {
    // Wie (bijna) geen kans meer maakt, krijgt geen titelregel; de stand spreekt dan voor zich.
    if (!status.leading && kansen.eigen < 0.01) return null
    const delen = [voorsprongTekst(ploegNaam, status, plaats, kansen.naaste)]
    const fav = kansen.favoriet && kansen.favoriet.kans >= 0.01 ? kansen.favoriet : null
    const favTekst = fav ? (status.leading ? `, ${fav.naam} ${procent(fav.kans)}` : `, favoriet is ${fav.naam} (${procent(fav.kans)})`) : ''
    delen.push(`Titelkans ${procent(kansen.eigen)}${favTekst}.`)
    if (kansen.duels.length > 0) delen.push(`Nog te spelen tegen ${opsomming(kansen.duels)}.`)
    return { text: delen.join(' '), clinched: false }
  }
  if (zeges == null || zeges <= 0) return null
  return { text: zegesTekst(plaats, zeges), clinched: false }
}

/** Vanaf hoeveel resterende zeges het exacte aantal de titelkans vervangt. */
const DICHTBIJ_ZEGES = 3

/**
 * "X leidt met 2 punten voor Y: na één nederlaag kan Y gelijkkomen." Een nederlaag kost de leider
 * maar WIN_BONUS (2) punten t.o.v. een rivaal die wint — verlies levert immers nog 2 op.
 */
function voorsprongTekst(ploeg: string, status: ClinchResult, plaats: string, naaste: TitelKansInfo['naaste']): string {
  if (!status.leading || !naaste) return `${plaats}.`
  const verschil = status.points - naaste.punten
  if (verschil <= 0) return `${ploeg} deelt de leiding met ${naaste.naam}.`
  const nederlagen = Math.ceil(verschil / WIN_BONUS)
  const woord = nederlagen === 1 ? 'één nederlaag' : nederlagen === 2 ? 'twee nederlagen' : `${nederlagen} nederlagen`
  const gevolg = verschil % WIN_BONUS === 0 ? 'gelijkkomen' : 'erover'
  const punten = `${verschil} ${verschil === 1 ? 'punt' : 'punten'}`
  return `${ploeg} leidt met ${punten} voor ${naaste.naam}: na ${woord} kan ${naaste.naam} ${gevolg}.`
}

/** 0,483 → "± 48%"; de randen eerlijk als "< 1%" en "> 99%" (wiskundig ligt het nog open). */
function procent(kans: number): string {
  if (kans < 0.01) return '< 1%'
  if (kans > 0.99) return '> 99%'
  return `± ${Math.round(kans * 100)}%`
}

const opsomming = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} en ${xs[xs.length - 1]}`)

/** "X leidt", "X deelt de leiding" of "X staat 3e op 2 punten". */
function plaatsTekst(ploeg: string, status: ClinchResult, achterstand: number): string {
  if (status.leading) return `${ploeg} leidt`
  if (achterstand <= 0) return `${ploeg} deelt de leiding`
  return `${ploeg} staat ${status.rank}e op ${achterstand} ${achterstand === 1 ? 'punt' : 'punten'}`
}

const zegesTekst = (plaats: string, zeges: number) =>
  `${plaats} en heeft nog ${zeges} ${zeges === 1 ? 'zege' : 'zeges'} nodig om de titel te verzekeren.`

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

/** Aantal keer dat de rest van het seizoen wordt nagespeeld. */
const SIMULATIES = 5000
/** Denkbeeldige wedstrijden "half gewonnen" bij elke ploeg: dempt de vorm na weinig wedstrijden. */
const VORM_DEMPING = 4
/** Gelijkspelkans als de reeks er zelf nog te weinig over zegt, en hoe zwaar die weegt. */
const GELIJK_BASIS = 0.08
const GELIJK_DEMPING = 12

/** Kleine, voorspelbare toevalsgenerator (mulberry32): dezelfde stand geeft dezelfde kansen. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Titelkans per ploeg: speelt de resterende kalender duizenden keren na, telkens met andere
 * uitslagen, en telt hoe vaak elke ploeg bovenaan eindigt.
 *
 * Waarom geen vast scenario: of de leider kampioen wordt, hangt niet enkel af van zijn eigen
 * wedstrijden maar ook van wat de achtervolgers van elkaar afpakken — en van de duels met hen,
 * die dubbel tellen. Eén "als alles loopt zoals tot nu"-scenario negeert dat de leider ook kan
 * verliezen. De simulatie neemt alles mee:
 *  • elke wedstrijd krijgt een winkans uit de vorm van beide ploegen (log5 op het gedempte
 *    winstpercentage tot nu, gelijk = halve zege) en een gelijkspelkans uit de reeks zelf; die
 *    vorm is onzeker na weinig wedstrijden, en dat zit mee in de simulatie;
 *  • alle resterende duels worden gespeeld, ook die van de rivalen onderling;
 *  • gelijke punten beslist het onderling resultaat (punten in de duels tussen de gelijke ploegen,
 *    inclusief de gesimuleerde), daarna het huidige doelsaldo.
 * De generator is vast gezaaid: wie de pagina herlaadt, ziet hetzelfde getal tot er een uitslag
 * bijkomt.
 */
export function titelKansen(standings: StandingRow[], ctx: ClinchContext, runs = SIMULATIES): Map<number, number> {
  const n = standings.length
  const kansen = new Map(standings.map((r) => [r.teamId, 0]))
  if (n === 0) return kansen
  const idx = new Map(standings.map((r, i) => [r.teamId, i]))

  // Sterkte = gedempt winstpercentage, met de onzekerheid die bij zo weinig wedstrijden hoort: na
  // zes zeges weet je niet of een ploeg 70% of 90% van haar wedstrijden wint. Elke simulatie trekt
  // daarom eerst een sterkte per ploeg rond dat gemiddelde (normale benadering van de beta-
  // verdeling), en speelt daarmee het seizoen af.
  const sterkte = standings.map((r) => (r.won + r.drawn / 2 + VORM_DEMPING / 2) / (r.played + VORM_DEMPING))
  const spreiding = standings.map((r, i) => Math.sqrt((sterkte[i] * (1 - sterkte[i])) / (r.played + VORM_DEMPING + 1)))
  const getrokken = new Float64Array(n)
  const gespeeld = standings.reduce((s, r) => s + r.played, 0) / 2
  const gelijk = standings.reduce((s, r) => s + r.drawn, 0) / 2
  const pGelijk = Math.min(0.35, Math.max(0.02, (gelijk + GELIJK_BASIS * GELIJK_DEMPING) / (gespeeld + GELIJK_DEMPING)))

  // Onderlinge punten uit de gespeelde wedstrijden: h2h[i * n + j] = punten van i tegen j.
  const h2hBasis = new Float64Array(n * n)
  for (const m of ctx.results) {
    const h = idx.get(m.homeId)
    const a = idx.get(m.awayId)
    if (h == null || a == null) continue
    const duel = computeStandings([m], [m.homeId, m.awayId])
    h2hBasis[h * n + a] += duel.find((d) => d.teamId === m.homeId)?.points ?? 0
    h2hBasis[a * n + h] += duel.find((d) => d.teamId === m.awayId)?.points ?? 0
  }

  const duels = ctx.fixtures.flatMap((f) => {
    const h = idx.get(f.homeId)
    const a = idx.get(f.awayId)
    return h == null || a == null || h === a ? [] : [{ h, a }]
  })

  const basis = standings.map((r) => r.points)
  const punten = new Float64Array(n)
  const h2h = new Float64Array(n * n)
  const tel = new Float64Array(n)
  const rnd = mulberry32(0x6b6b6266 ^ (duels.length * 2654435761))
  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < n; i++) punten[i] = basis[i]
    h2h.set(h2hBasis)
    for (let i = 0; i < n; i++) {
      // Box-Muller: één normaal verdeeld getal per ploeg.
      const z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
      getrokken[i] = Math.min(0.97, Math.max(0.03, sterkte[i] + z * spreiding[i]))
    }
    for (const d of duels) {
      const sh = getrokken[d.h]
      const sa = getrokken[d.a]
      const pThuis = ((1 - pGelijk) * sh * (1 - sa)) / (sh * (1 - sa) + sa * (1 - sh))
      const x = rnd()
      const [ph, pa] = x < pThuis ? [WIN, LOSS] : x < pThuis + pGelijk ? [STANDINGS_POINTS.draw, STANDINGS_POINTS.draw] : [LOSS, WIN]
      punten[d.h] += ph
      punten[d.a] += pa
      h2h[d.h * n + d.a] += ph
      h2h[d.a * n + d.h] += pa
    }
    let max = -Infinity
    for (let i = 0; i < n; i++) max = Math.max(max, punten[i])
    const gelijken: number[] = []
    for (let i = 0; i < n; i++) if (punten[i] === max) gelijken.push(i)
    let winnaar = gelijken[0]
    if (gelijken.length > 1) {
      let beste = -Infinity
      for (const i of gelijken) {
        let onder = 0
        for (const j of gelijken) if (j !== i) onder += h2h[i * n + j]
        // Onderling eerst, dan doelsaldo; de stand is al op doelsaldo gesorteerd.
        const score = onder * 1e6 + standings[i].diff
        if (score > beste) {
          beste = score
          winnaar = i
        }
      }
    }
    tel[winnaar]++
  }
  standings.forEach((r, i) => kansen.set(r.teamId, tel[i] / runs))
  return kansen
}

/** De nog te spelen wedstrijden van een ploeg tegen een van de opgegeven rivalen, chronologisch. */
export function openDuels(ctx: ClinchContext, teamId: number, rivalen: Set<number>): { tegenstanderId: number; date: string | null }[] {
  return ctx.fixtures
    .filter((f) => (f.homeId === teamId && rivalen.has(f.awayId)) || (f.awayId === teamId && rivalen.has(f.homeId)))
    .map((f) => ({ tegenstanderId: f.homeId === teamId ? f.awayId : f.homeId, date: f.date ?? null }))
    .sort((x, y) => (x.date ?? '9999').localeCompare(y.date ?? '9999'))
}
