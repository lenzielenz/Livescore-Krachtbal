import { describe, it, expect } from 'vitest'

import { FIELD } from '@/lib/field'
import { leesMaat, leesVeldmaten } from '@/lib/veldmaten-invoer'

// De terreinmaten die een coach in de app invult (POST /api/match/[id]/veldmaten). Grenzen
// identiek aan de Matches-collectie: wat de admin weigert, mag de app niet aannemen — anders
// staat er een invulveld waarvan de server het resultaat daarna afkeurt.

describe('leesMaat', () => {
  it('neemt een geldige maat over, afgerond op centimeters', () => {
    expect(leesMaat(12, 'veldBreedte')).toEqual({ ok: true, value: 12 })
    expect(leesMaat(12.345, 'veldBreedte')).toEqual({ ok: true, value: 12.35 })
  })

  it('aanvaardt een komma als decimaalteken (zo typt een Vlaming het)', () => {
    expect(leesMaat('13,5', 'veldBreedte')).toEqual({ ok: true, value: 13.5 })
  })

  it('leest leeg als "terug naar reglementair"', () => {
    expect(leesMaat(null, 'veldSpeelveld')).toEqual({ ok: true, value: null })
    expect(leesMaat('', 'veldSpeelveld')).toEqual({ ok: true, value: null })
  })

  it('weigert onzin en waarden buiten de grenzen, met een leesbare reden', () => {
    const tekst = leesMaat('twaalf', 'veldBreedte')
    expect(tekst.ok).toBe(false)
    expect(!tekst.ok && tekst.error).toMatch(/getal/i)

    const smal = leesMaat(2, 'veldBreedte')
    expect(smal.ok).toBe(false)
    expect(!smal.ok && smal.error).toMatch(/tussen 6 en 20/)

    const lang = leesMaat(99, 'veldSpeelveld')
    expect(lang.ok).toBe(false)
    expect(!lang.ok && lang.error).toMatch(/tussen 10 en 30/)

    const diep = leesMaat(40, 'goalAreaDepth')
    expect(diep.ok).toBe(false)
    expect(!diep.ok && diep.error).toMatch(/doelgebied/i)
  })
})

describe('leesVeldmaten', () => {
  it('neemt alleen de meegestuurde velden over', () => {
    expect(leesVeldmaten({ veldBreedte: 12 })).toEqual({ ok: true, data: { veldBreedte: 12 } })
    expect(leesVeldmaten({ veldBreedte: 12, veldSpeelveld: 20, goalAreaDepth: 8 })).toEqual({
      ok: true,
      data: { veldBreedte: 12, veldSpeelveld: 20, goalAreaDepth: 8 },
    })
  })

  it('maakt breedte en speelveld leeg, maar zet de diepte terug op reglementair', () => {
    // goalAreaDepth is verplicht op de wedstrijd: leeg betekent daar de standaardwaarde.
    expect(leesVeldmaten({ veldBreedte: null, veldSpeelveld: null, goalAreaDepth: null })).toEqual({
      ok: true,
      data: { veldBreedte: null, veldSpeelveld: null, goalAreaDepth: FIELD.defaultGoalAreaDepthM },
    })
  })

  it('weigert een lege body en geeft de eerste foute maat terug', () => {
    const leeg = leesVeldmaten({})
    expect(leeg.ok).toBe(false)
    expect(!leeg.ok && leeg.error).toMatch(/minstens één maat/i)

    const fout = leesVeldmaten({ veldBreedte: 12, veldSpeelveld: 99 })
    expect(fout.ok).toBe(false)
    expect(!fout.ok && fout.error).toMatch(/speelveld/i)
  })

  it('negeert velden die niet over de terreinmaten gaan', () => {
    expect(leesVeldmaten({ veldBreedte: 12, status: 'finished', homeTeam: 3 })).toEqual({
      ok: true,
      data: { veldBreedte: 12 },
    })
  })
})
