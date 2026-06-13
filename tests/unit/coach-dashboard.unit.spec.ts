import { describe, it, expect } from 'vitest'

import { buildCoachDigest } from '@/lib/coach-digest'
import { buildPlayerMovers } from '@/lib/player-movers'
import type { SeasonPlayer } from '@/lib/season-stats'
import type { TeamReport } from '@/lib/team-report'

const sp = (args: { playerId: number; shirtNumber: number; name: string; teamId?: number; perMatch: number[] }): SeasonPlayer => ({
  playerId: args.playerId,
  name: args.name,
  shirtNumber: args.shirtNumber,
  teamId: args.teamId ?? 1,
  teamName: 'Ploeg',
  matches: args.perMatch.length,
  throws: 30,
  goals: 8,
  points: args.perMatch.reduce((a, b) => a + b, 0),
  nek: 4,
  rug: 4,
  goalAttempts: 16,
  conversion: 0.5,
  lost: 2,
  score: 6,
  zones: { links: 5, midden: 10, rechts: 15 },
  avgDistance: 11,
  maxDistance: 18,
  trend: args.perMatch.map((p, i) => ({ date: `2026-01-0${i + 1}`, points: p, conversion: 0.5 })),
})

describe('buildPlayerMovers', () => {
  it('vindt stijgers en dalers op basis van de vormtrend', () => {
    const players = [
      sp({ playerId: 1, shirtNumber: 7, name: 'Stijger', perMatch: [1, 1, 5, 6] }), // +4.5
      sp({ playerId: 2, shirtNumber: 9, name: 'Daler', perMatch: [6, 6, 1, 1] }), // −5
      sp({ playerId: 3, shirtNumber: 4, name: 'Stabiel', perMatch: [3, 3, 3, 3] }), // 0
    ]
    const m = buildPlayerMovers(players)
    expect(m.risers[0].shirtNumber).toBe(7)
    expect(m.risers[0].delta).toBeGreaterThan(0)
    expect(m.fallers[0].shirtNumber).toBe(9)
    expect(m.fallers[0].delta).toBeLessThan(0)
    // De stabiele speler hoort in geen van beide lijsten.
    expect([...m.risers, ...m.fallers].some((x) => x.shirtNumber === 4)).toBe(false)
  })

  it('negeert spelers met te weinig wedstrijden', () => {
    const m = buildPlayerMovers([sp({ playerId: 1, shirtNumber: 7, name: 'Kort', perMatch: [1, 9] })])
    expect(m.risers).toEqual([])
    expect(m.fallers).toEqual([])
  })
})

const report = (over: Partial<TeamReport> = {}): TeamReport => ({
  teamId: 1,
  teamName: 'KV Test',
  reeks: '1NAH',
  clubId: null,
  matchesAnalyzed: 6,
  totals: { throws: 80, goals: 20, points: 28, nek: 12, rug: 8, goalAttempts: 40, conversion: 0.5, avgDistance: 12, maxDistance: 20, caughtAgainst: 5, out: 3, catches: 14 },
  zones: { links: 20, midden: 25, rechts: 35 },
  players: [],
  insights: [],
  form: [
    { matchId: 1, date: '2026-01-01', points: 2, goals: 2, goalAttempts: 5, conversion: 0.4 },
    { matchId: 2, date: '2026-01-08', points: 3, goals: 3, goalAttempts: 6, conversion: 0.5 },
    { matchId: 3, date: '2026-01-15', points: 6, goals: 5, goalAttempts: 8, conversion: 0.6 },
    { matchId: 4, date: '2026-01-22', points: 7, goals: 6, goalAttempts: 9, conversion: 0.66 },
  ],
  speelstijl: {} as TeamReport['speelstijl'],
  strategy: [],
  profile: {
    tags: ['Rechts-dominant'],
    radar: [],
    strengths: [{ area: 'Aanval', title: 'Sterke rugworp', detail: 'Veel dubbele punten.', weight: 90 }],
    weaknesses: [{ area: 'Balbezit', title: 'Slordig balbezit', detail: 'Veel balverlies.', weight: 60 }],
    topScorerShare: 0.3,
  },
  generatedAt: new Date().toISOString(),
  ...over,
})

describe('buildCoachDigest', () => {
  it('bundelt sterkte, werkpunt, efficiëntie en vorm', () => {
    const digest = buildCoachDigest(
      report(),
      { actual: 28, expected: 23, diff: 5, attempts: 40, goals: 20 },
      { risers: [{ playerId: 1, name: 'Jan Snel', shirtNumber: 7, early: 1, late: 6, delta: 5, matches: 6 }], fallers: [] },
    )
    const text = digest.map((d) => d.text).join(' ').toLowerCase()
    expect(text).toContain('sterkte')
    expect(text).toContain('werkpunt')
    expect(text).toContain('boven verwachting')
    expect(text).toContain('stijgende vorm')
    expect(text).toContain('#7')
    // Bevat een goede én een waarschuwende toon.
    expect(digest.some((d) => d.tone === 'good')).toBe(true)
    expect(digest.some((d) => d.tone === 'warn')).toBe(true)
  })

  it('werkt zonder efficiëntie en zonder movers', () => {
    const digest = buildCoachDigest(report(), null, { risers: [], fallers: [] })
    expect(digest.length).toBeGreaterThanOrEqual(2)
    expect(digest[0].icon).toBe('📊')
  })
})
