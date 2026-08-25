import { describe, it, expect } from 'vitest'

import { pastBijZoekterm, zoekWoorden } from '@/lib/team-search'

// De namen hieronder komen uit de echte competitie: zo staan ze in de databank, en zo typen
// supporters ze in.
const SINT_MICHIELS = 'KBC St. Michiels B'
const BAASRODE = "'T Botterken Baasrode"
const KERELS = 'De Kerels Wachtebeke'

describe('zoekWoorden', () => {
  it('haalt leestekens en accenten weg en schrijft afkortingen uit', () => {
    expect(zoekWoorden(SINT_MICHIELS)).toEqual(['kbc', 'sint', 'michiels', 'b'])
    expect(zoekWoorden(BAASRODE)).toEqual(['t', 'botterken', 'baasrode'])
    expect(zoekWoorden('D&W Beveren')).toEqual(['d', 'w', 'beveren'])
  })

  it('geeft een lege lijst voor niets', () => {
    expect(zoekWoorden('')).toEqual([])
    expect(zoekWoorden('   ')).toEqual([])
    expect(zoekWoorden('...')).toEqual([])
  })
})

describe('pastBijZoekterm — zoals mensen typen', () => {
  it('vindt "Sint Michiels" in "KBC St. Michiels B"', () => {
    expect(pastBijZoekterm('Sint Michiels', SINT_MICHIELS)).toBe(true)
    expect(pastBijZoekterm('sint-michiels', SINT_MICHIELS)).toBe(true)
    expect(pastBijZoekterm('st michiels', SINT_MICHIELS)).toBe(true)
    expect(pastBijZoekterm('michiels', SINT_MICHIELS)).toBe(true)
    expect(pastBijZoekterm('kbc', SINT_MICHIELS)).toBe(true)
  })

  it('vindt "baasro" in "\'T Botterken Baasrode"', () => {
    expect(pastBijZoekterm('baasro', BAASRODE)).toBe(true)
    expect(pastBijZoekterm('botterke', BAASRODE)).toBe(true)
    expect(pastBijZoekterm('botterken baasrode', BAASRODE)).toBe(true)
  })

  it('trekt zich niets aan van de woordvolgorde', () => {
    expect(pastBijZoekterm('michiels sint', SINT_MICHIELS)).toBe(true)
    expect(pastBijZoekterm('baasrode botterken', BAASRODE)).toBe(true)
  })

  it('zoekt ook in de clubnaam en de reeks, niet enkel de ploegnaam', () => {
    expect(pastBijZoekterm('michiels', 'Ploeg B', 'KBC Sint-Michiels')).toBe(true)
    expect(pastBijZoekterm('nationale dames', 'Ploeg B', null, '1ste Nationale Dames')).toBe(true)
  })

  it('blijft streng genoeg om niet alles te matchen', () => {
    expect(pastBijZoekterm('sint', KERELS)).toBe(false)
    expect(pastBijZoekterm('michielsen', SINT_MICHIELS)).toBe(false) // langer dan het woord zelf
    expect(pastBijZoekterm('sint gent', SINT_MICHIELS)).toBe(false) // tweede woord past niet
    expect(pastBijZoekterm('beveren', BAASRODE)).toBe(false)
  })

  it('een lege zoekterm filtert niet', () => {
    expect(pastBijZoekterm('', SINT_MICHIELS)).toBe(true)
    expect(pastBijZoekterm('   ', SINT_MICHIELS)).toBe(true)
  })

  it('zonder velden om in te zoeken is er geen treffer', () => {
    expect(pastBijZoekterm('michiels', null, undefined, '')).toBe(false)
  })
})
