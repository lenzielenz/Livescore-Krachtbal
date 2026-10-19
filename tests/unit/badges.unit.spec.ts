import { describe, it, expect } from 'vitest'

import { aanwezigheidStats, computeBadges, earnedCount, type BadgeStats } from '@/lib/badges'

const base: BadgeStats = {
  checkins: 0,
  photos: 0,
  predictions: 0,
  predictionPoints: 0,
  mvpVotes: 0,
  fanScore: 0,
  profileComplete: false,
  boosterWon: false,
  scoredMatches: 0,
  trustedScorer: false,
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

describe('zwaardere badges', () => {
  it('elke badge heeft een zeldzaamheid, en er is in elke reeks een gouden of legendarische top', () => {
    const b = computeBadges(base)
    expect(b.every((x) => ['brons', 'zilver', 'goud', 'legende'].includes(x.rarity))).toBe(true)
    const groepen = [...new Set(b.map((x) => x.group))].filter((g) => g !== 'Start' && g !== 'Profiel')
    for (const g of groepen) expect(b.some((x) => x.group === g && (x.rarity === 'goud' || x.rarity === 'legende'))).toBe(true)
  })
  it('een actief seizoen haalt nog lang niet alles', () => {
    const b = computeBadges({ ...base, checkins: 20, photos: 12, predictions: 20, predictionPoints: 120, mvpVotes: 12, fanScore: 300, profileComplete: true, boosterWon: true, scoredMatches: 6 })
    expect(earnedCount(b) / b.length).toBeLessThan(0.5)
    expect(b.find((x) => x.key === 'halloffame')?.earned).toBe(false)
  })
  it('uitwedstrijden, terreinen, weken op rij, exacte voorspellingen en het podium', () => {
    const b = computeBadges({ ...base, awayCheckins: 10, grounds: 5, weekStreak: 8, exactPredictions: 5, predictionRank: 2 })
    for (const k of ['away3', 'away10', 'grounds5', 'streak4', 'streak8', 'exact1', 'exact5', 'podium']) expect(b.find((x) => x.key === k)?.earned).toBe(true)
    for (const k of ['away25', 'grounds10', 'streak15', 'exact15', 'koning']) expect(b.find((x) => x.key === k)?.earned).toBe(false)
  })
  it('Hall of Fame vraagt álle andere badges', () => {
    const alles: BadgeStats = { checkins: 100, photos: 75, predictions: 75, predictionPoints: 600, mvpVotes: 30, fanScore: 1000, profileComplete: true, boosterWon: true, scoredMatches: 50, trustedScorer: true, awayCheckins: 25, grounds: 20, weekStreak: 15, exactPredictions: 15, predictionRank: 1 }
    const b = computeBadges(alles)
    expect(b.every((x) => x.earned)).toBe(true)
    const bijna = computeBadges({ ...alles, predictionRank: 2 })
    expect(bijna.find((x) => x.key === 'halloffame')?.earned).toBe(false)
  })
})

describe('aanwezigheidStats', () => {
  const m = (date: string, homeClubId: number, awayClubId: number) => ({ date, homeClubId, awayClubId })
  it('telt uitwedstrijden van de eigen club en verschillende terreinen', () => {
    const r = aanwezigheidStats([m('2026-09-05T14:00:00Z', 1, 9), m('2026-09-12T14:00:00Z', 2, 1), m('2026-09-19T14:00:00Z', 3, 1), m('2026-09-20T14:00:00Z', 3, 4)], 1)
    expect(r.awayCheckins).toBe(2)
    expect(r.grounds).toBe(3)
  })
  it('meet de langste reeks opeenvolgende weken (twee wedstrijden in één weekend tellen als één week)', () => {
    const r = aanwezigheidStats([
      m('2026-09-05T14:00:00Z', 1, 2), m('2026-09-06T10:00:00Z', 1, 2),
      m('2026-09-12T14:00:00Z', 1, 2), m('2026-09-19T14:00:00Z', 1, 2),
      m('2026-10-10T14:00:00Z', 1, 2),
    ], 1)
    expect(r.weekStreak).toBe(3)
  })
})
