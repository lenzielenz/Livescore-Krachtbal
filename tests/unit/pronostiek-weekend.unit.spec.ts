import { describe, it, expect } from 'vitest'

import { weekendRange } from '@/lib/pronostiek-weekend'

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
