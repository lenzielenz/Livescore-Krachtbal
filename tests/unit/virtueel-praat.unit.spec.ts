import { afterEach, describe, expect, it } from 'vitest'

import { maakKast, magGeven, MUNTEN_PER_BAL } from '@/lib/virtueel-fanshop'
import { gebeurtenissen, gebeurtenisTekst, isRoep, meldGebeurtenis, ONTHOUD, roepTekst, ROEPEN, vergeetPraat } from '@/lib/virtueel-praat'
import { valideerSpoor, vatSporenSamen, type Spoor } from '@/lib/virtueel-sporen'

describe('supporterspraat', () => {
  afterEach(() => vergeetPraat())

  it('kent enkel de vaste supportersberichten (geen vrije tekst)', () => {
    expect(ROEPEN.length).toBeGreaterThanOrEqual(10)
    expect(isRoep('allez')).toBe(true)
    expect(isRoep('wat ik maar wil typen')).toBe(false)
    expect(roepTekst('allez', 'KBC St. Michiels')).toBe('📣 Allez, allez, KBC St. Michiels!')
  })

  it('houdt per club een halve minuut bij wat er geroepen of gegeven werd', () => {
    meldGebeurtenis('1', { soort: 'roep', van: '7', vanNaam: 'An', roep: 'hallo' }, 1000)
    meldGebeurtenis('2', { soort: 'roep', van: '8', vanNaam: 'Bo', roep: 'ole' }, 1000)
    meldGebeurtenis('1', { soort: 'geschenk', van: '7', vanNaam: 'An', aan: '9', aanNaam: 'Cas', artikel: 'Vikinghelm' }, 2000)
    expect(gebeurtenissen('1', 2500).map((g) => g.soort)).toEqual(['roep', 'geschenk'])
    expect(gebeurtenissen('1', 1000 + ONTHOUD + 1).map((g) => g.soort)).toEqual(['geschenk'])
    expect(gebeurtenissen('2', 2500)).toHaveLength(1)
  })

  it('maakt er een leesbare regel van, voor jou en voor de anderen', () => {
    const g = meldGebeurtenis('1', { soort: 'geschenk', van: '7', vanNaam: 'An', aan: '9', aanNaam: 'Cas', artikel: 'Vikinghelm' }, 0)
    expect(gebeurtenisTekst(g, '9', 'KBC')).toBe('🎁 An geeft jou een cadeau: Vikinghelm')
    expect(gebeurtenisTekst(g, '7', 'KBC')).toBe('🎁 Jij gaf Cas een cadeau: Vikinghelm')
    const r = meldGebeurtenis('1', { soort: 'roep', van: '7', vanNaam: 'An', roep: 'outfit', aan: '9', aanNaam: 'Cas' }, 0)
    expect(gebeurtenisTekst(r, '9', 'KBC')).toBe('An (aan jou): 🧣 Mooie outfit!')
  })
})

describe('kledij geven aan een andere supporter', () => {
  const spoor = (id: number, soort: Spoor['soort'], waarde: Spoor['waarde'], auteur: number): Spoor => ({ id, soort, waarde, naam: `S${auteur}`, auteur, wanneer: `2026-10-15T10:00:${String(id).padStart(2, '0')}Z` })
  const vondsten = (auteur: number, n: number) => Array.from({ length: n }, (_, i) => spoor(i + 1, 'vondst', { nr: i }, auteur))

  it('wat je geeft, ben je kwijt (zonder je muntjes terug); wat je krijgt, kost niets', () => {
    const sporen = [...vondsten(1, 4), spoor(20, 'aankoop', { id: 'pet-viking' }, 1), spoor(21, 'geschenk', { id: 'pet-viking', aan: 2, aanNaam: 'Bo' }, 1)]
    const an = vatSporenSamen(sporen, 1).mij
    expect(an.gekocht).not.toContain('pet-viking')
    expect(an.munten).toBe(4 * MUNTEN_PER_BAL - 130)
    const bo = vatSporenSamen(sporen, 2).mij
    expect(bo.gekocht).toContain('pet-viking')
    expect(bo.munten).toBe(0)
  })

  it('wie het weggeeft en later opnieuw koopt, betaalt opnieuw en heeft het weer', () => {
    const k = maakKast(10, ['pet-viking', { geef: 'pet-viking' }, 'pet-viking'], [])
    expect(k.gekocht).toContain('pet-viking')
    expect(k.munten).toBe(10 * MUNTEN_PER_BAL - 260)
  })

  it('een gegeven stuk dat je nog droeg, valt terug op wat je voordien droeg', () => {
    const k = maakKast(10, ['pet-viking', { geef: 'pet-viking' }], [{ pet: 'pet-viking' }])
    expect(k.outfit.pet).toBe('pet-club')
  })

  it('geven mag enkel met wat je echt bezit, en niet met de gratis stukken', () => {
    const k = maakKast(10, ['pet-viking'], [])
    expect(magGeven(k, 'pet-viking')).toBeNull()
    expect(magGeven(k, 'pet-cowboy')).toMatch(/niet in je kast/)
    expect(magGeven(k, 'shirt-thuis')).toMatch(/iedereen/)
    expect(magGeven(maakKast(25, [], []), 'extra-bakman')).toMatch(/niet in je kast/)
  })

  it('een cadeau-spoor vraagt een bestaand artikel en een ontvanger', () => {
    expect(valideerSpoor('geschenk', { id: 'pet-viking', aan: 5 })).toMatchObject({ ok: true })
    expect(valideerSpoor('geschenk', { id: 'nep', aan: 5 })).toMatchObject({ ok: false })
    expect(valideerSpoor('geschenk', { id: 'pet-viking' })).toMatchObject({ ok: false })
  })
})
