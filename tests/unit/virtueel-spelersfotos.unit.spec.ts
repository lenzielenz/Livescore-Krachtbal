import { describe, expect, it } from 'vitest'

import { naamSleutel, spelersfoto } from '@/lib/virtueel-spelersfotos'

describe('spelersfoto', () => {
  it('vindt de foto ongeacht volgorde, hoofdletters of accenten', () => {
    expect(spelersfoto('Hannes Timmerman')).toBe('/virtueel/spelers/hannes-timmerman.jpg')
    expect(spelersfoto('TIMMERMAN Hannes')).toBe('/virtueel/spelers/hannes-timmerman.jpg')
    expect(spelersfoto('Natalie  Liëvens')).toBe('/virtueel/spelers/natalie-lievens.jpg')
    expect(spelersfoto('Devooght, Jason')).toBe('/virtueel/spelers/jason-devooght.jpg')
  })

  it('vindt de foto ook met een los tussenvoegsel (zoals in het archief)', () => {
    expect(spelersfoto('Jason De Vooght')).toBe('/virtueel/spelers/jason-devooght.jpg')
    expect(spelersfoto('De Vooght Jason')).toBe('/virtueel/spelers/jason-devooght.jpg')
    expect(naamSleutel('Pieter Van den Berghe')).toBe(naamSleutel('Vandenberghe Pieter'))
  })

  it('geeft null voor wie (nog) geen foto heeft', () => {
    expect(spelersfoto('Jan Janssens')).toBeNull()
    expect(naamSleutel('  ')).toBe('')
  })
})
