import { describe, expect, it } from 'vitest'

import { colorsToHex, colorWordToHex, matchClubColors, parseReeksenKleuren } from '@/lib/club-colors-import'

describe('parseReeksenKleuren', () => {
  it('haalt club-fragment + kleur(en) uit een PDF-regel', () => {
    const text = '1D&WKoekelare1NHZwart/Roodza18:002HOBeitem1NHRood/zwartzo11:30'
    const entries = parseReeksenKleuren(text)
    expect(entries).toEqual([
      { nameCode: 'D&WKoekelare1NH', colors: ['zwart', 'rood'] },
      { nameCode: 'HOBeitem1NH', colors: ['rood', 'zwart'] },
    ])
  })

  it('herkent een enkele (niet-samengestelde) kleur', () => {
    const entries = parseReeksenKleuren('10SportingBruggeREGHBBLAUWza20:00')
    expect(entries).toEqual([{ nameCode: 'SportingBruggeREGHB', colors: ['blauw'] }])
  })

  it('negeert tekst zonder herkende kleur vlak vóór dag/uur', () => {
    expect(parseReeksenKleuren('4KBCEdegemRRL5PJKaulilleARRLKampioen')).toEqual([])
  })
})

describe('colorWordToHex / colorsToHex', () => {
  it('kent een geldige hex toe aan een bekend kleurwoord', () => {
    expect(colorWordToHex('Zwart')).toMatch(/^#[0-9a-f]{6}$/)
    expect(colorWordToHex('onbestaand')).toBeNull()
  })

  it('bouwt primair + secundair uit twee kleurwoorden', () => {
    const hex = colorsToHex(['zwart', 'rood'])
    expect(hex).toEqual({ primary: colorWordToHex('zwart'), secondary: colorWordToHex('rood') })
  })

  it('valt terug op dezelfde kleur voor primair én secundair bij één kleurwoord', () => {
    const hex = colorsToHex(['blauw'])
    expect(hex).toEqual({ primary: colorWordToHex('blauw'), secondary: colorWordToHex('blauw') })
  })

  it('geeft null zonder herkenbare kleuren', () => {
    expect(colorsToHex([])).toBeNull()
  })
})

describe('matchClubColors', () => {
  it('koppelt een echte club aan zijn PDF-fragment via prefix-match', () => {
    const clubs = ['KBC Male', 'HO Beitem']
    const entries = parseReeksenKleuren('3KBCMale1NHblauw/geelza18:452HOBeitem1NHRood/zwartzo11:30')
    const matched = matchClubColors(clubs, entries)
    expect(matched.get('KBC Male')).toEqual(['blauw', 'geel'])
    expect(matched.get('HO Beitem')).toEqual(['rood', 'zwart'])
  })

  it('kiest de langste (specifiekste) clubnaam bij een gedeeld voorvoegsel', () => {
    const clubs = ['KBC St. Michiels', 'KBC St. Michiels A']
    const entries = parseReeksenKleuren('4KBCSt.MichielsA1NHRood/Grijsza14:15')
    const matched = matchClubColors(clubs, entries)
    expect(matched.get('KBC St. Michiels A')).toEqual(['rood', 'grijs'])
    expect(matched.has('KBC St. Michiels')).toBe(false)
  })

  it('valt terug op "ergens in" als de clubnaam niet vooraan het fragment staat', () => {
    // Een losstaande voetnoot zonder voorafgaand dag/uur-anker kan vóór de rij-index blijven
    // hangen, waardoor de clubnaam niet meer aan het begin van het fragment staat.
    const clubs = ['KB Moerdamme']
    const entries = parseReeksenKleuren('onvoldoendeinschrijvingen5KBMoerdammeREGHAblauw/witza20:00')
    const matched = matchClubColors(clubs, entries)
    expect(matched.get('KB Moerdamme')).toEqual(['blauw', 'wit'])
  })

  it('laat een onherkende club onaangeroerd (geen entry in de map)', () => {
    const matched = matchClubColors(['Onbekende Club'], parseReeksenKleuren('1D&WKoekelare1NHZwart/Roodza18:00'))
    expect(matched.has('Onbekende Club')).toBe(false)
  })
})
