import { describe, it, expect } from 'vitest'

import { readSimpleScore, simpleHalfScores, type SimpleScoreState } from '@/lib/simple-score'
import { PACKAGES, resolveMatchPackage } from '@/lib/packages'

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

describe('resolveMatchPackage', () => {
  it('valt terug op Starter zonder club-pakket', () => {
    expect(resolveMatchPackage(null).tier).toBe('starter')
    expect(resolveMatchPackage({ homeTeam: 42 }).tier).toBe('starter')
  })

  it('leidt het pakket af uit de thuisclub', () => {
    expect(resolveMatchPackage({ homeTeam: { club: { package: 'elite' } } }).tier).toBe('elite')
    expect(resolveMatchPackage({ homeTeam: { club: { package: 'team' } } }).tier).toBe('team')
  })

  it('Starter scoort simpel, Team/Elite gebruiken het volledige veldscherm', () => {
    expect(PACKAGES.starter.scoringMode).toBe('simple')
    expect(PACKAGES.team.scoringMode).toBe('full')
    expect(PACKAGES.elite.scoringMode).toBe('full')
  })

  it('Team toont enkel heatmap + meters, Elite alles', () => {
    expect(PACKAGES.team.stats.heatmap).toBe(true)
    expect(PACKAGES.team.stats.metersPerPlayer).toBe(true)
    expect(PACKAGES.team.stats.playerTable).toBe(false)
    expect(Object.values(PACKAGES.elite.stats).every(Boolean)).toBe(true)
    expect(Object.values(PACKAGES.starter.stats).some(Boolean)).toBe(false)
  })
})
