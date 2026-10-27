import { describe, expect, it } from 'vitest'

import { brusselsWallUtc } from '@/lib/datetime'
import { dagenTussen, geldigeDatum, isoWeek, verschuifAftrap, weekLabel, weekendGrenzen, weekendVerplaatsing } from '@/lib/weekend-verplaatsen'

describe('speelweekend verplaatsen', () => {
  it('kent het ISO-weeknummer', () => {
    expect(isoWeek('2026-10-24')).toEqual({ jaar: 2026, week: 43 })
    expect(isoWeek('2026-10-25')).toEqual({ jaar: 2026, week: 43 })
    expect(isoWeek('2027-01-02')).toEqual({ jaar: 2026, week: 53 })
    expect(weekLabel('2026-10-24')).toBe('week 43')
  })

  it('telt de dagen tussen twee zaterdagen', () => {
    expect(dagenTussen('2026-10-24', '2026-11-07')).toBe(14)
    expect(dagenTussen('2026-11-07', '2026-10-24')).toBe(-14)
  })

  it('houdt het Belgische aftrapuur over de wintertijdgrens heen', () => {
    // Za 24 okt 2026 14.30 u (zomertijd, UTC+2) → za 31 okt (wintertijd, UTC+1): nog altijd 14.30 u.
    const aftrap = brusselsWallUtc(2026, 10, 24, 14, 30).toISOString()
    expect(aftrap).toBe('2026-10-24T12:30:00.000Z')
    expect(verschuifAftrap(aftrap, 7)).toBe(brusselsWallUtc(2026, 10, 31, 14, 30).toISOString())
    expect(verschuifAftrap(aftrap, 7)).toBe('2026-10-31T13:30:00.000Z')
  })

  it('schuift zaterdag en zondag elk naar hun eigen dag', () => {
    const za = brusselsWallUtc(2026, 10, 24, 14, 30).toISOString()
    const zo = brusselsWallUtc(2026, 10, 25, 10, 0).toISOString()
    const r = weekendVerplaatsing(
      [
        { matchId: 1, date: za },
        { matchId: 2, date: zo },
      ],
      '2026-10-24',
      '2026-11-07',
    )
    expect(r.dagen).toBe(14)
    expect(r.wijzigingen).toEqual([
      { matchId: 1, date: brusselsWallUtc(2026, 11, 7, 14, 30).toISOString() },
      { matchId: 2, date: brusselsWallUtc(2026, 11, 8, 10, 0).toISOString() },
    ])
  })

  it('neemt een gekozen zondag als haar weekend en laat vreemde wedstrijden staan', () => {
    const za = brusselsWallUtc(2026, 10, 24, 14, 30).toISOString()
    const anders = brusselsWallUtc(2026, 10, 17, 14, 30).toISOString()
    const r = weekendVerplaatsing(
      [
        { matchId: 1, date: za },
        { matchId: 9, date: anders },
      ],
      '2026-10-25',
      '2026-11-08',
    )
    expect(r.dagen).toBe(14)
    expect(r.wijzigingen.map((w) => w.matchId)).toEqual([1])
  })

  it('begrenst een speelweekend als de hele speelweek: maandag 0 u tot maandag 0 u, Belgische tijd', () => {
    const g = weekendGrenzen('2026-10-24')
    expect(g.start).toBe('2026-10-18T22:00:00.000Z') // ma 19 okt, zomertijd: UTC+2
    expect(g.einde).toBe('2026-10-25T23:00:00.000Z') // ma 26 okt, na de wintertijd: UTC+1
  })

  it('keurt enkel een kalenderdatum goed', () => {
    expect(geldigeDatum('2026-10-24')).toBe(true)
    expect(geldigeDatum('2026-13-40')).toBe(false)
    expect(geldigeDatum('gisteren')).toBe(false)
    expect(geldigeDatum(42)).toBe(false)
  })
})
