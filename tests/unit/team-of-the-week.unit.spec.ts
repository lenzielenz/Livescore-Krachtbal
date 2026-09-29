import { describe, it, expect } from 'vitest'

import {
  buildTeamOfTheWeek,
  playerOfTheWeek,
  teamOfTheWeek,
  weekScore,
  type WeekPlayer,
} from '@/lib/team-of-the-week'

const player = (over: Partial<WeekPlayer> & { playerId: number; teamId: number }): WeekPlayer => ({
  name: `Speler ${over.playerId}`,
  shirtNumber: null,
  teamName: `Ploeg ${over.teamId}`,
  goals: 0,
  points: 0,
  conversion: 0,
  lost: 0,
  result: 'loss',
  ...over,
})

describe('weekScore', () => {
  it('punten wegen zwaarder dan losse doelpunten', () => {
    const rug = weekScore(player({ playerId: 1, teamId: 1, goals: 2, points: 4 }))
    const nek = weekScore(player({ playerId: 2, teamId: 1, goals: 2, points: 2 }))
    expect(rug).toBeGreaterThan(nek)
  })
  it('balverlies trekt af', () => {
    const clean = weekScore(player({ playerId: 1, teamId: 1, goals: 3, points: 3 }))
    const sloppy = weekScore(player({ playerId: 2, teamId: 1, goals: 3, points: 3, lost: 4 }))
    expect(sloppy).toBeLessThan(clean)
  })
  it('winnen levert een bonus', () => {
    const same = { playerId: 1, teamId: 1, goals: 2, points: 2 } as const
    expect(weekScore(player({ ...same, result: 'win' }))).toBeGreaterThan(weekScore(player({ ...same, result: 'loss' })))
  })
})

describe('buildTeamOfTheWeek', () => {
  it('kiest vier spelers uit vier verschillende ploegen', () => {
    const players: WeekPlayer[] = [
      player({ playerId: 1, teamId: 1, goals: 6, points: 10, result: 'win' }),
      player({ playerId: 2, teamId: 1, goals: 5, points: 9, result: 'win' }),
      player({ playerId: 3, teamId: 2, goals: 4, points: 7, result: 'win' }),
      player({ playerId: 4, teamId: 3, goals: 3, points: 6, result: 'draw' }),
      player({ playerId: 5, teamId: 4, goals: 3, points: 5, result: 'win' }),
      player({ playerId: 6, teamId: 5, goals: 1, points: 1 }),
    ]
    const sel = buildTeamOfTheWeek(players)
    expect(sel).toHaveLength(4)
    expect(new Set(sel.map((p) => p.teamId)).size).toBe(4)
    expect(sel[0].playerId).toBe(1)
    expect(sel.some((p) => p.playerId === 2)).toBe(false) // tweede van dezelfde ploeg valt weg
  })
  it('vult aan met een tweede speler als er te weinig ploegen zijn', () => {
    const players: WeekPlayer[] = [
      player({ playerId: 1, teamId: 1, goals: 5, points: 8, result: 'win' }),
      player({ playerId: 2, teamId: 1, goals: 4, points: 6, result: 'win' }),
      player({ playerId: 3, teamId: 2, goals: 3, points: 5 }),
      player({ playerId: 4, teamId: 2, goals: 2, points: 3 }),
    ]
    const sel = buildTeamOfTheWeek(players)
    expect(sel).toHaveLength(4)
  })
  it('spelers zonder bijdrage komen er niet in', () => {
    expect(buildTeamOfTheWeek([player({ playerId: 1, teamId: 1, lost: 3 })])).toEqual([])
  })
  it('leeg weekend → lege selectie', () => {
    expect(buildTeamOfTheWeek([])).toEqual([])
    expect(playerOfTheWeek([])).toBeNull()
  })
})

describe('teamOfTheWeek', () => {
  it('kiest de winnaar met het grootste doelsaldo', () => {
    const best = teamOfTheWeek([
      { teamId: 1, teamName: 'A', goalsFor: 20, goalsAgainst: 18, result: 'win' },
      { teamId: 2, teamName: 'B', goalsFor: 30, goalsAgainst: 12, result: 'win' },
      { teamId: 3, teamName: 'C', goalsFor: 40, goalsAgainst: 2, result: 'loss' },
    ])
    expect(best?.teamName).toBe('B')
    expect(best?.diff).toBe(18)
  })
  it('geen winnaars → null', () => {
    expect(teamOfTheWeek([{ teamId: 1, teamName: 'A', goalsFor: 1, goalsAgainst: 1, result: 'draw' }])).toBeNull()
  })
  it('negeert een forfaitoverwinning (30–0), ook al is het doelsaldo het grootst', () => {
    const best = teamOfTheWeek([
      { teamId: 1, teamName: 'A', goalsFor: 20, goalsAgainst: 18, result: 'win' },
      { teamId: 2, teamName: 'Forfaitwinnaar', goalsFor: 30, goalsAgainst: 0, result: 'win' },
    ])
    expect(best?.teamName).toBe('A')
  })
  it('enkel forfaitoverwinningen → null', () => {
    expect(teamOfTheWeek([{ teamId: 1, teamName: 'A', goalsFor: 30, goalsAgainst: 0, result: 'win' }])).toBeNull()
  })
})
