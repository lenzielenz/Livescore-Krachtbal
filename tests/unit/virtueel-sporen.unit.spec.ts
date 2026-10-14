import { describe, expect, it } from 'vitest'

import { GOUDEN_BALLEN, valideerSpoor, vatSporenSamen, waterKleur, type Spoor } from '@/lib/virtueel-sporen'

// Sporen in het virtuele stadion: wat bezoekers achterlaten, en wat daaruit afgeleid wordt.

let teller = 0
const spoor = (soort: Spoor['soort'], waarde: Spoor['waarde'], naam = 'Lotte', auteur: number | null = 1): Spoor => ({ id: ++teller, soort, waarde, naam, auteur, wanneer: '' })

describe('valideerSpoor', () => {
  it('aanvaardt een eendje in het bad en rondt af', () => {
    const r = valideerSpoor('eend', { u: 0.123456, v: 0.5, kleur: '#facc15' })
    expect(r).toEqual({ ok: true, soort: 'eend', waarde: { u: 0.123, v: 0.5, kleur: '#facc15' } })
  })

  it('weigert onzin: onbekende soort, kleur, te veel meters, een zetel die niet bestaat', () => {
    expect(valideerSpoor('raket', {}).ok).toBe(false)
    expect(valideerSpoor('eend', { u: 2, v: 0.5, kleur: '#facc15' }).ok).toBe(false)
    expect(valideerSpoor('verf', { kleur: '#123456' }).ok).toBe(false)
    expect(valideerSpoor('loopband', { meter: 5000 }).ok).toBe(false)
    expect(valideerSpoor('zetel', { nr: 999 }).ok).toBe(false)
    expect(valideerSpoor('doelworp', { score: 1.5 }).ok).toBe(false)
    expect(valideerSpoor('bord', { id: 'dak', tactiek: {} }).ok).toBe(false)
  })

  it('schoont een tactiekbord op tot een geldige opstelling', () => {
    const r = valideerSpoor('bord', { id: 'kelder', tactiek: { magneten: [{ id: 'w1', x: 0.2, y: 0.3 }], lijnen: [{ kleur: 'paars', p: [0, 0, 1, 1] }] } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const t = (r.waarde as { tactiek: { magneten: { id: string; x: number }[]; lijnen: unknown[] } }).tactiek
      expect(t.magneten.find((m) => m.id === 'w1')?.x).toBe(0.2)
      expect(t.lijnen).toHaveLength(0)
    }
  })
})

describe('vatSporenSamen', () => {
  it('telt popcorn en meters op, met een top van lopers en de laatste naam op elke zetel', () => {
    const s = vatSporenSamen(
      [
        spoor('popcorn', {}, 'Jan'),
        spoor('popcorn', {}, 'Lotte'),
        spoor('loopband', { meter: 120 }, 'Jan'),
        spoor('loopband', { meter: 80 }, 'Lotte'),
        spoor('loopband', { meter: 60 }, 'Lotte'),
        spoor('zetel', { nr: 3 }, 'Jan'),
        spoor('zetel', { nr: 3 }, 'Lotte'),
      ],
      null,
    )
    expect(s.popcorn).toEqual({ totaal: 2, laatste: 'Lotte' })
    expect(s.loopband.meter).toBe(260)
    expect(s.loopband.top[0]).toEqual({ naam: 'Lotte', meter: 140 })
    expect(s.zetels[3]).toBe('Lotte')
  })

  it('houdt per speler de beste doelworp-score bij, hoogste eerst', () => {
    const s = vatSporenSamen([spoor('doelworp', { score: 7 }, 'Jan'), spoor('doelworp', { score: 12 }, 'Lotte'), spoor('doelworp', { score: 9 }, 'Jan')], null)
    expect(s.doelworp).toEqual([
      { naam: 'Lotte', score: 12 },
      { naam: 'Jan', score: 9 },
    ])
  })

  it('kent je eigen gouden ballen, en wie ze allemaal vond wordt kampioen', () => {
    const alle = Array.from({ length: GOUDEN_BALLEN }, (_, nr) => spoor('vondst', { nr }, 'Jan', 2))
    const s = vatSporenSamen([spoor('vondst', { nr: 4 }, 'Lotte', 1), ...alle, spoor('vondst', { nr: 4 }, 'Jan', 2)], 1)
    expect(s.vondsten.mijn).toEqual([4])
    expect(s.vondsten.kampioenen).toEqual(['Jan'])
  })

  it('mengt het water uit de laatste verfkleuren', () => {
    expect(waterKleur([])).toBe('#38bdf8')
    expect(waterKleur(['#ff0000'])).toBe('#ff0000')
    // Twee kleuren: de laatste weegt dubbel.
    expect(waterKleur(['#000000', '#ffffff'])).toBe('#aaaaaa')
  })
})
