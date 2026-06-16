import { describe, it, expect } from 'vitest'

import { computeBadges, earnedCount } from '@/lib/badges'

const base = { checkins: 0, photos: 0, profileComplete: false, boosterWon: false }

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
    const b = computeBadges({ checkins: 0, photos: 12, profileComplete: true, boosterWon: true })
    expect(b.find((x) => x.key === 'photo10')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'photo25')?.earned).toBe(false)
    expect(b.find((x) => x.key === 'profile')?.earned).toBe(true)
    expect(b.find((x) => x.key === 'booster')?.earned).toBe(true)
  })
})
