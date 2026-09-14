import { describe, expect, it } from 'vitest'

import { elapsedSinceScheduledStart, matchStartBlockedReason } from '@/lib/match-start-window'

describe('matchStartBlockedReason', () => {
  const scheduled = '2026-09-14T18:00:00.000Z'

  it('blokkeert vroeger dan een half uur voor aanvang', () => {
    expect(matchStartBlockedReason({ date: scheduled }, new Date('2026-09-14T17:29:59.000Z'))).toContain('Aantekenen kan vanaf')
  })

  it('laat starten vanaf exact een half uur voor aanvang', () => {
    expect(matchStartBlockedReason({ date: scheduled }, new Date('2026-09-14T17:30:00.000Z'))).toBeNull()
  })

  it('laat een demo altijd starten', () => {
    expect(matchStartBlockedReason({ date: scheduled, isDemo: true }, new Date('2026-09-14T10:00:00.000Z'))).toBeNull()
  })

  it('blokkeert een ontbrekend of ongeldig startuur', () => {
    expect(matchStartBlockedReason({ date: null }, new Date())).toContain('geen geldig startuur')
  })
})

describe('elapsedSinceScheduledStart', () => {
  const scheduled = '2026-09-14T15:00:00.000Z'

  it('start zeven minuten na de aftrap op 07:00', () => {
    expect(elapsedSinceScheduledStart({ date: scheduled }, new Date('2026-09-14T15:07:00.000Z'))).toBe(7 * 60)
  })

  it('blijft op nul vóór het geplande uur', () => {
    expect(elapsedSinceScheduledStart({ date: scheduled }, new Date('2026-09-14T14:55:00.000Z'))).toBe(0)
  })

  it('laat demo’s en wedstrijden zonder geldig uur op nul starten', () => {
    expect(elapsedSinceScheduledStart({ date: scheduled, isDemo: true }, new Date('2026-09-14T15:07:00.000Z'))).toBe(0)
    expect(elapsedSinceScheduledStart({ date: null }, new Date('2026-09-14T15:07:00.000Z'))).toBe(0)
  })
})
