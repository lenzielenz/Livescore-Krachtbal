// Vat één wedstrijd samen tot kerncijfers per ploeg + een automatische analyse (tekst). Puur en
// getest; voedt de gedeelde wedstrijd-analyse-PDF. Werkt op de geaggregeerde MatchStats.

import type { MatchStats, PlayerStats } from './stats'

export interface TeamAgg {
  throws: number
  goals: number
  points: number
  nek: number
  rug: number
  goalAttempts: number
  conversion: number
  zones: { links: number; midden: number; rechts: number }
  avgDistance: number
  maxDistance: number
  caught: number
  out: number
  lost: number
  topScorer: { name: string; shirtNumber: number; points: number; goals: number } | null
}

export interface MatchAnalysis {
  home: TeamAgg
  away: TeamAgg
  insights: string[]
}

const ZONE_NL: Record<string, string> = { links: 'links', midden: 'het midden', rechts: 'rechts' }

function aggregate(players: PlayerStats[], side: 'home' | 'away', teamThrows: number, teamAvg: number, teamMax: number): TeamAgg {
  const ps = players.filter((p) => p.teamSide === side)
  const sum = (f: (p: PlayerStats) => number) => ps.reduce((a, p) => a + f(p), 0)
  const goals = sum((p) => p.goals.total)
  const goalAttempts = sum((p) => p.goalAttempts)
  const top = ps
    .filter((p) => p.goals.total > 0)
    .sort((a, b) => b.goals.points - a.goals.points || b.goals.total - a.goals.total)[0]
  return {
    throws: teamThrows,
    goals,
    points: sum((p) => p.goals.points),
    nek: sum((p) => p.goals.nek),
    rug: sum((p) => p.goals.rug),
    goalAttempts,
    conversion: goalAttempts ? goals / goalAttempts : 0,
    zones: { links: sum((p) => p.zones.links), midden: sum((p) => p.zones.midden), rechts: sum((p) => p.zones.rechts) },
    avgDistance: teamAvg,
    maxDistance: teamMax,
    caught: sum((p) => p.caught),
    out: sum((p) => p.out),
    lost: sum((p) => p.lost),
    topScorer: top
      ? { name: top.playerName, shirtNumber: top.shirtNumber, points: top.goals.points, goals: top.goals.total }
      : null,
  }
}

function domZone(z: { links: number; midden: number; rechts: number }): { zone: 'links' | 'midden' | 'rechts'; pct: number } | null {
  const tot = z.links + z.midden + z.rechts
  if (!tot) return null
  const top = (['links', 'midden', 'rechts'] as const).reduce((a, b) => (z[b] > z[a] ? b : a), 'links' as const)
  return { zone: top, pct: Math.round((z[top] / tot) * 100) }
}

export function buildMatchAnalysis(
  stats: MatchStats,
  teams: { home: string; away: string },
  score: { home: number; away: number },
): MatchAnalysis {
  const home = aggregate(stats.players, 'home', stats.teams.home.throws, stats.teams.home.avgDistance, stats.teams.home.maxDistance)
  const away = aggregate(stats.players, 'away', stats.teams.away.throws, stats.teams.away.avgDistance, stats.teams.away.maxDistance)

  const insights: string[] = []
  // Uitslag.
  if (score.home === score.away) {
    insights.push(`Gelijkspel: ${teams.home} ${score.home} - ${score.away} ${teams.away}.`)
  } else {
    const winner = score.home > score.away ? teams.home : teams.away
    const diff = Math.abs(score.home - score.away)
    insights.push(`${winner} wint met ${score.home} - ${score.away} (${diff} punt${diff === 1 ? '' : 'en'} verschil).`)
  }

  for (const [side, agg, name] of [
    ['home', home, teams.home],
    ['away', away, teams.away],
  ] as const) {
    void side
    if (agg.topScorer) {
      insights.push(`${name}: meeste impact van #${agg.topScorer.shirtNumber} ${agg.topScorer.name} (${agg.topScorer.points} ptn, ${agg.topScorer.goals} doelpunten).`)
    }
    if (agg.goalAttempts >= 4) {
      insights.push(`${name} converteert ${Math.round(agg.conversion * 100)}% van de doelpogingen (${agg.goals}/${agg.goalAttempts}).`)
    }
    const dz = domZone(agg.zones)
    if (dz && agg.throws >= 5) insights.push(`${name} speelt vooral via ${ZONE_NL[dz.zone]} (${dz.pct}% van de worpen).`)
    if (agg.goals > 0) {
      const rugPct = Math.round((agg.rug / agg.goals) * 100)
      if (rugPct >= 40) insights.push(`${name} pakt veel dubbel: ${rugPct}% van de doelpunten zijn rugworpen (+2).`)
    }
    if (agg.lost >= 4) insights.push(`${name} verliest ${agg.lost}× de bal (gevangen/buiten) — werkpunt.`)
  }

  return { home, away, insights }
}
