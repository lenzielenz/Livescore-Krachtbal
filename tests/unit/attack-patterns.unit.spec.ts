import { describe, it, expect } from 'vitest'

import { analyzeAttackPatterns, type PatPossession, type PatThrow } from '@/lib/attack-patterns'

const mkThrow = (over: Partial<PatThrow> & Pick<PatThrow, 'throwNumber'>): PatThrow => ({
  throwNumber: over.throwNumber,
  zone: over.zone ?? null,
  type: over.type ?? 'nek',
  outcome: over.outcome ?? 'in_field',
  x: over.x ?? null,
  y: over.y ?? null,
  distance: over.distance ?? null,
  shirt: over.shirt ?? null,
  name: over.name ?? null,
})

// Een scorende aanval: opzet eigen helft → 1e worp rechts → doelworp rechts (rugworp, +2).
const scoringRight = (): PatPossession => ({
  setupSide: 'own',
  setupX: 0.7,
  setupY: 0.1,
  endOutcome: 'goal',
  throws: [
    mkThrow({ throwNumber: 1, zone: 'rechts', outcome: 'in_field', x: 0.65, y: 0.5 }),
    mkThrow({ throwNumber: 2, zone: 'rechts', outcome: 'goal', type: 'rug', x: 0.7, y: 0.95, distance: 12 }),
  ],
})

const lostPossession = (): PatPossession => ({
  setupSide: 'opponent',
  setupX: 0.3,
  setupY: 0.6,
  endOutcome: 'caught',
  throws: [mkThrow({ throwNumber: 1, zone: 'links', outcome: 'caught', x: 0.3, y: 0.7 })],
})

describe('analyzeAttackPatterns', () => {
  it('handelt lege invoer veilig af', () => {
    const r = analyzeAttackPatterns([])
    expect(r.possessions).toBe(0)
    expect(r.scoringPossessions).toBe(0)
    expect(r.patterns).toEqual([])
    expect(r.example).toBeNull()
    expect(r.tips).toEqual([])
  })

  it('telt opzetverdeling en scoringsaanvallen', () => {
    const r = analyzeAttackPatterns([scoringRight(), scoringRight(), lostPossession()])
    expect(r.possessions).toBe(3)
    expect(r.scoringPossessions).toBe(2)
    expect(r.setupSplit).toEqual({ own: 2, opponent: 1 })
    // Eigen helft converteert 2/2 = 100%, tegenhelft 0/1 = 0%.
    expect(r.setupConversion.own).toBe(100)
    expect(r.setupConversion.opponent).toBe(0)
  })

  it('herkent een terugkerende scoringsroute met conversie', () => {
    const r = analyzeAttackPatterns([scoringRight(), scoringRight(), lostPossession()])
    expect(r.patterns.length).toBeGreaterThanOrEqual(1)
    const top = r.patterns[0]
    expect(top.setupSide).toBe('own')
    expect(top.zones).toEqual(['rechts', 'rechts'])
    expect(top.goals).toBe(2)
    expect(top.count).toBe(2)
    expect(top.conversion).toBe(100)
    expect(top.label.toLowerCase()).toContain('rechts')
  })

  it('bouwt een tekenbare voorbeeldaanval op uit de toproute', () => {
    const r = analyzeAttackPatterns([scoringRight(), scoringRight()])
    expect(r.example).not.toBeNull()
    const ex = r.example!
    // Opzet + 2 worpen = 3 stappen; laatste stap is het doel.
    expect(ex.steps.length).toBe(3)
    expect(ex.steps[0].kind).toBe('setup')
    expect(ex.steps[ex.steps.length - 1].kind).toBe('goal')
    expect(ex.scored).toBe(true)
    expect(ex.throws).toBe(2)
  })

  it('leidt verdedigingstips af (zone, rugworp, route)', () => {
    // Genoeg volume voor de drempels: 6 identieke scorende rugworp-aanvallen via rechts.
    const many = Array.from({ length: 6 }, scoringRight)
    const r = analyzeAttackPatterns(many)
    const joined = r.tips.join(' ').toLowerCase()
    expect(r.tips.length).toBeGreaterThanOrEqual(2)
    expect(joined).toContain('rechts')
    expect(joined).toContain('rugworp')
  })

  it('bouwt flow-kolommen met een dominante zone per worp', () => {
    const r = analyzeAttackPatterns(Array.from({ length: 6 }, scoringRight))
    expect(r.flow.length).toBeGreaterThanOrEqual(2)
    const doel = r.flow.find((s) => s.key === 'doel')
    expect(doel?.dominant?.zone).toBe('rechts')
    expect(doel?.dominant?.pct).toBe(100)
  })
})
