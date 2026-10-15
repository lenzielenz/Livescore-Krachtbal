import { describe, expect, it } from 'vitest'

import { BALLEN, BESTE_HOEK, meterTempo, superstarStand, vliegAfstand, werpAfstand } from '@/lib/virtueel-superstar'

describe('Superstar: werpafstand', () => {
  it('een perfecte worp haalt precies het record van elke bal', () => {
    for (const b of BALLEN) expect(werpAfstand(b.id, 1, BESTE_HOEK)).toBeCloseTo(b.record, 1)
  })

  it('de records: 4 kg 26 m, 3 kg 27 m, 2 kg 22 m, en lichter zwakt af', () => {
    const r = Object.fromEntries(BALLEN.map((b) => [b.id, b.record]))
    expect(r).toMatchObject({ '4kg': 26, '3kg': 27, '2kg': 22 })
    expect(r['1kg']).toBeLessThan(22)
    expect(r['800g']).toBeLessThan(r['1kg'])
  })

  it('minder kracht of een slechte hoek is korter', () => {
    const top = werpAfstand('3kg', 1, BESTE_HOEK)
    expect(werpAfstand('3kg', 0.6, BESTE_HOEK)).toBeLessThan(top)
    expect(werpAfstand('3kg', 1, 15)).toBeLessThan(top)
    expect(werpAfstand('3kg', 1, 65)).toBeLessThan(top)
    expect(werpAfstand('3kg', 0, 40)).toBeGreaterThan(0)
  })

  it('nooit verder dan het record, ook niet met rare invoer', () => {
    expect(werpAfstand('4kg', 5, 40)).toBeLessThanOrEqual(26)
    expect(werpAfstand('4kg', -1, 200)).toBeGreaterThan(0)
  })

  it('de beste hoek ligt net onder 45° (je laat los boven de grond)', () => {
    expect(BESTE_HOEK).toBeGreaterThan(38)
    expect(BESTE_HOEK).toBeLessThan(45)
    expect(vliegAfstand(15, BESTE_HOEK)).toBeGreaterThan(vliegAfstand(15, 45))
  })

  it('zwaardere ballen hebben een snellere (lastigere) krachtmeter', () => {
    expect(meterTempo('4kg')).toBeLessThan(meterTempo('800g'))
  })
})

describe('Superstar: klassement', () => {
  it('telt per werper enkel de beste worp, per bal, en kent je eigen besten', () => {
    const w = (naam: string, bal: '2kg' | '3kg', afstand: number, auteur: number) => ({ naam, club: 'KBC', bal, afstand, wanneer: '', auteur })
    const s = superstarStand([w('An', '3kg', 20, 1), w('An', '3kg', 24, 1), w('Bo', '3kg', 22, 2), w('An', '2kg', 18, 1)], 1)
    expect(s.per['3kg'].map((r) => [r.naam, r.afstand])).toEqual([
      ['An', 24],
      ['Bo', 22],
    ])
    expect(s.per['2kg']).toHaveLength(1)
    expect(s.mijn).toEqual({ '3kg': 24, '2kg': 18 })
    expect(s.totaal).toBe(4)
  })
})
