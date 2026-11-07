import { describe, expect, it } from 'vitest'

import { dedupeKey, dubbeleWedstrijden, type WedstrijdVoorDedupe } from '@/lib/dedupe'
import { cleanTeamName } from '@/lib/results-import'

const w = (o: Partial<WedstrijdVoorDedupe> & { id: number }): WedstrijdVoorDedupe => ({
  reeks: 'U12B',
  home: 679,
  away: 708,
  date: '2026-10-10T07:30:00.000Z',
  status: 'scheduled',
  eigen: false,
  uitslag: false,
  ...o,
})

describe('dedupeKey', () => {
  it('ziet de federatienaam en onze naam als dezelfde ploeg', () => {
    expect(dedupeKey('Buffalo s Sijsele')).toBe(dedupeKey("Buffalo's Sijsele"))
    expect(dedupeKey('Buffalo S Sijsele')).toBe(dedupeKey("Buffalo's Sijsele"))
    expect(dedupeKey('Buffalo s Sijsele A')).not.toBe(dedupeKey('Buffalo s Sijsele B'))
  })
})

describe('cleanTeamName', () => {
  it('maakt van een weggevallen apostrof geen hoofdletter', () => {
    expect(cleanTeamName('Buffalo s Sijsele')).toBe('Buffalo s Sijsele')
    expect(cleanTeamName('t Botterken Baasrode')).toBe('t Botterken Baasrode')
    expect(cleanTeamName('kbc st. michiels')).toBe('Kbc St. Michiels')
    expect(cleanTeamName('KBC Male')).toBe('KBC Male')
  })
})

describe('dubbeleWedstrijden', () => {
  it('houdt de geplande wedstrijd van de kalender en neemt de uitslag van de importkopie over', () => {
    const r = dubbeleWedstrijden([w({ id: 21439 }), w({ id: 23395, date: '2026-10-10T09:30:00.000Z', status: 'finished', uitslag: true })])
    expect(r).toEqual([{ keep: 21439, weg: [23395], uitslagVan: 23395 }])
  })

  it('houdt bij twee afgelopen kopieën de oudste, zonder uitslag over te zetten', () => {
    const r = dubbeleWedstrijden([
      w({ id: 23394, home: 754, away: 718, date: '2026-10-10T10:00:00.000Z', status: 'finished', uitslag: true }),
      w({ id: 21437, home: 754, away: 718, date: '2026-10-10T08:00:00.000Z', status: 'finished', uitslag: true }),
    ])
    expect(r).toEqual([{ keep: 21437, weg: [23394], uitslagVan: null }])
  })

  it('laat heen- en terugwedstrijd en andere duels met rust', () => {
    expect(dubbeleWedstrijden([w({ id: 1 }), w({ id: 2, date: '2026-12-19T09:30:00.000Z' })])).toEqual([])
    expect(dubbeleWedstrijden([w({ id: 1 }), w({ id: 2, home: 708, away: 679 })])).toEqual([])
    expect(dubbeleWedstrijden([w({ id: 1 }), w({ id: 2, reeks: 'U12A' })])).toEqual([])
  })

  it('behoudt de zelf aangetekende wedstrijd, en beslist niet bij twee registraties', () => {
    expect(dubbeleWedstrijden([w({ id: 1, status: 'finished', uitslag: true }), w({ id: 2, eigen: true, status: 'finished', uitslag: true })])).toEqual([
      { keep: 2, weg: [1], uitslagVan: null },
    ])
    expect(dubbeleWedstrijden([w({ id: 1, eigen: true }), w({ id: 2, eigen: true })])).toEqual([])
  })
})
