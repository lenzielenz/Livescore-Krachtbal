import { describe, it, expect } from 'vitest'

import { sumEntries, remaining, ringFraction, zone, statusMessage, sanitizeTracker, streakFromDays, weightTrend, type FoodEntry } from '@/lib/calorie-tracker'

const e = (kcal: number, p = 0, c = 0, f = 0): FoodEntry => ({ id: Math.random().toString(), name: 'x', kcal, p, c, f })

describe('sumEntries', () => {
  it('telt kcal en macro\'s op', () => {
    expect(sumEntries([e(100, 10, 5, 2), e(250, 20, 30, 8)])).toEqual({ kcal: 350, p: 30, c: 35, f: 10 })
  })
  it('leeg → nul', () => expect(sumEntries([])).toEqual({ kcal: 0, p: 0, c: 0, f: 0 }))
})

describe('remaining', () => {
  it('doel − inname (afgerond)', () => expect(remaining(2000, 1450)).toBe(550))
  it('kan negatief (erover)', () => expect(remaining(2000, 2200)).toBe(-200))
})

describe('ringFraction', () => {
  it('helft', () => expect(ringFraction(2000, 1000)).toBe(0.5))
  it('geklemd op 1', () => expect(ringFraction(2000, 3000)).toBe(1))
  it('doel 0 → 0', () => expect(ringFraction(0, 100)).toBe(0))
})

describe('zone', () => {
  it('leeg', () => expect(zone(2000, 0)).toBe('empty'))
  it('te weinig', () => expect(zone(2000, 1000)).toBe('low'))
  it('op koers', () => { expect(zone(2000, 1850)).toBe('good'); expect(zone(2000, 2000)).toBe('good') })
  it('erover', () => expect(zone(2000, 2200)).toBe('over'))
})

describe('statusMessage', () => {
  it('past zich aan per zone', () => {
    expect(statusMessage(2000, 0)).toMatch(/eerste hap/i)
    expect(statusMessage(2000, 1000)).toMatch(/Nog 1000 kcal/)
    expect(statusMessage(2000, 1950)).toMatch(/koers|balans|getimed/i)
    expect(statusMessage(2000, 2300)).toMatch(/over je doel/i)
  })
})

describe('sanitizeTracker', () => {
  it('houdt geldige dagen/gewichten, weert rommel', () => {
    const s = sanitizeTracker({
      days: { '2026-06-16': [{ id: 'a', name: 'Brood', kcal: 80, p: 3, c: 15, f: 1 }, { name: '', kcal: 5 }], 'fout': [{ name: 'x', kcal: 1 }] },
      weights: [{ d: '2026-06-16', kg: 80.25 }, { d: 'x', kg: 80 }, { d: '2026-06-15', kg: 999 }],
    })
    expect(Object.keys(s.days)).toEqual(['2026-06-16'])
    expect(s.days['2026-06-16']).toHaveLength(1)
    expect(s.weights).toEqual([{ d: '2026-06-16', kg: 80.3 }])
  })
  it('rommel → leeg', () => expect(sanitizeTracker(null)).toEqual({ days: {}, weights: [] }))
})

describe('streakFromDays', () => {
  const day = (offset: number) => {
    const d = new Date('2026-06-16T12:00:00')
    d.setDate(d.getDate() - offset)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  it('telt opeenvolgende dagen, vandaag mag leeg', () => {
    const days = { [day(1)]: [{ id: '1', name: 'x', kcal: 1, p: 0, c: 0, f: 0 }], [day(2)]: [{ id: '2', name: 'y', kcal: 1, p: 0, c: 0, f: 0 }] }
    expect(streakFromDays(days, new Date('2026-06-16T12:00:00'))).toBe(2)
  })
  it('gat breekt de streak', () => {
    const days = { [day(1)]: [{ id: '1', name: 'x', kcal: 1, p: 0, c: 0, f: 0 }], [day(3)]: [{ id: '3', name: 'z', kcal: 1, p: 0, c: 0, f: 0 }] }
    expect(streakFromDays(days, new Date('2026-06-16T12:00:00'))).toBe(1)
  })
})

describe('weightTrend', () => {
  it('dalende trend + eta naar streefgewicht', () => {
    const t = weightTrend([{ d: '2026-06-01', kg: 82 }, { d: '2026-06-08', kg: 81 }, { d: '2026-06-15', kg: 80 }], 78)
    expect(t.current).toBe(80)
    expect(t.perWeek).toBeCloseTo(-1, 1)
    expect(t.etaDays).toBeGreaterThan(0)
  })
  it('geen eta als trend de verkeerde kant op gaat', () => {
    const t = weightTrend([{ d: '2026-06-01', kg: 80 }, { d: '2026-06-15', kg: 81 }], 78)
    expect(t.etaDays).toBeNull()
  })
  it('één meting → geen trend', () => {
    expect(weightTrend([{ d: '2026-06-15', kg: 80 }], 78)).toEqual({ current: 80, perWeek: 0, etaDays: null })
  })
})
