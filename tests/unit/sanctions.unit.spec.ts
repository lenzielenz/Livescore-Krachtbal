import { describe, it, expect } from 'vitest'

import { isKnipjesBlocked, openKnipjes } from '@/lib/sanctions'

const now = new Date('2026-06-01T00:00:00.000Z')

describe('openKnipjes', () => {
  it('telt aantal op, default 1 per record', () => {
    expect(openKnipjes([{ aantal: 2 }, {}, { aantal: 1 }], now)).toBe(4)
  })
  it('vervallen knipjes tellen niet mee', () => {
    const records = [
      { aantal: 2, vervallenOp: '2026-01-01' }, // vervallen → 0
      { aantal: 3, vervallenOp: '2026-12-31' }, // nog geldig
      { aantal: 1 }, // open
    ]
    expect(openKnipjes(records, now)).toBe(4)
  })
})

describe('isKnipjesBlocked', () => {
  it('blokkeert bij of boven de drempel', () => {
    expect(isKnipjesBlocked(3, 3)).toBe(true)
    expect(isKnipjesBlocked(4, 3)).toBe(true)
    expect(isKnipjesBlocked(2, 3)).toBe(false)
  })
})
