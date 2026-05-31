import { describe, it, expect } from 'vitest'

import {
  FIELD,
  distanceM,
  isInTargetGoalArea,
  isOnOwnHalf,
  isOutBack,
  isOutSide,
  reachedMidline,
  toMeters,
  totalLengthM,
  zoneOf,
} from '@/lib/field'

describe('field — meters & afstand', () => {
  it('zet genormaliseerde coördinaten om naar meters', () => {
    expect(toMeters({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(toMeters({ x: 1, y: 1 })).toEqual({ x: FIELD.widthM, y: totalLengthM() })
    expect(toMeters({ x: 0.5, y: 0.5 })).toEqual({ x: 7, y: 23 })
  })

  it('diepere doelgebieden → langere veldlengte → grotere afstand', () => {
    // 15 m doelgebieden → totaal 56 m i.p.v. 46 m
    expect(totalLengthM(15)).toBe(56)
    expect(distanceM({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, 15)).toBeCloseTo(56)
  })

  it('berekent hemelsbrede afstand', () => {
    // volledige lengte
    expect(distanceM({ x: 0.5, y: 0 }, { x: 0.5, y: 1 })).toBeCloseTo(46)
    // volledige breedte
    expect(distanceM({ x: 0, y: 0.5 }, { x: 1, y: 0.5 })).toBeCloseTo(14)
    // diagonaal 3-4-5
    expect(distanceM({ x: 0, y: 0 }, { x: 3 / 14, y: 4 / 46 })).toBeCloseTo(5)
  })
})

describe('field — zone (perspectief aanvallende ploeg)', () => {
  it('verdeelt de breedte in derden', () => {
    expect(zoneOf({ x: 0.1, y: 0.5 }, 'up')).toBe('links')
    expect(zoneOf({ x: 0.5, y: 0.5 }, 'up')).toBe('midden')
    expect(zoneOf({ x: 0.9, y: 0.5 }, 'up')).toBe('rechts')
  })

  it('spiegelt links/rechts bij tegengestelde richting', () => {
    expect(zoneOf({ x: 0.1, y: 0.5 }, 'down')).toBe('rechts')
    expect(zoneOf({ x: 0.9, y: 0.5 }, 'down')).toBe('links')
  })
})

describe('field — helften & middellijn', () => {
  it('bepaalt eigen helft afhankelijk van richting', () => {
    expect(isOnOwnHalf({ x: 0.5, y: 0.2 }, 'up')).toBe(true) // y<23m
    expect(isOnOwnHalf({ x: 0.5, y: 0.8 }, 'up')).toBe(false)
    expect(isOnOwnHalf({ x: 0.5, y: 0.8 }, 'down')).toBe(true)
  })

  it('detecteert raken/overschrijden van de middellijn', () => {
    expect(reachedMidline({ x: 0.5, y: 0.6 }, 'up')).toBe(true)
    expect(reachedMidline({ x: 0.5, y: 0.4 }, 'up')).toBe(false)
    expect(reachedMidline({ x: 0.5, y: 23 / 46 }, 'up')).toBe(true) // exact op de lijn
  })
})

describe('field — doelgebied & buiten', () => {
  it('herkent het aangevallen doelgebied', () => {
    expect(isInTargetGoalArea({ x: 0.5, y: 0.95 }, 'up')).toBe(true) // y>36m
    expect(isInTargetGoalArea({ x: 0.5, y: 0.5 }, 'up')).toBe(false)
    expect(isInTargetGoalArea({ x: 0.5, y: 0.05 }, 'down')).toBe(true) // y<10m
  })

  it('herkent buiten zijlijn en achterlijn', () => {
    expect(isOutSide({ x: -0.01, y: 0.5 })).toBe(true)
    expect(isOutSide({ x: 1.01, y: 0.5 })).toBe(true)
    expect(isOutSide({ x: 0.5, y: 0.5 })).toBe(false)
    expect(isOutBack({ x: 0.5, y: 1.02 }, 'up')).toBe(true)
    expect(isOutBack({ x: 0.5, y: -0.02 }, 'down')).toBe(true)
    expect(isOutBack({ x: 0.5, y: 1.02 }, 'down')).toBe(false)
  })
})
