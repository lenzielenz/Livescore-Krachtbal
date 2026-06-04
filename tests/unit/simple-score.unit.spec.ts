import { describe, it, expect } from 'vitest'

import { readSimpleScore, simpleHalfScores, type SimpleScoreState } from '@/lib/simple-score'

describe('readSimpleScore', () => {
  it('geeft een lege staat voor ontbrekende/ongeldige data', () => {
    expect(readSimpleScore(null)).toEqual({ goals: [], crosses: { home: 0, away: 0 } })
    expect(readSimpleScore({ simpleScore: undefined })).toEqual({ goals: [], crosses: { home: 0, away: 0 } })
    expect(readSimpleScore({ simpleScore: 'kapot' })).toEqual({ goals: [], crosses: { home: 0, away: 0 } })
  })

  it('normaliseert doelpunten en kruisjes uit ruwe JSON', () => {
    const raw = {
      simpleScore: {
        goals: [
          { side: 'home', points: 2, half: 1, clock: 120, ts: 1 },
          { side: 'away', points: 9, half: 2, clock: 30, ts: 2 }, // ongeldige punten → 1
          { side: 'zijlijn', points: 1, half: 1, clock: 5, ts: 3 }, // ongeldige zijde → weg
        ],
        crosses: { home: -4, away: 2 }, // negatief → 0
      },
    }
    const s = readSimpleScore(raw)
    expect(s.goals).toHaveLength(2)
    expect(s.goals[0]).toMatchObject({ side: 'home', points: 2 })
    expect(s.goals[1]).toMatchObject({ side: 'away', points: 1 })
    expect(s.crosses).toEqual({ home: 0, away: 2 })
  })

  it('bewaart de scorer (snel-scoren vereist een speler) en negeert lege/ongeldige scorer-data', () => {
    const raw = {
      simpleScore: {
        goals: [
          { side: 'home', points: 1, half: 1, clock: 10, ts: 1, scorerId: 7, scorerNumber: 9, scorerName: 'Jan Peeters' },
          { side: 'away', points: 2, half: 1, clock: 20, ts: 2, scorerId: 0, scorerName: '' },
        ],
        crosses: { home: 0, away: 0 },
      },
    }
    const s = readSimpleScore(raw)
    expect(s.goals[0]).toMatchObject({ scorerId: 7, scorerNumber: 9, scorerName: 'Jan Peeters' })
    expect(s.goals[1].scorerId).toBeUndefined()
    expect(s.goals[1].scorerName).toBeUndefined()
  })
})

describe('simpleHalfScores', () => {
  it('telt punten per helft en ploeg op', () => {
    const state: SimpleScoreState = {
      goals: [
        { side: 'home', points: 2, half: 1, clock: 0, ts: 1 },
        { side: 'home', points: 1, half: 2, clock: 0, ts: 2 },
        { side: 'away', points: 1, half: 1, clock: 0, ts: 3 },
      ],
      crosses: { home: 0, away: 0 },
    }
    expect(simpleHalfScores(state)).toEqual({ home: [2, 1], away: [1, 0] })
  })
})
