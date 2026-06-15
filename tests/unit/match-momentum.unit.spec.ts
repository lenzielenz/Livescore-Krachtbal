import { describe, it, expect } from 'vitest'

import { buildMomentum, demoMomentum } from '@/lib/match-momentum'
import type { TimelineItem } from '@/lib/match-engine'

const goal = (id: string, side: 'home' | 'away', half: number, gameClock: number, pts: number): TimelineItem => ({
  id,
  kind: 'goal',
  half,
  gameClock,
  side,
  label: `Doelpunt +${pts}`,
})

describe('buildMomentum', () => {
  it('start altijd op 0–0', () => {
    const m = buildMomentum([], 1500)
    expect(m).toEqual([{ t: 0, home: 0, away: 0, diff: 0 }])
  })

  it('telt doelpunten cumulatief op en bepaalt het verschil', () => {
    const tl = [
      goal('a', 'home', 1, 120, 1),
      goal('b', 'away', 1, 300, 2),
      goal('c', 'home', 1, 600, 1),
    ]
    const m = buildMomentum(tl, 1500)
    expect(m.map((p) => p.diff)).toEqual([0, 1, -1, 0])
    expect(m[m.length - 1]).toMatchObject({ home: 2, away: 2, diff: 0 })
  })

  it('negeert niet-doelpunten en zijloze items', () => {
    const tl: TimelineItem[] = [
      { id: 'x', kind: 'timeout', half: 1, gameClock: 100, side: 'home', label: 'Time-out' },
      goal('a', 'home', 1, 200, 1),
      { id: 'y', kind: 'half_start', half: 1, gameClock: 0, side: null, label: 'Start helft 1' },
    ]
    const m = buildMomentum(tl, 1500)
    expect(m).toHaveLength(2)
    expect(m[1].diff).toBe(1)
  })

  it('schakelt de helften aaneen in de tijd-as', () => {
    const tl = [goal('a', 'home', 2, 60, 1)]
    const m = buildMomentum(tl, 1200) // helft = 20 min
    // tweede helft → t = 1×1200 + 60
    expect(m[1].t).toBe(1260)
  })

  it('valt terug op +1 als het label geen punten bevat', () => {
    const tl: TimelineItem[] = [{ id: 'a', kind: 'goal', half: 1, gameClock: 10, side: 'away', label: 'Doelpunt' }]
    const m = buildMomentum(tl, 1500)
    expect(m[1]).toMatchObject({ away: 1, diff: -1 })
  })
})

describe('demoMomentum', () => {
  it('start op 0–0 en eindigt op 5–3 met oplopende tijd', () => {
    const m = demoMomentum(1500)
    expect(m[0]).toEqual({ t: 0, home: 0, away: 0, diff: 0 })
    expect(m[m.length - 1]).toMatchObject({ home: 5, away: 3, diff: 2 })
    for (let i = 1; i < m.length; i++) expect(m[i].t).toBeGreaterThan(m[i - 1].t)
  })
  it('schaalt de doelpunttijden mee met de helftduur', () => {
    expect(demoMomentum(1200)[1].t).toBeLessThan(demoMomentum(1500)[1].t)
  })
})
