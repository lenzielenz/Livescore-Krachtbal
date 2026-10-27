import { describe, expect, it } from 'vitest'

import type { ShotPoint } from '@/lib/match-engine'
import { afkorting, bouwVerloop, cijfersTot, drukOp, gevaar, klokOp, standOp, tijdLabelOp, verwachtePunten } from '@/lib/wedstrijdverloop'

const worp = (o: Partial<ShotPoint>): ShotPoint => ({
  x: 0.5,
  y: 0.8,
  fromX: 0.5,
  fromY: 0.5,
  outcome: 'in_field',
  type: 'nek',
  playerId: 1,
  shirtNumber: 7,
  teamSide: 'home',
  throwNumber: 1,
  isLastThrow: false,
  period: 1,
  distance: 8,
  gameClock: 0,
  ...o,
})

describe('wedstrijdverloop', () => {
  it('maakt van elke doelpoging een piek, met de stand erbij', () => {
    const v = bouwVerloop([
      worp({ outcome: 'in_field', gameClock: 30 }),
      worp({ outcome: 'goal', type: 'rug', isLastThrow: true, gameClock: 60, points: 2 }),
      worp({ outcome: 'caught', isLastThrow: true, teamSide: 'away', gameClock: 300 }),
      worp({ outcome: 'own_goal', teamSide: 'away', gameClock: 100, period: 2, ownGoalPoints: 1 }),
      worp({ outcome: 'goal', isLastThrow: true, teamSide: 'away', gameClock: 400, period: 2, points: 1 }),
    ])
    expect(v.tijdas).toBe('klok')
    expect(v.pieken.map((p) => p.soort)).toEqual(['doelpunt', 'misser', 'eigen', 'doelpunt'])
    expect(v.pieken.map((p) => p.kant)).toEqual(['home', 'away', 'home', 'away'])
    expect(v.pieken.map((p) => p.punten)).toEqual([2, 0, 1, 1])
    expect(v.pieken[0].hoogte).toBe(1)
    expect(v.pieken[1].hoogte).toBeGreaterThan(0)
    expect(v.pieken[1].hoogte).toBeLessThan(0.5)
    expect(v.stand).toEqual([3, 1])
    expect(v.helften).toEqual([300, 420])
    expect(v.pieken[0].tijdLabel).toBe('1e helft 1:00')
    expect(v.pieken[3].tijdLabel).toBe('2e helft 6:40')
  })

  it('zet de tijd in volgorde als de klok ontbreekt', () => {
    const v = bouwVerloop([worp({ outcome: 'goal', isLastThrow: true, gameClock: null }), worp({ outcome: 'out_back', isLastThrow: true, gameClock: null, period: 2 })])
    expect(v.tijdas).toBe('volgorde')
    expect(v.pieken[0].t).toBeLessThan(v.rust)
    expect(v.pieken[1].t).toBeGreaterThan(v.rust)
  })

  it('geeft de stand en het tijdlabel op een moment van de tijdas', () => {
    const v = bouwVerloop([worp({ outcome: 'goal', type: 'rug', isLastThrow: true, gameClock: 60, points: 2 }), worp({ outcome: 'goal', isLastThrow: true, teamSide: 'away', gameClock: 60, period: 2, points: 1 })])
    expect(standOp(v, 0)).toEqual([0, 0])
    expect(standOp(v, v.pieken[0].t)).toEqual([2, 0])
    expect(standOp(v, 1)).toEqual([2, 1])
    expect(tijdLabelOp(v, 0)).toBe('1e helft 0:00')
    expect(tijdLabelOp(v, v.rust)).toBe('rust')
    expect(tijdLabelOp(v, 1)).toBe('einde')
  })

  it('schat een rugworp van dichtbij gevaarlijker dan een nekworp van ver', () => {
    expect(gevaar('rug', 4)).toBeGreaterThan(gevaar('nek', 14))
    expect(gevaar('nek', null)).toBeGreaterThan(0)
    expect(gevaar('rug', 0)).toBeLessThanOrEqual(0.6)
  })

  it('telt pogingen, raak en verwachte punten per werper, en kent de minuut', () => {
    const v = bouwVerloop([
      worp({ outcome: 'goal', type: 'rug', isLastThrow: true, gameClock: 59, points: 2, distance: 5 }),
      worp({ outcome: 'caught', isLastThrow: true, teamSide: 'away', gameClock: 300, distance: 12 }),
      worp({ outcome: 'own_goal', teamSide: 'away', gameClock: 100, period: 2, ownGoalPoints: 1 }),
    ])
    expect(v.pieken.map((p) => p.minuut)).toEqual([1, 6, 7])
    expect(v.pieken[2].werper).toBe('away')
    expect(v.pieken[2].kant).toBe('home')
    const c = cijfersTot(v, 1)
    expect(c.pogingen).toEqual([1, 2])
    expect(c.raak).toEqual([1, 0])
    expect(c.verwacht[0]).toBeCloseTo(verwachtePunten('rug', 5))
    expect(cijfersTot(v, 0).pogingen).toEqual([0, 0])
  })

  it('geeft aanvalsdruk enkel rond de pogingen, en nooit uit de toekomst', () => {
    const v = bouwVerloop([worp({ outcome: 'goal', isLastThrow: true, gameClock: 120, points: 1 }), worp({ outcome: 'out_back', isLastThrow: true, gameClock: 120, period: 2, teamSide: 'away' })])
    const [h, a] = drukOp(v, v.pieken[0].t)
    expect(h).toBeGreaterThan(0)
    expect(a).toBe(0)
    expect(drukOp(v, v.pieken[1].t, v.pieken[0].t)[1]).toBe(0)
  })

  it('zet de klok en de afkortingen goed', () => {
    const v = bouwVerloop([worp({ outcome: 'goal', isLastThrow: true, gameClock: 600, points: 1 }), worp({ outcome: 'goal', isLastThrow: true, gameClock: 600, period: 2, points: 1 })])
    expect(klokOp(v, 0)).toMatchObject({ groot: "1'", klein: '1e helft' })
    expect(klokOp(v, 1).groot).toBe('EINDE')
    expect(afkorting('KV Demostad')).toBe('DEM')
    expect(afkorting('Sint-Michiels')).toBe('SMI')
    expect(afkorting('KBK Ternat')).toBe('TER')
    expect(afkorting('Pollare')).toBe('POL')
  })
})
