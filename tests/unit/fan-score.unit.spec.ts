import { describe, it, expect } from 'vitest'

import { fanScore, buildFanLeaderboard, buildClubFanRanking, FAN_POINTS, type FanInput } from '@/lib/fan-score'

describe('fanScore', () => {
  it('telt aanwezigheid (×10) bij de pronostiekpunten', () => {
    expect(fanScore(3, 25)).toBe(3 * FAN_POINTS.checkin + 25)
  })
  it('klemt negatieve invoer op 0', () => {
    expect(fanScore(-5, -9)).toBe(0)
  })
})

const inputs: FanInput[] = [
  { userId: 1, name: 'Anna', clubId: 10, clubName: 'A', checkins: 5, predictionPoints: 12 },
  { userId: 2, name: 'Bram', clubId: 10, clubName: 'A', checkins: 0, predictionPoints: 30 },
  { userId: 3, name: 'Cis', clubId: 20, clubName: 'B', checkins: 2, predictionPoints: 0 },
  { userId: 4, name: 'Dirk', clubId: null, clubName: null, checkins: 0, predictionPoints: 0 },
]

describe('buildFanLeaderboard', () => {
  it('rangschikt op score en laat inactieve supporters weg', () => {
    const lb = buildFanLeaderboard(inputs)
    expect(lb.map((r) => r.userId)).toEqual([1, 2, 3]) // 62, 30, 20 ; Dirk (0) valt weg
    expect(lb[0].score).toBe(62)
  })
})

describe('buildClubFanRanking', () => {
  it('telt scores per club op en negeert clubloze supporters', () => {
    const ranking = buildClubFanRanking(buildFanLeaderboard(inputs))
    expect(ranking[0].clubId).toBe(10)
    expect(ranking[0].score).toBe(92) // Anna 62 + Bram 30
    expect(ranking[0].supporters).toBe(2)
    expect(ranking[0].average).toBe(46)
    expect(ranking.find((c) => c.clubId === 20)?.score).toBe(20)
  })
})
