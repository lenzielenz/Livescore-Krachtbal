import { describe, it, expect } from 'vitest'

import { buildMatchAnalysis } from '@/lib/match-analysis'
import { generateMatchAnalysisPdf } from '@/lib/submit/pdf-match-analysis'
import type { MatchStats, PlayerStats } from '@/lib/stats'

const mkPlayer = (over: Partial<PlayerStats> & Pick<PlayerStats, 'playerId' | 'shirtNumber' | 'teamSide'>): PlayerStats => ({
  playerId: over.playerId,
  playerName: over.playerName ?? `Speler ${over.shirtNumber}`,
  shirtNumber: over.shirtNumber,
  teamSide: over.teamSide,
  throws: over.throws ?? 6,
  order: over.order ?? { first: 2, second: 2, last: 2 },
  ground: over.ground ?? 0,
  caught: over.caught ?? 1,
  out: over.out ?? 1,
  lost: over.lost ?? 2,
  goalAttempts: over.goalAttempts ?? 4,
  conversion: over.conversion ?? 0.5,
  score: over.score ?? 2,
  byType: over.byType ?? { nek: 3, rug: 3 },
  goals: over.goals ?? { nek: 1, rug: 1, total: 2, points: 3 },
  distance: over.distance ?? { avg: 12, max: 20 },
  zones: over.zones ?? { links: 1, midden: 2, rechts: 3 },
})

const stats: MatchStats = {
  players: [
    mkPlayer({ playerId: 1, shirtNumber: 4, teamSide: 'home', goals: { nek: 1, rug: 3, total: 4, points: 7 }, zones: { links: 1, midden: 1, rechts: 6 } }),
    mkPlayer({ playerId: 2, shirtNumber: 5, teamSide: 'home', goals: { nek: 2, rug: 0, total: 2, points: 2 } }),
    mkPlayer({ playerId: 3, shirtNumber: 7, teamSide: 'away', goals: { nek: 1, rug: 1, total: 2, points: 3 } }),
  ],
  teams: {
    home: { throws: 24, goals: 6, points: 9, avgDistance: 13.2, maxDistance: 26, caughtRatio: 0.2 },
    away: { throws: 18, goals: 2, points: 3, avgDistance: 11.1, maxDistance: 22, caughtRatio: 0.3 },
  },
}

describe('buildMatchAnalysis', () => {
  it('benoemt de winnaar en topscorer', () => {
    const a = buildMatchAnalysis(stats, { home: 'KBC Thuis', away: 'KBC Uit' }, { home: 9, away: 3 })
    const joined = a.insights.join(' ')
    expect(joined).toMatch(/KBC Thuis wint/)
    expect(joined).toMatch(/#4/)
    expect(a.home.goals).toBe(6)
    expect(a.home.topScorer?.shirtNumber).toBe(4)
  })

  it('herkent een gelijkspel', () => {
    const a = buildMatchAnalysis(stats, { home: 'A', away: 'B' }, { home: 5, away: 5 })
    expect(a.insights[0]).toMatch(/Gelijkspel/)
  })
})

describe('generateMatchAnalysisPdf (leuke samenvatting)', () => {
  it('levert een geldige PDF op met reacties en shoutouts', async () => {
    const bytes = await generateMatchAnalysisPdf({
      teams: { home: 'KBC Thuis', away: 'KBC Uit' },
      score: { home: 9, away: 9 },
      reeks: '1NAH',
      datum: '7 juni 2026',
      goals: [
        { side: 'home', points: 2, half: 1, gameClock: 120, shirtNumber: 4, playerName: 'Jonáš' },
        { side: 'away', points: 1, half: 1, gameClock: 300, shirtNumber: 7, playerName: 'Tom' },
        { side: 'home', points: 1, half: 2, gameClock: 200, shirtNumber: 4, playerName: 'Jonáš' },
      ],
      reactions: { rocket: 13, fire: 5, heart: 6, clap: 2, goal: 7, wow: 1 },
      shoutouts: [
        { name: 'Piet', text: 'Wat een wedstrijd! 🔥' },
        { name: 'Marie', text: 'Komaan jongens, doordoen tot het einde!' },
      ],
    })
    expect(bytes.length).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('werkt zonder reacties en zonder doelpunten', async () => {
    const bytes = await generateMatchAnalysisPdf({
      teams: { home: 'A', away: 'B' },
      score: { home: 0, away: 0 },
      reeks: '1NAH',
      datum: null,
      goals: [],
      reactions: {},
      shoutouts: [],
    })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})
