// ── Automatisch matchverslag (krantstijl) ────────────────────────────────────────────────────
// Zet de ruwe wedstrijddata om in een leesbaar verslag in het Nederlands: kop, inleiding en een
// paar alinea's over het verloop, de doelpuntenmakers en de opvallende cijfers. Puur en getest —
// geen DB, geen willekeur: dezelfde wedstrijd geeft altijd hetzelfde verslag.
//
// Alles wordt AFGELEID uit de doelpunten-events (event-sourcing blijft de enige bron van waarheid);
// er wordt niets extra opgeslagen.

import type { TeamSide } from './krachtbal-rules'

export interface ReportGoal {
  half: number
  gameClock: number
  side: TeamSide
  /** Punten van dit doelpunt (nekworp 1, rugworp 2). */
  points: number
  playerName?: string | null
  shirtNumber?: number | null
}

export interface ReportInput {
  home: string
  away: string
  score: { home: number; away: number }
  crosses: { home: number; away: number }
  goals: ReportGoal[]
  reeks?: string | null
  datum?: string | null
  /** Held van de match (supporterstem), als er gestemd werd. */
  mvp?: { name: string; votes: number } | null
}

export interface MatchReport {
  headline: string
  lead: string
  paragraphs: string[]
}

const sideName = (i: ReportInput, side: TeamSide) => (side === 'home' ? i.home : i.away)

/** De stand na een bepaalde helft (cumulatief). */
export function scoreAfterHalf(goals: ReportGoal[], half: number): { home: number; away: number } {
  const out = { home: 0, away: 0 }
  for (const g of goals) {
    if (g.half > half) continue
    out[g.side] += g.points
  }
  return out
}

/** De langste reeks doelpunten op rij van één ploeg. */
export function longestRun(goals: ReportGoal[]): { side: TeamSide; length: number } | null {
  let best: { side: TeamSide; length: number } | null = null
  let side: TeamSide | null = null
  let run = 0
  for (const g of goals) {
    if (g.side === side) run += 1
    else {
      side = g.side
      run = 1
    }
    if (!best || run > best.length) best = { side, length: run }
  }
  return best
}

export interface ScorerLine {
  name: string
  shirtNumber: number | null
  side: TeamSide
  goals: number
  points: number
  /** Rugworpen (2 punten) — het krachtige werk. */
  rug: number
}

// Het wedstrijdblad vult een doelpunt zonder gekende scorer op met een streepje/vraagteken (en
// rugnummer 0). Zulke "namen" horen niet in een verslag — in supporters-modus is doel gewoon doel.
const PLACEHOLDER_NAMES = new Set(['—', '-', '–', '?', '??', 'onbekend'])

/** Doelpuntenmakers, gesorteerd op punten (meeste eerst). Doelpunten zonder naam vallen weg. */
export function scorerLines(goals: ReportGoal[]): ScorerLine[] {
  const by = new Map<string, ScorerLine>()
  for (const g of goals) {
    const name = (g.playerName ?? '').trim()
    if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) continue
    const key = `${g.side}:${name}`
    const line = by.get(key) ?? {
      name,
      shirtNumber: typeof g.shirtNumber === 'number' ? g.shirtNumber : null,
      side: g.side,
      goals: 0,
      points: 0,
      rug: 0,
    }
    line.goals += 1
    line.points += g.points
    if (g.points >= 2) line.rug += 1
    by.set(key, line)
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name))
}

function headlineFor(i: ReportInput): string {
  const { home, away } = i
  const diff = i.score.home - i.score.away
  const margin = Math.abs(diff)
  const winner = diff > 0 ? home : away
  const loser = diff > 0 ? away : home
  if (diff === 0) return `${home} en ${away} houden elkaar in evenwicht`
  if (margin >= 12) return `${winner} overklast ${loser}`
  if (margin >= 6) return `${winner} rekent overtuigend af met ${loser}`
  if (margin >= 3) return `${winner} houdt ${loser} van zich af`
  return `${winner} haalt het nipt van ${loser}`
}

function leadFor(i: ReportInput): string {
  const context = [i.reeks, i.datum].filter(Boolean).join(' · ')
  const base = `${i.home} – ${i.away} eindigde op ${i.score.home}–${i.score.away}.`
  return context ? `${base} (${context})` : base
}

