import { describe, it, expect } from 'vitest'

import {
  type ReducibleThrow,
  deriveGeometry,
  deriveOutcome,
  isMidlineFault,
  isTerminalOutcome,
  nextSetup,
  pointsForThrow,
  reduceTotals,
  throwsAllowed,
} from '@/lib/krachtbal-rules'

describe('pointsForThrow', () => {
  it('rugworp-doelpunt telt dubbel, nekworp enkel', () => {
    expect(pointsForThrow({ type: 'rug', outcome: 'goal' })).toBe(2)
    expect(pointsForThrow({ type: 'nek', outcome: 'goal' })).toBe(1)
  })
  it('geen punten zonder doelpunt', () => {
    expect(pointsForThrow({ type: 'rug', outcome: 'caught' })).toBe(0)
    expect(pointsForThrow({ type: 'nek', outcome: 'in_field' })).toBe(0)
    expect(pointsForThrow({ type: 'rug', outcome: 'out_back' })).toBe(0)
  })
})

describe('throwsAllowed', () => {
  it('senioren: 3 eigen helft, 2 tegenhelft', () => {
    expect(throwsAllowed('senioren', 'own')).toBe(3)
    expect(throwsAllowed('senioren', 'opponent')).toBe(2)
  })
  it('jeugd: één worp extra (4 / 3)', () => {
    expect(throwsAllowed('U14', 'own')).toBe(4)
    expect(throwsAllowed('U14', 'opponent')).toBe(3)
  })
  it('U18 telt als senioren', () => {
    expect(throwsAllowed('U18', 'own')).toBe(3)
  })
})

describe('deriveOutcome', () => {
  it('twee tikken = gevangen, ongeacht plek', () => {
    expect(deriveOutcome({ tapCount: 2, point: { x: 0.5, y: 0.95 }, dir: 'up' })).toBe('caught')
  })
  it('één tik in doelgebied = doelpunt', () => {
    expect(deriveOutcome({ tapCount: 1, point: { x: 0.5, y: 0.95 }, dir: 'up' })).toBe('goal')
  })
  it('buiten zijlijn / achterlijn', () => {
    expect(deriveOutcome({ tapCount: 1, point: { x: 1.05, y: 0.6 }, dir: 'up' })).toBe('out_side')
    expect(deriveOutcome({ tapCount: 1, point: { x: 0.5, y: 1.05 }, dir: 'up' })).toBe('out_back')
  })
  it('één tik in het veld = doorspelen', () => {
    expect(deriveOutcome({ tapCount: 1, point: { x: 0.5, y: 0.5 }, dir: 'up' })).toBe('in_field')
  })
})

describe('isTerminalOutcome', () => {
  it('enkel in_field is niet terminaal', () => {
    expect(isTerminalOutcome('in_field')).toBe(false)
    expect(isTerminalOutcome('goal')).toBe(true)
    expect(isTerminalOutcome('caught')).toBe(true)
    expect(isTerminalOutcome('out_back')).toBe(true)
  })
})

describe('deriveGeometry', () => {
  it('berekent afstand (afgerond) en zone', () => {
    const g = deriveGeometry({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, 'up')
    expect(g.distance).toBeCloseTo(46)
    expect(g.zone).toBe('midden')
  })
})

describe('isMidlineFault', () => {
  it('fout: opzet eigen helft, 2e worp blijft op eigen helft, doorspelen', () => {
    expect(
      isMidlineFault({
        setupSide: 'own',
        throwNumber: 2,
        outcome: 'in_field',
        landing: { x: 0.5, y: 0.4 }, // y<23m → middellijn niet bereikt
        dir: 'up',
      }),
    ).toBe(true)
  })
  it('geen fout als de middellijn wél gehaald wordt', () => {
    expect(
      isMidlineFault({
        setupSide: 'own',
        throwNumber: 2,
        outcome: 'in_field',
        landing: { x: 0.5, y: 0.6 },
        dir: 'up',
      }),
    ).toBe(false)
  })
  it('niet van toepassing op 1e worp of opzet tegenhelft', () => {
    expect(
      isMidlineFault({ setupSide: 'own', throwNumber: 1, outcome: 'in_field', landing: { x: 0.5, y: 0.3 }, dir: 'up' }),
    ).toBe(false)
    expect(
      isMidlineFault({ setupSide: 'opponent', throwNumber: 2, outcome: 'in_field', landing: { x: 0.5, y: 0.3 }, dir: 'up' }),
    ).toBe(false)
  })
})

describe('nextSetup', () => {
  it('gevangen: tegenploeg vertrekt vanaf vangpunt, richting omgedraaid', () => {
    const ns = nextSetup({ outcome: 'caught', landing: { x: 0.4, y: 0.8 }, throwerTeam: 'home', throwerDir: 'up' })
    expect(ns.team).toBe('away')
    expect(ns.dir).toBe('down')
    expect(ns.point).toEqual({ x: 0.4, y: 0.8 })
    // y=0.8 (36.8m); away speelt 'down', eigen helft = y>23m → own
    expect(ns.setupSide).toBe('own')
  })
  it('buiten zijlijn: tegenploeg vanuit het midden', () => {
    const ns = nextSetup({ outcome: 'out_side', landing: { x: 1.1, y: 0.5 }, throwerTeam: 'home', throwerDir: 'up' })
    expect(ns.team).toBe('away')
    expect(ns.setupSide).toBe('own')
    expect(ns.point).toEqual({ x: 0.5, y: 0.5 })
  })
  it('doelpunt: tegenploeg herstart vanaf eigen helft', () => {
    const ns = nextSetup({ outcome: 'goal', landing: { x: 0.5, y: 0.95 }, throwerTeam: 'away', throwerDir: 'down' })
    expect(ns.team).toBe('home')
    expect(ns.dir).toBe('up')
    expect(ns.setupSide).toBe('own')
  })
})

describe('reduceTotals — score & kruisjes', () => {
  const t = (over: Partial<ReducibleThrow>): ReducibleThrow => ({
    team: 'home',
    type: 'nek',
    outcome: 'in_field',
    isLastThrow: false,
    ...over,
  })

  it('telt punten per ploeg', () => {
    const { score } = reduceTotals([
      t({ team: 'home', type: 'rug', outcome: 'goal', isLastThrow: true }),
      t({ team: 'away', type: 'nek', outcome: 'goal', isLastThrow: true }),
      t({ team: 'home', type: 'nek', outcome: 'goal', isLastThrow: true }),
    ])
    expect(score).toEqual({ home: 3, away: 1 })
  })

  it('kruisje enkel op laatste worp, rechtstreeks buiten, niet aangeraakt', () => {
    const { crosses } = reduceTotals([
      t({ team: 'home', outcome: 'out_back', isLastThrow: true }), // kruisje
      t({ team: 'home', outcome: 'out_back', isLastThrow: false }), // geen (niet laatste worp)
      t({ team: 'home', outcome: 'out_back', isLastThrow: true, touchedBeforeOut: true }), // geen (aangeraakt)
    ])
    expect(crosses.home).toBe(1)
  })

  it('reset naar 0 bij het 3e kruisje', () => {
    const cross = (): ReducibleThrow => t({ team: 'away', outcome: 'out_back', isLastThrow: true })
    expect(reduceTotals([cross(), cross()]).crosses.away).toBe(2)
    expect(reduceTotals([cross(), cross(), cross()]).crosses.away).toBe(0)
    expect(reduceTotals([cross(), cross(), cross(), cross()]).crosses.away).toBe(1)
  })
})
