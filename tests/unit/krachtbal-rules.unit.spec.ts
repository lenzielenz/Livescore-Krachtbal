import { describe, it, expect } from 'vitest'

import {
  type ReducibleThrow,
  deriveGeometry,
  deriveOutcome,
  isCrossThrow,
  isMidlineFault,
  isTerminalOutcome,
  nextSetup,
  ownGoalPointsForThrow,
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
  it('§48.1: een vrije worp levert ALTIJD 1 punt op, ook een rugworp', () => {
    expect(pointsForThrow({ type: 'rug', outcome: 'goal', freeThrow: true })).toBe(1)
    expect(pointsForThrow({ type: 'nek', outcome: 'goal', freeThrow: true })).toBe(1)
  })
})

describe('isCrossThrow (kruisje)', () => {
  it('doelworp rechtstreeks buiten zonder aanraking = kruisje', () => {
    expect(isCrossThrow({ outcome: 'out_side', isDoelworp: true, touchedBeforeOut: false })).toBe(true)
  })
  it('een vrije worp telt nooit als kruisje (§6.7)', () => {
    expect(isCrossThrow({ outcome: 'out_side', isDoelworp: true, touchedBeforeOut: false, freeThrow: true })).toBe(false)
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
  it('gevangen in open spel: tegenploeg vertrekt vanaf het vangpunt, richting omgedraaid', () => {
    const ns = nextSetup({ outcome: 'caught', landing: { x: 0.4, y: 0.6 }, throwerTeam: 'home', throwerDir: 'up' })
    expect(ns.team).toBe('away')
    expect(ns.dir).toBe('down')
    expect(ns.point).toEqual({ x: 0.4, y: 0.6 })
    // y=0.6; away speelt 'down', eigen helft = y>0.5 → own
    expect(ns.setupSide).toBe('own')
  })
  it('gevangen in het doelgebied: meting start vanaf het MIDDEN van de doellijn', () => {
    const g = 10 / 46 // doellijn-norm bij doelgebied-diepte 10 m (totale lengte 46 m)
    // Bal gevangen diep in het doelgebied aan de y=1-zijde (y=0.8 > doellijn ≈ 0.783).
    const ns = nextSetup({ outcome: 'caught', landing: { x: 0.4, y: 0.8 }, throwerTeam: 'home', throwerDir: 'up' })
    expect(ns.team).toBe('away')
    expect(ns.dir).toBe('down')
    expect(ns.point.x).toBeCloseTo(0.5)
    expect(ns.point.y).toBeCloseTo(1 - g)
  })
  it('buiten in EIGEN helft (achterin): tegenstander krijgt de bal met opzet eigen helft (meer worpen)', () => {
    // home wierp 'up', bal ging buiten op y=0.8 (= away’s eigen helft). away zet op vanaf eigen helft.
    const ns = nextSetup({ outcome: 'out_side', landing: { x: 1.1, y: 0.8 }, throwerTeam: 'home', throwerDir: 'up' })
    expect(ns.team).toBe('away')
    expect(ns.dir).toBe('down')
    expect(ns.setupSide).toBe('own')
    // §6.11.1: inworp "van rechtover die plaats" → de breedte-positie (geklemd) blijft behouden.
    expect(ns.point).toEqual({ x: 1, y: 0.8 })
  })
  it('buiten in de TEGENHELFT (vóór de middenlijn): opzet tegenhelft → minder worpen', () => {
    // bal ging buiten op y=0.3 (= away’s tegenhelft). away zet op vanaf de tegenhelft.
    const ns = nextSetup({ outcome: 'out_side', landing: { x: -0.05, y: 0.3 }, throwerTeam: 'home', throwerDir: 'up' })
    expect(ns.team).toBe('away')
    expect(ns.setupSide).toBe('opponent')
    // §6.11.1: breedte-positie behouden (geklemd naar 0 aan de zijlijn).
    expect(ns.point).toEqual({ x: 0, y: 0.3 })
  })
  it('buiten, aangeraakt door tegenstander: werpende ploeg houdt de bal, op die diepte', () => {
    const ns = nextSetup({ outcome: 'out_back', landing: { x: 0.5, y: 0.02 }, throwerTeam: 'home', throwerDir: 'up', touchedBeforeOut: true })
    expect(ns.team).toBe('home')
    expect(ns.dir).toBe('up')
    expect(ns.setupSide).toBe('own')
    expect(ns.point).toEqual({ x: 0.5, y: 0.02 })
  })
  it('doelpunt: tegenploeg herstart vanaf eigen helft', () => {
    const ns = nextSetup({ outcome: 'goal', landing: { x: 0.5, y: 0.95 }, throwerTeam: 'away', throwerDir: 'down' })
    expect(ns.team).toBe('home')
    expect(ns.dir).toBe('up')
    expect(ns.setupSide).toBe('own')
  })
})

describe('isCrossThrow', () => {
  it('doelworp die buiten gaat (zij- of achterlijn), niet aangeraakt = kruisje', () => {
    expect(isCrossThrow({ outcome: 'out_back', isDoelworp: true })).toBe(true)
    expect(isCrossThrow({ outcome: 'out_side', isDoelworp: true })).toBe(true)
  })
  it('geen kruisje als niet de doelworp', () => {
    expect(isCrossThrow({ outcome: 'out_back', isDoelworp: false })).toBe(false)
  })
  it('geen kruisje als aangeraakt', () => {
    expect(isCrossThrow({ outcome: 'out_side', isDoelworp: true, touchedBeforeOut: true })).toBe(false)
  })
  it('geen kruisje bij in_field/goal/caught', () => {
    expect(isCrossThrow({ outcome: 'in_field', isDoelworp: true })).toBe(false)
    expect(isCrossThrow({ outcome: 'goal', isDoelworp: true })).toBe(false)
    expect(isCrossThrow({ outcome: 'caught', isDoelworp: true })).toBe(false)
  })
})

describe('reduceTotals — score & kruisjes', () => {
  const t = (over: Partial<ReducibleThrow>): ReducibleThrow => ({
    team: 'home',
    type: 'nek',
    outcome: 'in_field',
    isDoelworp: false,
    ...over,
  })

  it('telt punten per ploeg', () => {
    const { score } = reduceTotals([
      t({ team: 'home', type: 'rug', outcome: 'goal', isDoelworp: true }),
      t({ team: 'away', type: 'nek', outcome: 'goal', isDoelworp: true }),
      t({ team: 'home', type: 'nek', outcome: 'goal', isDoelworp: true }),
    ])
    expect(score).toEqual({ home: 3, away: 1 })
  })

  it('kruisje op de doelworp (zij- of achterlijn), niet aangeraakt', () => {
    const { crosses } = reduceTotals([
      t({ team: 'home', outcome: 'out_back', isDoelworp: true }), // kruisje
      t({ team: 'home', outcome: 'out_side', isDoelworp: false }), // geen (niet doelworp)
      t({ team: 'home', outcome: 'out_back', isDoelworp: true, touchedBeforeOut: true }), // geen (aangeraakt)
    ])
    expect(crosses.home).toBe(1)
  })

  it('reset naar 0 bij het 3e kruisje', () => {
    const cross = (): ReducibleThrow => t({ team: 'away', outcome: 'out_side', isDoelworp: true })
    expect(reduceTotals([cross(), cross()]).crosses.away).toBe(2)
    expect(reduceTotals([cross(), cross(), cross()]).crosses.away).toBe(0)
    expect(reduceTotals([cross(), cross(), cross(), cross()]).crosses.away).toBe(1)
  })
})

describe('middellijnregel volgt het worpaantal (§6.9 / Item 14.9)', () => {
  const kort = { setupSide: 'own' as const, outcome: 'in_field' as const, landing: { x: 0.5, y: 0.4 }, dir: 'up' as const }

  it('senioren (3 worpen): de 2e worp moet de middellijn halen', () => {
    expect(isMidlineFault({ ...kort, throwNumber: 2, throwsAllowed: 3 })).toBe(true)
    expect(isMidlineFault({ ...kort, throwNumber: 1, throwsAllowed: 3 })).toBe(false)
    expect(isMidlineFault({ ...kort, throwNumber: 3, throwsAllowed: 3 })).toBe(false)
  })

  it('jeugd (4 worpen): de 3e worp — die vlak vóór de doelworp', () => {
    expect(isMidlineFault({ ...kort, throwNumber: 3, throwsAllowed: 4 })).toBe(true)
    expect(isMidlineFault({ ...kort, throwNumber: 2, throwsAllowed: 4 })).toBe(false)
    expect(isMidlineFault({ ...kort, throwNumber: 4, throwsAllowed: 4 })).toBe(false)
  })

  it('zonder throwsAllowed valt het terug op het senioren-geval', () => {
    expect(isMidlineFault({ ...kort, throwNumber: 2 })).toBe(true)
  })

  it('een vrije worp (1 worp) kan nooit een middellijn-fout zijn', () => {
    expect(isMidlineFault({ ...kort, throwNumber: 1, throwsAllowed: 1 })).toBe(false)
  })

  it('een eigen doelpunt gaat vóór de middellijn-fout', () => {
    expect(isMidlineFault({ ...kort, throwNumber: 2, throwsAllowed: 3, outcome: 'own_goal' })).toBe(false)
  })
})

describe('eigen doelpunt (§6.6)', () => {
  it('een tik in het eigen doelgebied is own_goal, niet in_field', () => {
    expect(deriveOutcome({ tapCount: 1, point: { x: 0.5, y: 0.05 }, dir: 'up' })).toBe('own_goal')
    expect(deriveOutcome({ tapCount: 1, point: { x: 0.5, y: 0.95 }, dir: 'down' })).toBe('own_goal')
    expect(deriveOutcome({ tapCount: 1, point: { x: 0.5, y: 0.5 }, dir: 'up' })).toBe('in_field')
  })

  it('een vangst in het eigen doelgebied blijft een vangst', () => {
    expect(deriveOutcome({ tapCount: 2, point: { x: 0.5, y: 0.05 }, dir: 'up' })).toBe('caught')
  })

  it('sluit het balbezit af', () => {
    expect(isTerminalOutcome('own_goal')).toBe(true)
  })

  it('levert de werper zelf niets op, de tegenpartij 1 punt', () => {
    expect(pointsForThrow({ type: 'rug', outcome: 'own_goal' })).toBe(0)
    expect(ownGoalPointsForThrow({ outcome: 'own_goal' })).toBe(1)
    expect(ownGoalPointsForThrow({ outcome: 'goal' })).toBe(0)
  })

  it('telt in de stand voor de ándere ploeg — ook bij een rugworp maar één punt', () => {
    const totals = reduceTotals([
      { team: 'home', type: 'rug', outcome: 'own_goal', isDoelworp: false },
      { team: 'away', type: 'rug', outcome: 'goal', isDoelworp: true },
    ])
    expect(totals.score).toEqual({ home: 0, away: 3 })
  })

  it('de ploeg die het maakte zet zelf opnieuw op, vanaf haar eigen vrijeworplijn', () => {
    const ns = nextSetup({ outcome: 'own_goal', landing: { x: 0.5, y: 0.05 }, throwerTeam: 'home', throwerDir: 'up' })
    expect(ns.team).toBe('home')
    expect(ns.dir).toBe('up')
    expect(ns.setupSide).toBe('own')
    expect(ns.point.y).toBeCloseTo(14 / 46, 6)
  })
})
