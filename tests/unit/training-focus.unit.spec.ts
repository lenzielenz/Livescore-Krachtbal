import { describe, it, expect } from 'vitest'

import type { TeamReport } from '@/lib/team-report'
import { buildTrainingFocus } from '@/lib/training-focus'

const report = (over: {
  totals?: Partial<TeamReport['totals']>
  weaknesses?: TeamReport['profile']['weaknesses']
  topScorerShare?: number
}): TeamReport => ({
  teamId: 1,
  teamName: 'KV Test',
  reeks: '1NAH',
  clubId: null,
  matchesAnalyzed: 4,
  totals: {
    throws: 60,
    goals: 18,
    points: 25,
    nek: 12,
    rug: 6,
    goalAttempts: 40,
    conversion: 0.45,
    avgDistance: 12,
    maxDistance: 20,
    caughtAgainst: 4,
    out: 2,
    catches: 10,
    ...over.totals,
  },
  zones: { links: 12, midden: 18, rechts: 30 },
  players: [],
  insights: [],
  speelstijl: {} as TeamReport['speelstijl'],
  strategy: [],
  profile: { tags: [], radar: [], strengths: [], weaknesses: over.weaknesses ?? [], topScorerShare: over.topScorerShare ?? 0.2 },
  generatedAt: new Date().toISOString(),
})

describe('buildTrainingFocus', () => {
  it('stelt afwerkingstraining voor bij lage conversie', () => {
    const items = buildTrainingFocus(report({ totals: { goalAttempts: 40, goals: 10 } })) // 25%
    const afw = items.find((i) => i.title.toLowerCase().includes('afwerking'))
    expect(afw).toBeTruthy()
    expect(afw?.metric).toBe('worp9')
    expect(afw?.why).toContain('25%')
  })

  it('stelt balvastheid voor bij veel balverlies', () => {
    const items = buildTrainingFocus(report({ totals: { throws: 40, caughtAgainst: 6, out: 4 } })) // 25% verlies
    expect(items.some((i) => i.title.toLowerCase().includes('balvastheid'))).toBe(true)
  })

  it('stelt worpkracht voor bij korte gemiddelde afstand', () => {
    const items = buildTrainingFocus(report({ totals: { avgDistance: 8 } }))
    const kracht = items.find((i) => i.title.toLowerCase().includes('worpkracht'))
    expect(kracht?.metric).toBe('worp18')
  })

  it('stelt "breder scoren" voor bij eenmansafhankelijkheid', () => {
    const items = buildTrainingFocus(report({ topScorerShare: 0.55 }))
    expect(items.some((i) => i.title.toLowerCase().includes('breder scoren'))).toBe(true)
  })

  it('geeft een sterke ploeg weinig of geen werkpunten', () => {
    const items = buildTrainingFocus(
      report({ totals: { goalAttempts: 30, goals: 24, avgDistance: 15, rug: 12, caughtAgainst: 1, out: 1, throws: 50 }, topScorerShare: 0.2 }),
    )
    expect(items.length).toBe(0)
  })

  it('beperkt tot maximaal vier suggesties', () => {
    const items = buildTrainingFocus(
      report({
        totals: { goalAttempts: 40, goals: 6, avgDistance: 7, rug: 0, caughtAgainst: 8, out: 6, throws: 40 },
        weaknesses: [{ area: 'Tactiek', title: 'Voorspelbaar via rechts', detail: '', weight: 80 }],
        topScorerShare: 0.6,
      }),
    )
    expect(items.length).toBeLessThanOrEqual(4)
  })
})
