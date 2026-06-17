import { describe, it, expect } from 'vitest'

import { computeBadges, earnedCount, type BadgeStats } from '@/lib/badges'

const base: BadgeStats = {
  checkins: 0,
  photos: 0,
  predictions: 0,
  predictionPoints: 0,
  mvpVotes: 0,
  fanScore: 0,
  profileComplete: false,
  boosterWon: false,
}

describe('computeBadges', () => {
  it('nieuw account → enkel "welkom" verdiend', () => {
    const b = computeBadges(base)
    expect(earnedCount(b)).toBe(1)
    expect(b.find((x) => x.key === 'welcome')?.earned).toBe(true)
  })
  it('check-ins ontgrendelen de juiste tiers', () => {
    const b = computeBadges({ ...base, checkins: 6 })
    expect(b.find((x) => x.key === 'checkin1')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'checkin5')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'checkin15')?.earned).toBe(false)
  })
  it('voortgang wordt geklemd op de drempel', () => {
    const b = computeBadges({ ...base, checkins: 40 })
    expect(b.find((x) => x.key === 'checkin30')?.progress).toEqual({ have: 30, need: 30 })
  })
  it('profiel + booster + foto’s', () => {
    const b = computeBadges({ ...base, photos: 12, profileComplete: true, boosterWon: true })
    expect(b.find((x) => x.key === 'photo10')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'photo25')?.earned).toBe(false)
    expect(b.find((x) => x.key === 'profile')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'booster')?.earned).toBe(true)
  })
  it('pronostiek, stemmen en fanscore ontgrendelen hun badges', () => {
    const b = computeBadges({ ...base, predictions: 10, predictionPoints: 120, mvpVotes: 1, fanScore: 240 })
    expect(b.find((x) => x.key === 'pred10')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'pred25')?.earned).toBe(false)
    expect(b.find((x) => x.key === 'predpoints100')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'mvp1')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'mvp10')?.earned).toBe(false)
    expect(b.find((x) => x.key === 'superfan')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'megafan')?.earned).toBe(false)
  })
  it('elke badge heeft een groep', () => {
    const b = computeBadges(base)
    expect(b.every((x) => x.group.length > 0)).toBe(true)
  })
})
