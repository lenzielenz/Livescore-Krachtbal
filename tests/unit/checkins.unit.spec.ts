import { describe, it, expect } from 'vitest'

import { sanitizeCheckins, isCheckedIn, toggleCheckin } from '@/lib/checkins'

describe('sanitizeCheckins', () => {
  it('weert rommel en dedupliceert op match-id', () => {
    const r = sanitizeCheckins([{ m: 5, d: '2026-06-16' }, { m: 5, d: 'x' }, { m: 0 }, { n: 1 }, 'foo'])
    expect(r).toHaveLength(1)
    expect(r[0].m).toBe(5)
  })
  it('niet-array → leeg', () => expect(sanitizeCheckins(null)).toEqual([]))
})

describe('isCheckedIn', () => {
  it('detecteert aanwezigheid', () => {
    expect(isCheckedIn([{ m: 3, d: 'x' }], 3)).toBe(true)
    expect(isCheckedIn([{ m: 3, d: 'x' }], 4)).toBe(false)
  })
})

describe('toggleCheckin', () => {
  it('voegt toe als nog niet aanwezig', () => {
    const r = toggleCheckin([], 7, '2026-06-16')
    expect(r).toEqual([{ m: 7, d: '2026-06-16' }])
  })
  it('verwijdert als al aanwezig', () => {
    expect(toggleCheckin([{ m: 7, d: 'x' }], 7)).toEqual([])
  })
})
