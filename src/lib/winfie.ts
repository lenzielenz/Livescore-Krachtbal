import type { TimelineItem } from './match-engine'

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
