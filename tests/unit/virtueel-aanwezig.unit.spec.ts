import { afterEach, describe, expect, it } from 'vitest'

import { aanwezig, leesKledij, leesPlek, meld, namen, nieuwGeheugen, vergeetAlles, VERGEET_NA, vertrek, volgAanwezigen, WEG_NA } from '@/lib/virtueel-aanwezig'

const plek = { x: 1, y: 0, z: 2, yaw: 0.5, verdiep: 0, vliegt: false }

describe('samen in het stadion', () => {
  afterEach(() => vergeetAlles())

  it('houdt per club de laatste plek van iedereen bij', () => {
    meld('1', { id: 'a', naam: 'An', outfit: {} }, plek, 1000)
    meld('1', { id: 'a', naam: 'An', outfit: {} }, { ...plek, x: 5 }, 1100)
    meld('1', { id: 'b', naam: 'Bo', outfit: {} }, plek, 1050)
    meld('2', { id: 'c', naam: 'Cas', outfit: {} }, plek, 1050)
    const l = aanwezig('1', 1200)
    expect(l.map((a) => [a.id, a.x])).toEqual([
      ['a', 5],
      ['b', 1],
    ])
    expect(aanwezig('2', 1200)).toHaveLength(1)
  })

  it('vergeet wie een tijd niets meer stuurde, en wie vertrekt', () => {
    meld('1', { id: 'a', naam: 'An', outfit: {} }, plek, 0)
    meld('1', { id: 'b', naam: 'Bo', outfit: {} }, plek, 0)
    vertrek('1', 'b')
    expect(aanwezig('1', 10).map((a) => a.id)).toEqual(['a'])
    expect(aanwezig('1', VERGEET_NA + 1)).toEqual([])
  })

  it('leest enkel geldige plekken', () => {
    expect(leesPlek({ x: 1, y: 2, z: 3, yaw: 0.1, verdiep: -1 })).toMatchObject({ verdiep: -1, vliegt: false })
    expect(leesPlek({ x: 1, y: 2, z: 3, yaw: 0.1, verdiep: 7 })).toBeNull()
    expect(leesPlek({ x: 'a', y: 2, z: 3, yaw: 0, verdiep: 0 })).toBeNull()
    expect(leesPlek({ x: 9999, y: 2, z: 3, yaw: 0, verdiep: 0 })).toBeNull()
  })

  it('leest enkel bestaande kledij van de juiste soort', () => {
    expect(leesKledij({ pet: 'pet-kroon', shirt: 'pet-club', schoenen: 'nep' })).toEqual({ pet: 'pet-kroon' })
  })
})

describe('meldingen: wie komt binnen, wie vertrekt', () => {
  const a = (id: string, naam: string) => ({ ...plek, id, naam, outfit: {}, t: 0 })

  it('meldt eerst wie er al is, daarna wie erbij komt (en jezelf nooit)', () => {
    const g = nieuwGeheugen()
    expect(volgAanwezigen(g, [a('ik', 'Ik'), a('b', 'Bo')], 'ik', 0)).toEqual({ alHier: ['Bo'], binnen: [], weg: [] })
    expect(volgAanwezigen(g, [a('ik', 'Ik'), a('b', 'Bo'), a('c', 'Cas')], 'ik', 100)).toEqual({ alHier: [], binnen: ['Cas'], weg: [] })
  })

  it('meldt een vertrek pas als iemand een tijd weg is; wie snel terug is, telt niet', () => {
    const g = nieuwGeheugen()
    volgAanwezigen(g, [a('b', 'Bo')], 'ik', 0)
    expect(volgAanwezigen(g, [], 'ik', 1000).weg).toEqual([])
    expect(volgAanwezigen(g, [a('b', 'Bo')], 'ik', 5000)).toEqual({ alHier: [], binnen: [], weg: [] })
    volgAanwezigen(g, [], 'ik', 6000)
    expect(volgAanwezigen(g, [], 'ik', 6000 + WEG_NA + 1).weg).toEqual(['Bo'])
    expect(volgAanwezigen(g, [a('b', 'Bo')], 'ik', 40000).binnen).toEqual(['Bo'])
  })

  it('zet namen leesbaar achter elkaar', () => {
    expect(namen(['An'])).toBe('An')
    expect(namen(['An', 'Bo'])).toBe('An en Bo')
    expect(namen(['An', 'Bo', 'Cas'])).toBe('An, Bo en Cas')
    expect(namen(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C en 3 anderen')
  })
})
