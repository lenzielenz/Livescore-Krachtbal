import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from './club-colors'
import { formatDateBE } from './datetime'
import type { MatchState, TimelineItem } from './match-engine'
import { reeksNaam } from './reeksen'
import type { WinfieDesign } from './winfie-design'

export type WinfiePoint = { home: number; away: number; half: number; gameClock: number }

export function winfieProgress(timeline: TimelineItem[]): WinfiePoint[] {
  const points: WinfiePoint[] = [{ home: 0, away: 0, half: 1, gameClock: 0 }]
  let home = 0
  let away = 0
  for (const item of timeline) {
    if (item.kind !== 'goal' || !item.side) continue
    const value = Math.max(1, Number(item.label.match(/\+(\d+)/)?.[1]) || 1)
    if (item.side === 'home') home += value
    else away += value
    points.push({ home, away, half: item.half, gameClock: item.gameClock })
  }
  return points
}

export function winfieVariant(matchId: number, photoId = 0): 0 | 1 | 2 | 3 {
  return Math.abs((matchId * 31 + photoId * 17) % 4) as 0 | 1 | 2 | 3
}

export function winfieHeadline(home: string, away: string, score: { home: number; away: number }): string {
  const diff = score.home - score.away
  if (diff === 0) return 'PUNT GEDEELD'
  const winner = diff > 0 ? home : away
  const margin = Math.abs(diff)
  if (margin >= 12) return `${winner} DOMINEERT`
  if (margin >= 6) return `${winner} OVERTUIGT`
  if (margin <= 2) return `${winner} WINT DE THRILLER`
  return `${winner} PAKT DE WINST`
}

const safeColor = (v: unknown, fallback: string) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v) : fallback)

/**
 * Bouwt de volledige Winfie-compositie uit data die de wedstrijdpagina toch al heeft (geen
 * eigen DB- of netwerkverkeer). Logo's en foto worden als gewone URL doorgegeven — de browser
 * laadt ze zelf, net als elke andere afbeelding op de pagina. Zo blijft dit puur en snel, en kan
 * er niets meer op een trage/mislukte server-side beeldbewerking vastlopen.
 */
export function buildWinfieDesign(
  state: MatchState,
  timeline: TimelineItem[],
  opts: {
    photoHref?: string
    photoId?: number
    iWasThere?: boolean
    /** matches.liveReactions — de emoji-tellers die tijdens de wedstrijd verzameld werden. */
    reactions?: Record<string, number>
    /** Overige activiteit (tribuneberichten + -foto's) die niet als losse reactie meetelt, maar
     * wel bewijst dat er wat leefde. */
    momentsExtra?: number
  } = {},
): WinfieDesign {
  const { score, teams } = state
  const winner = score.home > score.away ? 'home' : score.away > score.home ? 'away' : 'draw'
  const winningColors = winner === 'home' ? teams.home.colors : winner === 'away' ? teams.away.colors : null
  const primary = safeColor(winningColors?.primary, '#0f8a5f')
  const secondary = readableOnDark(safeColor(winningColors?.secondary, '#d8b44b'))
  const homeColor = readableOnDark(safeColor(teams.home.colors?.primary, DEFAULT_HOME_COLOR))
  const awayColor = readableOnDark(safeColor(teams.away.colors?.primary, DEFAULT_AWAY_COLOR))
  const date = state.match.date
    ? formatDateBE(new Date(state.match.date), { day: '2-digit', month: 'long', year: 'numeric' })
    : ''
  const series = state.match.reeks ? reeksNaam(state.match.reeks) : 'Krachtbal'
  const progress = winfieProgress(timeline)
  const last = progress.at(-1)
  // Ook een geïmporteerde/handmatig bevestigde eindstand zonder volledige doelpuntentijdlijn
  // eindigt correct in de grafiek.
  if (!last || last.home !== score.home || last.away !== score.away) {
    progress.push({ home: score.home, away: score.away, half: 2, gameClock: 0 })
  }
  return {
    home: teams.home.name,
    away: teams.away.name,
    score,
    winner,
    primary,
    secondary,
    homeColor,
    awayColor,
    headline: winfieHeadline(teams.home.name, teams.away.name, score),
    date,
    reeks: series,
    progress,
    variant: winfieVariant(state.match.id, opts.photoId ?? 0),
    photoHref: opts.photoHref,
    homeLogoHref: teams.home.logoUrl ?? undefined,
    awayLogoHref: teams.away.logoUrl ?? undefined,
    homeLogoFit: teams.home.logoFit,
    awayLogoFit: teams.away.logoFit,
    iWasThere: opts.iWasThere,
    reactions: opts.reactions,
    momentsExtra: opts.momentsExtra,
  }
}
