import { describe, it, expect } from 'vitest'

import type { AttackPatternsResult } from '@/lib/attack-patterns'
import { buildGamePlan } from '@/lib/gameplan'
import type { TeamReport, TeamReportPlayer } from '@/lib/team-report'

const mkPlayer = (over: Partial<TeamReportPlayer> & Pick<TeamReportPlayer, 'playerId' | 'shirtNumber' | 'name'>): TeamReportPlayer => ({
  playerId: over.playerId,
  name: over.name,
  shirtNumber: over.shirtNumber,
  matches: over.matches ?? 4,
  throws: over.throws ?? 20,
  goals: over.goals ?? 5,
  points: over.points ?? 7,
  nek: over.nek ?? 3,
  rug: over.rug ?? 2,
  goalAttempts: over.goalAttempts ?? 10,
  conversion: over.conversion ?? 0.5,
  caughtLost: over.caughtLost ?? 2,
  out: over.out ?? 1,
  score: over.score ?? 5,
  avgDistance: over.avgDistance ?? 11,
  maxDistance: over.maxDistance ?? 18,
  zones: over.zones ?? { links: 4, midden: 6, rechts: 10 },
  catches: over.catches ?? 1,
  tip: over.tip,
})

const baseReport = (over?: Partial<TeamReport>): TeamReport => ({
  teamId: 1,
  teamName: 'KV Testploeg',
  reeks: '1NAH',
  clubId: null,
  matchesAnalyzed: 4,
  totals: { throws: 60, goals: 18, points: 25, nek: 10, rug: 8, goalAttempts: 36, conversion: 0.5, avgDistance: 11, maxDistance: 20, caughtAgainst: 6, out: 3, catches: 12 },
  zones: { links: 12, midden: 18, rechts: 30 },
  players: [
    mkPlayer({ playerId: 7, shirtNumber: 7, name: 'Jan Sterk', points: 14, goals: 9, rug: 5, tip: '1e worp rechts · scoort via rechts' }),
    mkPlayer({ playerId: 4, shirtNumber: 4, name: 'Piet Muur', points: 4, goals: 2, rug: 0, catches: 6 }),
  ],
  insights: [],
  speelstijl: {} as TeamReport['speelstijl'],
  strategy: [],
  profile: {
    tags: ['Rechts-dominant', 'Krachtploeg'],
    radar: [],
    strengths: [],
    weaknesses: [
      { area: 'Verdediging', title: 'Kwetsbaar via links', detail: '55% van de tegendoelpunten valt via links — zoek bewust die ruimte op.', weight: 60 },
      { area: 'Balbezit', title: 'Slordig balbezit', detail: '6× gevangen — vol druk zetten loont.', weight: 50 },
    ],
    topScorerShare: 0.56,
  },
  generatedAt: new Date().toISOString(),
  ...over,
})

const patterns = (tips: string[]): AttackPatternsResult => ({
  possessions: 30,
  scoringPossessions: 14,
  setupSplit: { own: 20, opponent: 10 },
  setupConversion: { own: 50, opponent: 30 },
  avgThrowsToGoal: 2.1,
  flow: [],
  patterns: [],
  example: null,
  tips,
})

describe('buildGamePlan', () => {
  it('zet de topscorer bovenaan "wie kort houden" met diens aandeel', () => {
    const plan = buildGamePlan(baseReport(), null)
    expect(plan.watch[0].title).toContain('#7')
    expect(plan.watch[0].detail).toContain('56%')
  })

  it('neemt de rugworp-specialist en sleutelverdediger mee als ze verschillen', () => {
    const plan = buildGamePlan(baseReport(), null)
    const titles = plan.watch.map((w) => w.title).join(' | ')
    // #4 Piet heeft 6 vangsten → sleutelverdediger.
    expect(titles).toContain('#4')
    expect(titles.toLowerCase()).toContain('verdediger')
  })

  it('vertaalt patroon-tips naar een verdedigingsluik met titel + detail', () => {
    const plan = buildGamePlan(baseReport(), patterns(['Doelpunten vallen vooral via rechts (60%) — schuif je verdediging die kant op en duw de bal naar links.']))
    expect(plan.defend.length).toBe(1)
    expect(plan.defend[0].title.toLowerCase()).toContain('rechts')
    expect(plan.defend[0].detail.toLowerCase()).toContain('verdediging')
  })

  it('zet uitbuitbare zwaktes in het aanvalsluik', () => {
    const plan = buildGamePlan(baseReport(), null)
    expect(plan.attack.length).toBeGreaterThanOrEqual(1)
    expect(plan.attack[0].title.toLowerCase()).toContain('links')
  })

  it('bouwt een kopzin en maximaal drie sleutels', () => {
    const plan = buildGamePlan(baseReport(), patterns(['Doelpunten vallen vooral via rechts (60%) — duw naar links.']))
    expect(plan.headline).toContain('#7')
    expect(plan.keys.length).toBeGreaterThanOrEqual(1)
    expect(plan.keys.length).toBeLessThanOrEqual(3)
  })
})
