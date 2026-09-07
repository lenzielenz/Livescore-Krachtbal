import { describe, expect, it } from 'vitest'

import { MAX_KANTINE_IDS, kantineIds, kantineSleutel } from '@/lib/kantine-channel'

describe('kantineIds', () => {
  it('leest een komma-lijst uit de url', () => {
    expect(kantineIds('3,1,2')).toEqual([1, 2, 3])
  })

  it('sorteert en ontdubbelt, zodat twee tv’s dezelfde poller delen', () => {
    // Twee schermen met dezelfde wedstrijden in een andere volgorde horen op één sleutel uit te
    // komen — anders start elke tv zijn eigen poller en is de winst weg.
    expect(kantineSleutel(kantineIds('7,2,7,2'))).toBe(kantineSleutel(kantineIds('2,7')))
  })

  it('gooit rommel weg', () => {
    expect(kantineIds('1,abc,,0,-4,2.9,3')).toEqual([1, 2, 3])
  })

  it('begrenst het aantal wedstrijden', () => {
    const veel = Array.from({ length: 500 }, (_, i) => i + 1).join(',')
    expect(kantineIds(veel)).toHaveLength(MAX_KANTINE_IDS)
  })

  it('slikt lege en onmogelijke invoer', () => {
    for (const invoer of ['', null, undefined, 42, {}, [], 'x,y,z']) {
      expect(kantineIds(invoer)).toEqual([])
    }
  })

  it('aanvaardt ook een echte lijst', () => {
    expect(kantineIds([3, '1', 2])).toEqual([1, 2, 3])
  })
})

describe('kantineSleutel', () => {
  it('geeft één sleutel per wedstrijdenlijst', () => {
    expect(kantineSleutel([1, 2, 3])).toBe('kantine:1,2,3')
  })

  it('verschilt zodra de lijst verschilt', () => {
    expect(kantineSleutel([1, 2])).not.toBe(kantineSleutel([1, 2, 3]))
  })
})
