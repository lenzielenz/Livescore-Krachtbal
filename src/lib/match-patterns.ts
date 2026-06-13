import type { MatchStats, PlayerStats } from './stats'

// Per-wedstrijd patroonherkenning: terugkerende "zelfde speler / zelfde worp"-gewoontes binnen één
// wedstrijd — de vaste afwerker, de vaste opzetter, een voorspelbare zone of een rugworp-gewoonte.
// Bedoeld om de naam prominent en aanklikbaar te maken in de detail-analyse. Pure → los testbaar.

export type MatchPatternKind = 'afwerker' | 'opzetter' | 'zone' | 'rug'

export interface MatchPattern {
  playerId: number
  shirtNumber: number
  playerName: string
  teamSide: 'home' | 'away'
  kind: MatchPatternKind
  icon: string
  label: string
  detail: string
  /** Hoger = sterker/opvallender patroon (voor de sortering). */
  strength: number
}

const ZONE_NL: Record<'links' | 'midden' | 'rechts', string> = { links: 'links', midden: 'het midden', rechts: 'rechts' }

function domZone(z: { links: number; midden: number; rechts: number }): { zone: 'links' | 'midden' | 'rechts'; pct: number } | null {
  const tot = z.links + z.midden + z.rechts
  if (!tot) return null
  const top = (['links', 'midden', 'rechts'] as const).reduce((a, b) => (z[b] > z[a] ? b : a), 'links' as const)
  return { zone: top, pct: Math.round((z[top] / tot) * 100) }
}

function sidePatterns(players: PlayerStats[]): MatchPattern[] {
  const out: MatchPattern[] = []
  if (players.length === 0) return out
  const sum = (f: (p: PlayerStats) => number) => players.reduce((a, p) => a + f(p), 0)
  const totalLast = sum((p) => p.order.last)
  const totalFirst = sum((p) => p.order.first)

  const base = (p: PlayerStats) => ({ playerId: p.playerId, shirtNumber: p.shirtNumber, playerName: p.playerName, teamSide: p.teamSide })

  // Vaste afwerker: één speler neemt het leeuwendeel van de doelworpen (laatste worp).
  const finisher = [...players].sort((a, b) => b.order.last - a.order.last)[0]
  if (finisher && totalLast >= 4 && finisher.order.last >= 3 && finisher.order.last / totalLast >= 0.55) {
    const share = Math.round((finisher.order.last / totalLast) * 100)
    const dz = domZone(finisher.zones)
    const zoneBit = dz && dz.pct >= 45 ? ` · meestal via ${ZONE_NL[dz.zone]}` : ''
    out.push({
      ...base(finisher),
      kind: 'afwerker',
      icon: '🎯',
      label: 'Vaste afwerker',
      detail: `neemt ${finisher.order.last} van ${totalLast} doelworpen (${share}%)${zoneBit}`,
      strength: share + finisher.order.last,
    })
  }

  // Vaste opzetter: één speler neemt het leeuwendeel van de eerste worpen.
  const starter = [...players].sort((a, b) => b.order.first - a.order.first)[0]
  if (starter && totalFirst >= 4 && starter.order.first >= 3 && starter.order.first / totalFirst >= 0.55) {
    const share = Math.round((starter.order.first / totalFirst) * 100)
    out.push({
      ...base(starter),
      kind: 'opzetter',
      icon: '🧭',
      label: 'Vaste opzetter',
      detail: `start ${starter.order.first} van ${totalFirst} aanvallen (${share}%)`,
      strength: share + starter.order.first,
    })
  }

  // Voorspelbare zone / rugworp-gewoonte per speler met genoeg worpen.
  for (const p of players) {
    if (p.throws < 4) continue
    const dz = domZone(p.zones)
    if (dz && dz.pct >= 65) {
      out.push({
        ...base(p),
        kind: 'zone',
        icon: '🧲',
        label: `Bijna altijd ${dz.zone}`,
        detail: `${dz.pct}% van zijn worpen gaat naar ${ZONE_NL[dz.zone]}`,
        strength: dz.pct,
      })
    }
    const rugShare = p.throws ? p.byType.rug / p.throws : 0
    if (rugShare >= 0.6) {
      out.push({
        ...base(p),
        kind: 'rug',
        icon: '💪',
        label: 'Werpt vooral rugworpen',
        detail: `${Math.round(rugShare * 100)}% rugworpen (+2)`,
        strength: Math.round(rugShare * 100),
      })
    }
  }

  return out
}

export function detectMatchPatterns(stats: MatchStats): MatchPattern[] {
  const home = stats.players.filter((p) => p.teamSide === 'home')
  const away = stats.players.filter((p) => p.teamSide === 'away')
  return [...sidePatterns(home), ...sidePatterns(away)].sort((a, b) => b.strength - a.strength)
}
