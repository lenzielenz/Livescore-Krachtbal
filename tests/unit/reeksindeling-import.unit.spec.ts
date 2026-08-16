import { describe, expect, it } from 'vitest'

import { parseReeksindeling, parseReeksindelingTeams } from '@/lib/reeksindeling-import'

describe('parseReeksindeling', () => {
  it('leest een regel zonder kleur (klassiek formaat)', () => {
    const entries = parseReeksindeling('1D&WKoekelare1NHza18:00')
    expect(entries).toEqual([{ team: 'D&WKoekelare', code: '1NH', reeksen: ['1NAH'], day: 'za', time: '18:00' }])
  })

  it('slaat de truikleur tussen reekscode en dag/uur over (nieuw PDF-formaat)', () => {
    const entries = parseReeksindeling('1D&WKoekelare1NHZwart/Roodza18:00')
    expect(entries).toEqual([{ team: 'D&WKoekelare', code: '1NH', reeksen: ['1NAH'], day: 'za', time: '18:00' }])
  })

  it('herkent de nieuwe regionale C-poule en jeugd-subreeksen', () => {
    const entries = parseReeksindeling(
      '1KBKTemseREGHCblauw/geelza18:001KBKTemseU12Ageelza10:001KBKTemseU14JBrood-witzo9:00',
    )
    expect(entries.map((e) => e.code)).toEqual(['REGHC', 'U12A', 'U14JB'])
    expect(entries.map((e) => e.reeksen)).toEqual([['RHC'], ['U12A'], ['U14JB']])
  })
})

describe('parseReeksindelingTeams', () => {
  it('leest club + ploeg + kleur-tolerante reekscode uit de gespatieerde tekst', () => {
    // De PDF laat een spatie vóór de poule-letter staan (bv. "Michiels A"), maar plakt de
    // reekscode + kleur er direct tegenaan zonder scheidingsteken.
    const entries = parseReeksindelingTeams('4KBC St. Michiels A2NHRood/Grijsza18:00')
    expect(entries).toEqual([{ team: 'KBC St. Michiels A', club: 'KBC St. Michiels', reeks: '2NAH', day: 'za', time: '18:00' }])
  })
})
