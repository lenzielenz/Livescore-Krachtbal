import { describe, it, expect } from 'vitest'

import { pronostiekOpen, pronostiekOpenVanaf, weekendRange } from '@/lib/pronostiek-weekend'

// Het speelweek-venster loopt van maandag 08:00 → volgende maandag 08:00 (Belgische tijd).
// Zomertijd (CEST = UTC+2): 08:00 Brussel = 06:00 UTC. Wintertijd (CET = UTC+1): 08:00 = 07:00 UTC.
describe('weekendRange — reset maandag 08:00 (Belgische tijd)', () => {
  it('plaatst een doordeweekse wedstrijd in het juiste venster (zomertijd)', () => {
    const r = weekendRange('2026-06-17T18:00:00Z') // woensdag
    expect(r.startIso).toBe('2026-06-15T06:00:00.000Z') // ma 15 juni 08:00 CEST
    expect(r.endIso).toBe('2026-06-22T06:00:00.000Z')
  })

  it('rekent maandag vóór 08:00 nog bij het vórige weekend', () => {
    const before = weekendRange('2026-06-15T05:00:00Z') // ma 07:00 Brussel
    expect(before.startIso).toBe('2026-06-08T06:00:00.000Z')
    const after = weekendRange('2026-06-15T07:00:00Z') // ma 09:00 Brussel
    expect(after.startIso).toBe('2026-06-15T06:00:00.000Z')
  })

  it('werkt ook in wintertijd (08:00 CET = 07:00 UTC)', () => {
    const r = weekendRange('2026-01-14T12:00:00Z') // woensdag
    expect(r.startIso).toBe('2026-01-12T07:00:00.000Z')
    expect(r.endIso).toBe('2026-01-19T07:00:00.000Z')
  })

  it('het venster is zeven dagen lang (zonder DST-overgang)', () => {
    const r = weekendRange('2026-06-17T18:00:00Z')
    const len = new Date(r.endIso).getTime() - new Date(r.startIso).getTime()
    expect(len).toBe(7 * 24 * 3600 * 1000)
  })
})

// De pronostiek opent zodra het vorige speelweekend voorbij is: zondag om middernacht
// (= maandag 00:00 Belgische tijd) staat de hele komende speelweek open.
describe('pronostiekOpenVanaf / pronostiekOpen — open vanaf zondagmiddernacht', () => {
  it('een zaterdagwedstrijd opent op de maandag 00:00 (BE) van haar speelweek', () => {
    // Za 20 juni 2026 15:00 CEST → open vanaf ma 15 juni 00:00 CEST = zo 14 juni 22:00 UTC.
    expect(pronostiekOpenVanaf('2026-06-20T13:00:00Z').toISOString()).toBe('2026-06-14T22:00:00.000Z')
  })

  it('zondagavond (vorig weekend) is nog dicht; om middernacht gaat ze open', () => {
    const zaterdag = '2026-06-20T13:00:00Z'
    const zondagAvond = new Date('2026-06-14T20:00:00Z') // zo 22:00 Brussel
    const netNaMiddernacht = new Date('2026-06-14T22:00:00Z') // ma 00:00 Brussel
    expect(pronostiekOpen(zaterdag, zondagAvond)).toBe(false)
    expect(pronostiekOpen(zaterdag, netNaMiddernacht)).toBe(true)
  })

  it('op de wedstrijddag zelf blijft ze uiteraard open', () => {
    expect(pronostiekOpen('2026-06-20T13:00:00Z', new Date('2026-06-20T10:00:00Z'))).toBe(true)
  })

  it('werkt ook in wintertijd (ma 00:00 CET = zo 23:00 UTC)', () => {
    expect(pronostiekOpenVanaf('2026-01-17T14:00:00Z').toISOString()).toBe('2026-01-11T23:00:00.000Z')
  })

  it('een wedstrijd op maandag vóór de quota-reset hoort nog bij de vorige speelweek', () => {
    // Ma 15 juni 07:00 Brussel (05:00 UTC) → speelweek van 8 juni → open vanaf ma 8 juni 00:00 CEST.
    expect(pronostiekOpenVanaf('2026-06-15T05:00:00Z').toISOString()).toBe('2026-06-07T22:00:00.000Z')
  })

  it('onbruikbare datum = niet open (server weigert dan sowieso)', () => {
    expect(pronostiekOpen('geen datum')).toBe(false)
  })
})
