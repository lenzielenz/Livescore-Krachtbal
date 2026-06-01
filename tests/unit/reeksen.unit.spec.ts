import { describe, it, expect } from 'vitest'

import { voorgiftPunten } from '@/lib/reeksen'

describe('voorgiftPunten (beker: 3 ptn per reeksverschil, max 6)', () => {
  it('geen verschil → 0', () => {
    expect(voorgiftPunten('1NAH', '1NAD')).toBe(0) // beide rang 1
  })
  it('één reeks verschil → 3', () => {
    expect(voorgiftPunten('1NAH', '2NAH')).toBe(3)
  })
  it('twee reeksen verschil → 6', () => {
    expect(voorgiftPunten('1NAH', 'LH')).toBe(6)
  })
  it('drie of meer verschil → geplafonneerd op 6', () => {
    expect(voorgiftPunten('1NAH', 'RHA')).toBe(6)
  })
  it('niet-geordende reeks (beker/recreatief) → 0', () => {
    expect(voorgiftPunten('1NAH', 'beker')).toBe(0)
  })
})
