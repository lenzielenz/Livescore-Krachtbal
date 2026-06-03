import { describe, it, expect } from 'vitest'

import { readSimpleScore, simpleHalfScores, type SimpleScoreState } from '@/lib/simple-score'
import { PACKAGES, PACKAGES_ENABLED, clubPackageOf, resolveMatchPackage } from '@/lib/packages'

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

describe('clubPackageOf (onderliggende afleiding)', () => {
  it('valt terug op Starter zonder club-pakket', () => {
    expect(clubPackageOf(null).tier).toBe('starter')
    expect(clubPackageOf({ homeTeam: 42 }).tier).toBe('starter')
  })

  it('leidt het pakket af uit de thuisclub', () => {
    expect(clubPackageOf({ homeTeam: { club: { package: 'elite' } } }).tier).toBe('elite')
    expect(clubPackageOf({ homeTeam: { club: { package: 'team' } } }).tier).toBe('team')
  })
})

describe('resolveMatchPackage', () => {
  it('valt overal terug op Elite zolang de pakket-feature gedeactiveerd is', () => {
    // PACKAGES_ENABLED=false → volledige werking (Elite) ongeacht het clubpakket.
    expect(PACKAGES_ENABLED).toBe(false)
    expect(resolveMatchPackage(null).tier).toBe('elite')
    expect(resolveMatchPackage({ homeTeam: { club: { package: 'starter' } } }).tier).toBe('elite')
    expect(resolveMatchPackage({ homeTeam: { club: { package: 'team' } } }).tier).toBe('elite')
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
