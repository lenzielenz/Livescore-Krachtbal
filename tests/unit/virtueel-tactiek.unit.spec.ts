import { describe, expect, it } from 'vitest'

import { beginOpstelling, leesTactiek } from '@/lib/virtueel-tactiek'

// Het tactiekbord in de kleedkamer van Virtueel krachtbal.

describe('tactiekbord', () => {
  it('begint met 4 spelers per ploeg en de bal', () => {
    const t = beginOpstelling()
    expect(t.magneten.filter((m) => m.ploeg === 'wij')).toHaveLength(4)
    expect(t.magneten.filter((m) => m.ploeg === 'zij')).toHaveLength(4)
    expect(t.magneten.filter((m) => m.ploeg === 'bal')).toHaveLength(1)
  })

  it('leest een opgeslagen bord, en negeert rommel', () => {
    const t = leesTactiek({
      magneten: [{ id: 'w1', x: 0.1, y: 0.2 }, { id: 'w2', x: 5, y: 0.2 }, { id: 'onbekend', x: 0.5, y: 0.5 }],
      lijnen: [{ kleur: 'rood', p: [0.1, 0.1, 0.2, 0.2] }, { kleur: 'paars', p: [0, 0] }, { kleur: 'blauw', p: [0.1] }],
    })
    expect(t.magneten.find((m) => m.id === 'w1')).toMatchObject({ x: 0.1, y: 0.2 })
    expect(t.magneten.find((m) => m.id === 'w2')).toMatchObject({ x: 0.3, y: 0.75 })
    expect(t.magneten).toHaveLength(9)
    expect(t.lijnen).toEqual([{ kleur: 'rood', p: [0.1, 0.1, 0.2, 0.2] }])
  })

  it('valt terug op de beginopstelling bij ongeldige invoer', () => {
    expect(leesTactiek(null)).toEqual(beginOpstelling())
    expect(leesTactiek('kapot')).toEqual(beginOpstelling())
  })
})