/** Alinea over het verloop: ruststand, omkeer, en de scherpste reeks. */
function flowParagraph(i: ReportInput): string | null {
  if (i.goals.length === 0) return null
  const bits: string[] = []
  const half1 = scoreAfterHalf(i.goals, 1)
  const hasSecondHalf = i.goals.some((g) => g.half >= 2)
  if (hasSecondHalf) {
    if (half1.home === half1.away) {
      bits.push(`Bij de rust stond het gelijk: ${half1.home}–${half1.away}.`)
    } else {
      const leader = half1.home > half1.away ? i.home : i.away
      bits.push(`${leader} ging met een voorsprong de rust in (${half1.home}–${half1.away}).`)
      // Omkeer: wie aan de rust leidde, verloor uiteindelijk.
      const leadSide: TeamSide = half1.home > half1.away ? 'home' : 'away'
      const finalDiff = i.score.home - i.score.away
      const lostIt = (leadSide === 'home' && finalDiff < 0) || (leadSide === 'away' && finalDiff > 0)
      const heldOn = finalDiff === 0
      if (lostIt) {
        bits.push(`Na de pauze draaide ${sideName(i, leadSide === 'home' ? 'away' : 'home')} de wedstrijd alsnog om.`)
      } else if (heldOn) {
        bits.push('Na de pauze kwam de tegenstander helemaal terug.')
      }
    }
  }
  const run = longestRun(i.goals)
  if (run && run.length >= 4) {
    bits.push(`${sideName(i, run.side)} zette de scherpste reeks neer: ${run.length} doelpunten op rij.`)
  }
  return bits.length ? bits.join(' ') : null
}

/** Alinea over de doelpuntenmakers. */
function scorersParagraph(i: ReportInput): string | null {
  const lines = scorerLines(i.goals)
  if (lines.length === 0) return null
  const top = lines[0]
  const nr = top.shirtNumber != null ? `#${top.shirtNumber} ` : ''
  const bits = [
    `${nr}${top.name} (${sideName(i, top.side)}) was het meest trefzeker met ${top.goals} ${top.goals === 1 ? 'doelpunt' : 'doelpunten'} voor ${top.points} ${top.points === 1 ? 'punt' : 'punten'}.`,
  ]
  if (top.rug > 0) {
    bits.push(`Daarvan ${top.rug === 1 ? 'was er één een rugworp' : `waren er ${top.rug} rugworpen`}.`)
  }
  const runnerUp = lines[1]
  if (runnerUp && runnerUp.points > 0) {
    const nr2 = runnerUp.shirtNumber != null ? `#${runnerUp.shirtNumber} ` : ''
    bits.push(`${nr2}${runnerUp.name} volgde met ${runnerUp.points} ${runnerUp.points === 1 ? 'punt' : 'punten'}.`)
  }
  return bits.join(' ')
}

/** Alinea over de cijfers: rugworpen en kruisjes. */
function numbersParagraph(i: ReportInput): string | null {
  const bits: string[] = []
  const rug = i.goals.filter((g) => g.points >= 2).length
  if (rug > 0) bits.push(`Er vielen ${rug} ${rug === 1 ? 'rugworp' : 'rugworpen'}.`)
  const crosses = i.crosses.home + i.crosses.away
  if (crosses > 0) {
    bits.push(
      crosses === 1
        ? 'Er ging één kruisje op het bord.'
        : `Samen gingen er ${crosses} kruisjes op het bord (${i.home} ${i.crosses.home}, ${i.away} ${i.crosses.away}).`,
    )
  }
  return bits.length ? bits.join(' ') : null
}

function mvpParagraph(i: ReportInput): string | null {
  if (!i.mvp || i.mvp.votes <= 0) return null
  return `De supporters kozen ${i.mvp.name} tot held van de match (${i.mvp.votes} ${i.mvp.votes === 1 ? 'stem' : 'stemmen'}).`
}

/**
 * Bouw het volledige verslag. Ontbreekt er data (geen doelpunten geregistreerd, geen namen),
 * dan valt de betrokken alinea gewoon weg — het verslag blijft altijd leesbaar.
 */
export function buildMatchReport(input: ReportInput): MatchReport {
  const paragraphs = [flowParagraph(input), scorersParagraph(input), numbersParagraph(input), mvpParagraph(input)].filter(
    (p): p is string => Boolean(p),
  )
  return {
    headline: headlineFor(input),
    lead: leadFor(input),
    paragraphs,
  }
}
