import { describe, it, expect } from 'vitest'

import { opSpeeltijd } from '@/lib/tornooi-volgorde'

// De volgorde van de wedstrijden binnen één tornooireeks.
//
// Aanleiding: de lijst stond in schemavolgorde — de volgorde waarin de loting ze aanmaakte — en
// dat leest als 15:10, 17:30, 14:00, 16:20. Aan een tornooi zoek je op uur ("die van kwart over
// drie"), dus hoort de lijst op uur te staan.

const m = (id: number, plannedAt: string | null, round = 1, position = id) => ({
  id, plannedAt, round, position,
})

describe('opSpeeltijd', () => {
  it('zet de wedstrijden op uur', () => {
    const uit = opSpeeltijd([
      m(1, '2026-09-02T15:10:00.000Z'),
      m(2, '2026-09-02T17:30:00.000Z'),
      m(3, '2026-09-02T14:00:00.000Z'),
      m(4, '2026-09-02T16:20:00.000Z'),
    ])
    expect(uit.map((x) => x.id)).toEqual([3, 1, 4, 2])
  })

  it('zet wedstrijden zonder uur achteraan', () => {
    // Meestal de latere rondes, waarvan de ploegen nog moeten blijken — precies waar ze horen.
    const uit = opSpeeltijd([
      m(1, null, 2, 1),
      m(2, '2026-09-02T14:00:00.000Z'),
      m(3, null, 2, 2),
    ])
    expect(uit.map((x) => x.id)).toEqual([2, 1, 3])
  })

  it('houdt de schemavolgorde aan bij een gelijk uur', () => {
    // Twee velden, zelfde aanvangsuur: dan mag de lijst niet bij elke live-update van plaats
    // wisselen. Zonder deze regel is de volgorde afhankelijk van hoe de browser sorteert.
    const uit = opSpeeltijd([
      m(9, '2026-09-02T14:00:00.000Z', 1, 3),
      m(8, '2026-09-02T14:00:00.000Z', 1, 1),
      m(7, '2026-09-02T14:00:00.000Z', 1, 2),
    ])
    expect(uit.map((x) => x.id)).toEqual([8, 7, 9])
  })

  it('behandelt een onleesbaar uur als "geen uur"', () => {
    const uit = opSpeeltijd([m(1, 'geen datum'), m(2, '2026-09-02T14:00:00.000Z')])
    expect(uit.map((x) => x.id)).toEqual([2, 1])
  })

  it('laat de meegegeven lijst met rust', () => {
    // De lijst komt uit de livestream; die ter plaatse omgooien terwijl React ernaar kijkt, is
    // vragen om een scherm dat halverwege van volgorde verandert.
    const origineel = [m(1, '2026-09-02T17:00:00.000Z'), m(2, '2026-09-02T14:00:00.000Z')]
    const kopie = [...origineel]
    opSpeeltijd(origineel)
    expect(origineel).toEqual(kopie)
  })
})
