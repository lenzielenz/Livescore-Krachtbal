import { describe, it, expect } from 'vitest'

import {
  SCORECARD_AXES,
  SKILL_KEYS,
  percentile,
  radarFromSkills,
  radarFromStats,
  ratingFromFracs,
  sanitizeSkills,
} from '@/lib/scorecard'
import type { RadarPlayer } from '@/lib/radar-stats'

const mkPlayer = (id: number, over: Partial<RadarPlayer>): RadarPlayer => ({
  playerId: id,
  name: `P${id}`,
  shirtNumber: id,
  teamId: 1,
  teamName: 'T',
  matches: 5,
  throwsPerMatch: 0,
  conversion: 0,
  avgDistance: 0,
  forcedPerMatch: 0,
  linksShare: 0,
  rechtsShare: 0,
  catchesPerMatch: 0,
  goals: 0,
  goalsPerMatch: 0,
  points: 0,
  xPoints: 0,
  diff: 0,
  maxDistance: 0,
  nek: 0,
  rug: 0,
  middenShare: 0,
  ...over,
})

describe('scorecard axes', () => {
  it('heeft 7 assen en SKILL_KEYS loopt gelijk', () => {
    expect(SCORECARD_AXES).toHaveLength(7)
    expect(SKILL_KEYS).toEqual(SCORECARD_AXES.map((a) => a.key))
  })
})

describe('percentile', () => {
  it('leeg → 0', () => expect(percentile([], 5)).toBe(0))
  it('top van de lijst → 1', () => expect(percentile([1, 2, 3], 3)).toBe(1))
  it('onderaan → klein', () => expect(percentile([1, 2, 3, 4], 1)).toBe(0.25))
})

describe('radarFromStats', () => {
  it('de beste speler op een as krijgt percentiel 1', () => {
    const all = [
      mkPlayer(1, { goalsPerMatch: 1, throwsPerMatch: 1 }),
      mkPlayer(2, { goalsPerMatch: 3, throwsPerMatch: 2 }),
      mkPlayer(3, { goalsPerMatch: 2, throwsPerMatch: 3 }),
    ]
    const fracs = radarFromStats(all[1], all) // speler 2: topscorer
    const doelIdx = SCORECARD_AXES.findIndex((a) => a.key === 'doel')
    expect(fracs[doelIdx]).toBe(1)
    expect(fracs).toHaveLength(7)
  })
})

describe('radarFromSkills', () => {
  it('zet 0..100 om naar 0..1 en clampt', () => {
    const fracs = radarFromSkills({ aanval: 100, doel: 50, succes: 200, verded: -10 })
    expect(fracs[0]).toBe(1) // aanval 100 → 1
    expect(fracs[1]).toBe(0.5) // doel 50 → 0.5
    expect(fracs[2]).toBe(1) // succes 200 → clamp 1
    expect(fracs[6]).toBe(0) // verded -10 → clamp 0
  })
  it('ontbrekende as → 0', () => {
    expect(radarFromSkills({})).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('ratingFromFracs', () => {
  it('gemiddelde × 100, afgerond', () => {
    expect(ratingFromFracs([1, 0, 0.5])).toBe(50)
    expect(ratingFromFracs([])).toBe(0)
  })
})

describe('sanitizeSkills', () => {
  it('behoudt enkel gekende assen, afgerond en geklemd', () => {
    const out = sanitizeSkills({ aanval: 80.6, doel: 150, onbekend: 5, verded: '30' })
    expect(out).toEqual({ aanval: 81, doel: 100, verded: 30 })
  })
  it('niet-object → leeg', () => {
    expect(sanitizeSkills(null)).toEqual({})
    expect(sanitizeSkills(42)).toEqual({})
  })
})
