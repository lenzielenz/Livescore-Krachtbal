import { describe, expect, it } from 'vitest'

import { knipjesTekst, vastspelenOordeel, vastStatus } from '@/lib/competitieregels'
import { reeksRang } from '@/lib/reeksen'

describe('vastspelen (knipjes)', () => {
  it('rang: 1NAH boven 2NAH boven LH; jeugd A boven B', () => {
    expect(reeksRang('1NAH')).toBeLessThan(reeksRang('2NAH')!)
    expect(reeksRang('2NAH')).toBeLessThan(reeksRang('LH')!)
    expect(reeksRang('U14JA')).toBeLessThan(reeksRang('U14JB')!)
    expect(reeksRang('EINDR')).toBeNull()
  })

  it('vast zodra het maximum bereikt is, in de hoogste reeks', () => {
    expect(vastStatus([{ teamId: 1, reeks: '1NAH', keer: 2 }], 3).vastIn).toBeNull()
    expect(vastStatus([{ teamId: 1, reeks: '1NAH', keer: 3 }], 3).vastIn?.reeks).toBe('1NAH')
    const beide = vastStatus(
      [
        { teamId: 2, reeks: '2NAH', keer: 4 },
        { teamId: 1, reeks: '1NAH', keer: 3 },
      ],
      3,
    )
    expect(beide.vastIn?.reeks).toBe('1NAH')
  })

  it('wie vast zit in 1NAH mag niet meer in zijn eigen 2NAH-ploeg', () => {
    const st = vastStatus([{ teamId: 1, reeks: '1NAH', keer: 3 }], 3)
    expect(vastspelenOordeel(st, '2NAH', { id: 2, reeks: '2NAH' })).toMatchObject({ level: 'block' })
    expect(vastspelenOordeel(st, '2NAH', { id: 1, reeks: '1NAH' })).toMatchObject({ level: 'ok' })
  })

  it('hoger spelen: waarschuwing met de teller, en wat er na deze wedstrijd gebeurt', () => {
    const st = vastStatus([{ teamId: 1, reeks: '1NAH', keer: 1 }], 3)
    expect(vastspelenOordeel(st, '2NAH', { id: 1, reeks: '1NAH' }).reden).toBe('Speelt hoger: dit wordt keer 2 van 3 in 1NAH.')
    const bijna = vastStatus([{ teamId: 1, reeks: '1NAH', keer: 2 }], 3)
    expect(vastspelenOordeel(bijna, '2NAH', { id: 1, reeks: '1NAH' }).reden).toContain('daarna zit hij vast in 1NAH')
    expect(vastspelenOordeel(null, '2NAH', { id: 1, reeks: '1NAH' })).toEqual({ level: 'ok' })
  })

  it('tekst voor speler en club', () => {
    expect(knipjesTekst(vastStatus([{ teamId: 1, reeks: '1NAH', keer: 2 }], 3))).toBe('🎟️ 2/3× hoger in 1NAH — nog 1 keer, dan vast')
    expect(knipjesTekst(vastStatus([{ teamId: 1, reeks: '1NAH', keer: 3 }], 3))).toContain('Vastgespeeld in 1NAH')
    expect(knipjesTekst(null)).toBeNull()
  })
})
