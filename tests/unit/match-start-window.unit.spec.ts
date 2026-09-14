import { describe, expect, it } from 'vitest'

import { matchStartBlockedReason } from '@/lib/match-start-window'

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
