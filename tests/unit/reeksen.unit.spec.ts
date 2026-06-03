import { describe, it, expect } from 'vitest'

import { reeksUsesSeniorThrows, voorgiftPunten } from '@/lib/reeksen'

describe('reeksUsesSeniorThrows (§6.8: U16-meisjes spelen senior-worpaantal)', () => {
  it('U16-meisjes gebruiken het senior-worpaantal', () => {
    expect(reeksUsesSeniorThrows('U16M')).toBe(true)
  })
  it('U16-jongens en andere jeugd niet', () => {
    expect(reeksUsesSeniorThrows('U16J')).toBe(false)
    expect(reeksUsesSeniorThrows('U14M')).toBe(false)
    expect(reeksUsesSeniorThrows('1NAH')).toBe(false)
  })
})

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
