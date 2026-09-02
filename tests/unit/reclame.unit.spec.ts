import { describe, it, expect } from 'vitest'

import { balkOpstelling, SNELHEID_PX_S, TEGEL_PX } from '@/lib/reclame-balk'
import {
  kiesReclame,
  OVERLAY_MS,
  SPREIDING,
  TUSSENTIJD_MS,
  volgendeWachttijdMs,
} from '@/lib/reclame-overlay'
import { normaliseerUitsnede, uitsnedeStijl } from '@/lib/reclame'

describe('uitsnede van een reclamebeeld', () => {
  it('valt terug op passend en recht', () => {
    expect(normaliseerUitsnede(null)).toEqual({ zoom: 1, offsetX: 0, offsetY: 0, rotatie: 0 })
    expect(uitsnedeStijl(null)).toBeUndefined()
  })

  it('houdt onmogelijke waarden binnen de perken', () => {
    const u = normaliseerUitsnede({ zoom: 99, offsetX: -900, offsetY: 900, rotatie: 400 })
    expect(u.zoom).toBe(4)
    expect(u.offsetX).toBe(-50)
    expect(u.offsetY).toBe(50)
    expect(u.rotatie).toBe(180)
  })

  it('negeert rommel uit de database', () => {
    const u = normaliseerUitsnede({ zoom: Number.NaN, rotatie: Number.NaN } as never)
    expect(u).toEqual({ zoom: 1, offsetX: 0, offsetY: 0, rotatie: 0 })
  })

  it('draait om het midden, ná het verschuiven', () => {
    // Anders loopt het beeld weg zodra je aan de draaiknop komt — dat voelt kapot.
    const stijl = uitsnedeStijl({ zoom: 1.5, offsetX: 10, offsetY: -5, rotatie: 3 })
    expect(stijl?.transform).toBe('translate(10%, -5%) rotate(3deg) scale(1.5)')
    expect(stijl?.transformOrigin).toBe('center')
  })
})

describe('de balk past zich aan het aantal reclames aan', () => {
  it('staat stil bij niets of één reclame', () => {
    expect(balkOpstelling(0).loop).toBe(false)
    expect(balkOpstelling(1).loop).toBe(false)
    expect(balkOpstelling(1).duurSec).toBe(0)
  })

  it('plakt bij weinig reclames genoeg kopieën voor een naadloze lus', () => {
    // Twee tegels van 260 px vullen geen tv van 1920; zonder kopieën zie je het gat terugspringen.
    const weinig = balkOpstelling(2, 1920)
    expect(weinig.loop).toBe(true)
    expect(weinig.herhalingen * 2 * TEGEL_PX).toBeGreaterThanOrEqual(1920 * 2)
  })

  it('heeft bij veel reclames geen extra kopieën nodig', () => {
    expect(balkOpstelling(30, 1920).herhalingen).toBe(1)
  })

  it('laat elke reclame even snel passeren, hoeveel het er ook zijn', () => {
    // Dít is wat "rustig" leest: de snelheid is constant, niet de duur.
    for (const n of [2, 5, 12, 30]) {
      const o = balkOpstelling(n, 1920)
      const strook = n * TEGEL_PX * o.herhalingen
      expect(Math.abs(strook / o.duurSec - SNELHEID_PX_S)).toBeLessThan(SNELHEID_PX_S * 0.35)
    }
  })

  it('rekent ook met een smal scherm', () => {
    const smal = balkOpstelling(2, 600)
    expect(smal.herhalingen).toBeLessThanOrEqual(balkOpstelling(2, 1920).herhalingen)
  })
})

describe('de reclame die het scherm overneemt', () => {
  it('blijft een goede vijftien seconden staan', () => {
    expect(OVERLAY_MS).toBe(15_000)
  })

  it('schommelt rond de tien minuten in plaats van op de klok te staan', () => {
    // Altijd exact tien minuten wordt een patroon, en een patroon kijk je weg.
    expect(volgendeWachttijdMs(() => 0)).toBe(TUSSENTIJD_MS * (1 - SPREIDING))
    expect(volgendeWachttijdMs(() => 1)).toBe(TUSSENTIJD_MS * (1 + SPREIDING))
    expect(volgendeWachttijdMs(() => 0.5)).toBe(TUSSENTIJD_MS)
  })

  it('toont nooit twee keer na elkaar dezelfde', () => {
    const lijst = [{ id: 1 }, { id: 2 }, { id: 3 }]
    for (const r of [0, 0.4, 0.99]) {
      expect(kiesReclame(lijst, 2, () => r)?.id).not.toBe(2)
    }
  })

  it('herhaalt wél als er maar één is', () => {
    expect(kiesReclame([{ id: 7 }], 7, () => 0)?.id).toBe(7)
  })

  it('geeft niets terug zonder reclame', () => {
    expect(kiesReclame([], null, () => 0)).toBeNull()
  })

  it('blijft binnen de lijst, ook bij een toevalsbron die 1 teruggeeft', () => {
    const lijst = [{ id: 1 }, { id: 2 }]
    expect(kiesReclame(lijst, null, () => 1)).toBeTruthy()
  })
})
