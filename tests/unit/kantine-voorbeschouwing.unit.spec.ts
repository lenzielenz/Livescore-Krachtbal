import { describe, expect, it } from 'vitest'

import { komendWeekend, voorbeschouwingKolommen, weekendVoorbeschouwing } from '@/lib/kantine-selectie'

// De weekendvoorbeschouwing: zolang er in het komende weekend nog niets gestart is, staan álle
// wedstrijden van dat weekend tegelijk op de kantine-tv.

// Donderdag 15 oktober 2026, 20:00 Belgische tijd (zomertijd, UTC+2).
const donderdag = new Date('2026-10-15T18:00:00Z')
const m = (id: number, date: string, status = 'scheduled') => ({ id, date, status })

describe('komendWeekend', () => {
  it('doordeweeks: het eerstvolgende weekend, zaterdag 00:00 tot maandag 00:00', () => {
    expect(komendWeekend(donderdag)).toEqual({ start: '2026-10-16T22:00:00.000Z', einde: '2026-10-18T22:00:00.000Z' })
  })
  it('op zondag: het lopende weekend', () => {
    expect(komendWeekend(new Date('2026-10-18T09:00:00Z')).start).toBe('2026-10-16T22:00:00.000Z')
  })
})

describe('weekendVoorbeschouwing', () => {
  const weekend = [m(3, '2026-10-18T13:00:00Z'), m(1, '2026-10-17T08:45:00Z'), m(2, '2026-10-17T15:30:00Z')]

  it('toont alle wedstrijden van zaterdag en zondag, chronologisch', () => {
    expect(weekendVoorbeschouwing([...weekend, m(9, '2026-10-21T18:00:00Z')], donderdag).map((x) => x.id)).toEqual([1, 2, 3])
  })
  it('verdwijnt zodra er één wedstrijd van het weekend gestart is', () => {
    expect(weekendVoorbeschouwing([...weekend.slice(1), m(1, '2026-10-17T08:45:00Z', 'live')], donderdag)).toEqual([])
    expect(weekendVoorbeschouwing([...weekend.slice(1), m(1, '2026-10-17T08:45:00Z', 'finished')], donderdag)).toEqual([])
  })
  it('verdwijnt ook als er elders iets live is', () => {
    expect(weekendVoorbeschouwing([...weekend, m(7, '2026-10-15T17:00:00Z', 'live')], donderdag)).toEqual([])
  })
  it('leeg zonder wedstrijden in het weekend', () => {
    expect(weekendVoorbeschouwing([m(9, '2026-10-21T18:00:00Z')], donderdag)).toEqual([])
  })
})

describe('voorbeschouwingKolommen', () => {
  it('negen wedstrijden op een tv: drie kolommen', () => {
    expect(voorbeschouwingKolommen(9, 1920)).toBe(3)
  })
  it('smal scherm: minder kolommen', () => {
    expect(voorbeschouwingKolommen(9, 400)).toBe(1)
    expect(voorbeschouwingKolommen(14, 1920)).toBe(4)
  })
})
