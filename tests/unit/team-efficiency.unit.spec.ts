import { describe, it, expect } from 'vitest'

import type { XpPlayer } from '@/lib/expected-points'
import { efficiencyLabel, teamEfficiency } from '@/lib/team-efficiency'

const xp = (over: Partial<XpPlayer> & Pick<XpPlayer, 'playerId' | 'teamId' | 'points' | 'xPoints'>): XpPlayer => ({
  playerId: over.playerId,
  name: over.name ?? `Speler ${over.playerId}`,
  shirtNumber: over.shirtNumber ?? over.playerId,
  teamId: over.teamId,
  teamName: over.teamName ?? 'Ploeg',
  attempts: over.attempts ?? 5,
  goals: over.goals ?? 3,
  points: over.points,
  xPoints: over.xPoints,
  diff: Math.round((over.points - over.xPoints) * 10) / 10,
})

describe('teamEfficiency', () => {
  it('telt enkel de spelers van de gevraagde ploeg op', () => {
    const players = [
      xp({ playerId: 1, teamId: 10, points: 6, xPoints: 4 }),
      xp({ playerId: 2, teamId: 10, points: 4, xPoints: 5 }),
      xp({ playerId: 3, teamId: 99, points: 8, xPoints: 2 }),
    ]
    const e = teamEfficiency(players, 10)
    expect(e.actual).toBe(10)
    expect(e.expected).toBe(9)
    expect(e.diff).toBe(1)
  })

  it('duidt boven/onder verwachting', () => {
    expect(efficiencyLabel(3).tone).toBe('over')
    expect(efficiencyLabel(-3).tone).toBe('under')
    expect(efficiencyLabel(0).tone).toBe('even')
  })

  it('is veilig bij een ploeg zonder spelers', () => {
    const e = teamEfficiency([], 10)
    expect(e).toEqual({ actual: 0, expected: 0, diff: 0, attempts: 0, goals: 0 })
  })
})
