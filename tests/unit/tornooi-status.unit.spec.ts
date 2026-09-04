import { describe, expect, it } from 'vitest'

import { tornooiBadge } from '@/lib/tornooi-status'

// Het etiketje op een tornooikaart. Klein ding, maar het is wat een supporter scant om te zien
// waar er iets te beleven valt — dus moet het kloppen met wat er écht aan de hand is.

describe('tornooiBadge', () => {
  it('zegt LIVE zodra er gespeeld wordt', () => {
    // "LIVE" en niet "BEZIG": dat is het woord dat de rest van het platform gebruikt.
    expect(tornooiBadge('live', true)).toEqual({ label: 'LIVE', cls: 'live', live: true })
  })

  it('zegt dat een reeks nog moet beginnen zolang er niets gespeeld is', () => {
    expect(tornooiBadge('live', false)).toEqual({ label: 'NOG NIET GESTART', cls: 'pending', live: false })
  })

  it('laat een afgesloten reeks afgelopen zijn, ook als er gespeeld werd', () => {
    // De status van het tornooi wint: een afgesloten reeks is niet meer live, wat de wedstrijden
    // ook zeggen.
    expect(tornooiBadge('finished', true)).toEqual({ label: 'AFGELOPEN', cls: 'finished', live: false })
    expect(tornooiBadge('finished', false)).toEqual({ label: 'AFGELOPEN', cls: 'finished', live: false })
  })

  it('behandelt een onbekende status als nog lopend', () => {
    expect(tornooiBadge(null, false).cls).toBe('pending')
    expect(tornooiBadge(undefined, true).cls).toBe('live')
    expect(tornooiBadge('rommel', true).label).toBe('LIVE')
  })

  it('zet de live-vlag enkel wanneer het label ook LIVE zegt', () => {
    // De kaart hangt het kloppende bolletje aan deze vlag; die twee mogen nooit uiteenlopen.
    for (const [status, gestart] of [
      ['live', true],
      ['live', false],
      ['finished', true],
      [null, true],
    ] as const) {
      const b = tornooiBadge(status, gestart)
      expect(b.live).toBe(b.label === 'LIVE')
    }
  })
})
