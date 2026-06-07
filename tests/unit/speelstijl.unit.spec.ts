import { describe, it, expect } from 'vitest'

import { buildStrategie, parseSpeelstijl, hasSpeelstijl, type SpeelstijlMeasured } from '@/lib/speelstijl'

describe('parseSpeelstijl', () => {
  it('leest een geldig profiel in', () => {
    const s = parseSpeelstijl({ accent: 'aanvallend', zone: 'links', worp: 'rug', verreWorp: true, notitie: 'test' })
    expect(s).toEqual({ accent: 'aanvallend', tempo: null, zone: 'links', worp: 'rug', verreWorp: true, notitie: 'test' })
  })

  it('negeert ongeldige waarden', () => {
    const s = parseSpeelstijl({ accent: 'flauwekul', zone: 123, verreWorp: 'ja' })
    expect(s.accent).toBeNull()
    expect(s.zone).toBeNull()
    expect(s.verreWorp).toBeNull()
  })

  it('geeft een leeg profiel bij niet-object', () => {
    expect(parseSpeelstijl(null)).toEqual({})
    expect(hasSpeelstijl(parseSpeelstijl(null))).toBe(false)
  })

  it('knipt de notitie af op 600 tekens', () => {
    expect(parseSpeelstijl({ notitie: 'x'.repeat(900) }).notitie).toHaveLength(600)
  })
})

describe('buildStrategie', () => {
  const meas: SpeelstijlMeasured = { goalZone: { zone: 'rechts', pct: 62 }, rugShare: 0.2, verreWorpen: 1 }

  it('bevestigt wanneer voorkeurszone en data overeenkomen', () => {
    const tips = buildStrategie({ zone: 'rechts' }, meas)
    expect(tips.join(' ')).toMatch(/dat lukt/)
  })

  it('waarschuwt wanneer voorkeurszone afwijkt van de data', () => {
    const tips = buildStrategie({ zone: 'links' }, meas)
    expect(tips.join(' ')).toMatch(/maar de meeste doelpunten vallen via rechts/)
  })

  it('signaleert te weinig rugworpen bij een rug-voorkeur', () => {
    const tips = buildStrategie({ worp: 'rug' }, meas)
    expect(tips.join(' ')).toMatch(/durf vaker dubbel/)
  })

  it('wijst op weinig verre worpen wanneer dat de bedoeling is', () => {
    const tips = buildStrategie({ verreWorp: true }, { ...meas, verreWorpen: 1 })
    expect(tips.join(' ')).toMatch(/komt nog weinig voor/)
  })

  it('geeft niets terug bij een leeg profiel', () => {
    expect(buildStrategie({}, { goalZone: null, rugShare: null, verreWorpen: 0 })).toEqual([])
  })
})
