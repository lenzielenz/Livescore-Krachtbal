import { describe, it, expect } from 'vitest'

import {
  isAdultReeks,
  krachtbalKleur,
  reeksCategorie,
  reeksHalfDurationSeconds,
  reeksUsesSeniorThrows,
  voorgiftPunten,
} from '@/lib/reeksen'

describe('reeksUsesSeniorThrows (§6.8: U16-meisjes spelen senior-worpaantal)', () => {
  it('U16-meisjes gebruiken het senior-worpaantal', () => {
    expect(reeksUsesSeniorThrows('U16M')).toBe(true)
  })
  it('U16-jongens en andere jeugd niet', () => {
    expect(reeksUsesSeniorThrows('U16J')).toBe(false)
    expect(reeksUsesSeniorThrows('U14M')).toBe(false)
    expect(reeksUsesSeniorThrows('1NAH')).toBe(false)
  })
  it('geldt ook voor de nieuwe U16-meisjespoules (seizoen 2026-2027)', () => {
    expect(reeksUsesSeniorThrows('U16MA')).toBe(true)
    expect(reeksUsesSeniorThrows('U16MB')).toBe(true)
  })
})

describe('nieuwe reeksen seizoen 2026-2027 (RHC, U12A/B, U14JA/B, U16MA/B)', () => {
  it('RHC is een volwassen regionale herenreeks, zoals RHA/RHB', () => {
    expect(reeksCategorie('RHC')).toBe('senioren')
    expect(krachtbalKleur('RHC')).toBe('wit')
    expect(isAdultReeks('RHC')).toBe(true)
    expect(reeksHalfDurationSeconds('RHC')).toBe(25 * 60)
  })
  it('U12A/U12B blijven jeugd (U12), gele bal, 2×20 min', () => {
    for (const r of ['U12A', 'U12B'] as const) {
      expect(reeksCategorie(r)).toBe('U12')
      expect(krachtbalKleur(r)).toBe('geel')
      expect(isAdultReeks(r)).toBe(false)
      expect(reeksHalfDurationSeconds(r)).toBe(20 * 60)
    }
  })
  it('U14JA/U14JB blijven jeugd (U14), gele bal, 2×20 min', () => {
    for (const r of ['U14JA', 'U14JB'] as const) {
      expect(reeksCategorie(r)).toBe('U14')
      expect(krachtbalKleur(r)).toBe('geel')
      expect(reeksHalfDurationSeconds(r)).toBe(20 * 60)
    }
  })
  it('U16MA/U16MB blijven jeugd (U16), blauwe bal, 2×20 min', () => {
    for (const r of ['U16MA', 'U16MB'] as const) {
      expect(reeksCategorie(r)).toBe('U16')
      expect(krachtbalKleur(r)).toBe('blauw')
      expect(reeksHalfDurationSeconds(r)).toBe(20 * 60)
    }
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
