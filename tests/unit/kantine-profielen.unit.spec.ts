import { describe, expect, it } from 'vitest'

import {
  EERSTE_PROFIELNAAM,
  MAX_PROFIELEN,
  MAX_PROFIELNAAM,
  bewaarVorm,
  kiesProfiel,
  nieuwProfiel,
  nieuwProfielId,
  sanitizeProfielen,
  veiligeProfielnaam,
} from '@/lib/kantine-profielen'

// Meerdere kantineschermen per gebruiker. Het gevoeligste stuk is het lezen: er hangt letterlijk
// een tv aan een link, dus wat er al stond mag nooit verdwijnen en rommel mag het scherm nooit
// wit maken.

describe('sanitizeProfielen', () => {
  it('leest de nieuwe vorm', () => {
    const uit = sanitizeProfielen({
      profielen: [{ id: 'kantine', naam: 'Kantine', clubIds: [1], teamIds: [2, 3], matchIds: [] }],
    })
    expect(uit).toEqual([{ id: 'kantine', naam: 'Kantine', clubIds: [1], teamIds: [2, 3], matchIds: [] }])
  })

  it('zet een oude, naamloze keuze om naar één profiel', () => {
    // Cruciaal: er hangt al een tv aan /kantine/scherm/<id>. Die mag niet leeg lopen.
    const uit = sanitizeProfielen({ clubIds: [7], teamIds: [], matchIds: [9] })
    expect(uit).toHaveLength(1)
    expect(uit[0]).toMatchObject({ naam: EERSTE_PROFIELNAAM, clubIds: [7], matchIds: [9] })
    expect(uit[0].id).toBeTruthy()
  })

  it('geeft een lege lijst bij niets, rommel of een lege oude keuze', () => {
    expect(sanitizeProfielen(null)).toEqual([])
    expect(sanitizeProfielen('tekst')).toEqual([])
    expect(sanitizeProfielen({})).toEqual([])
    expect(sanitizeProfielen({ clubIds: [], teamIds: [], matchIds: [] })).toEqual([])
  })

  it('gooit onbruikbare rijen weg zonder de rest mee te slepen', () => {
    const uit = sanitizeProfielen({ profielen: [null, 'tekst', { naam: 'Zaal' }, 42] })
    expect(uit).toHaveLength(1)
    expect(uit[0].naam).toBe('Zaal')
  })

  it('houdt één profiel per id over', () => {
    const uit = sanitizeProfielen({
      profielen: [
        { id: 'zaal', naam: 'Zaal', clubIds: [1] },
        { id: 'zaal', naam: 'Zaal opnieuw', clubIds: [2] },
      ],
    })
    expect(uit).toHaveLength(1)
    expect(uit[0].clubIds).toEqual([1])
  })

  it('verzint een id wanneer er geen bruikbare staat', () => {
    const uit = sanitizeProfielen({ profielen: [{ naam: 'Jeugdterrein B', clubIds: [1] }] })
    expect(uit[0].id).toMatch(/^[a-z0-9-]+$/)
  })

  it('houdt de lijst begrensd', () => {
    const veel = Array.from({ length: 30 }, (_, i) => ({ naam: `Scherm ${i}`, clubIds: [1] }))
    expect(sanitizeProfielen({ profielen: veel })).toHaveLength(MAX_PROFIELEN)
  })
})

describe('veiligeProfielnaam', () => {
  it('laat een gewone naam staan en trekt witruimte glad', () => {
    expect(veiligeProfielnaam('  Kantine   boven ')).toBe('Kantine boven')
  })

  it('valt terug bij leeg of onbruikbaar', () => {
    expect(veiligeProfielnaam('')).toBe(EERSTE_PROFIELNAAM)
    expect(veiligeProfielnaam('   ')).toBe(EERSTE_PROFIELNAAM)
    expect(veiligeProfielnaam(null)).toBe(EERSTE_PROFIELNAAM)
    expect(veiligeProfielnaam(42, 'Terugval')).toBe('Terugval')
  })

  it('kapt af zonder een emoji doormidden te knippen', () => {
    const naam = 'a'.repeat(MAX_PROFIELNAAM - 2) + '😀' + 'b'.repeat(10)
    const uit = veiligeProfielnaam(naam)
    expect([...uit].length).toBeLessThanOrEqual(MAX_PROFIELNAAM)
    const losseSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    expect(losseSurrogate.test(uit)).toBe(false)
  })
})

describe('nieuwProfielId', () => {
  it('maakt een leesbare slug', () => {
    expect(nieuwProfielId([], 'Kantine boven')).toBe('kantine-boven')
    expect(nieuwProfielId([], 'Jeugd — terrein 2')).toBe('jeugd-terrein-2')
  })

  it('wijkt uit wanneer de slug al bestaat', () => {
    expect(nieuwProfielId([{ id: 'kantine' }], 'Kantine')).toBe('kantine-2')
    expect(nieuwProfielId([{ id: 'kantine' }, { id: 'kantine-2' }], 'Kantine')).toBe('kantine-3')
  })

  it('valt terug op iets bruikbaars bij een naam zonder letters', () => {
    expect(nieuwProfielId([], '🎉🎉')).toBe('scherm')
  })
})

describe('kiesProfiel', () => {
  const lijst = [
    { id: 'a', naam: 'A', clubIds: [], teamIds: [], matchIds: [] },
    { id: 'b', naam: 'B', clubIds: [], teamIds: [], matchIds: [] },
  ]

  it('kiest op id', () => {
    expect(kiesProfiel(lijst, 'b')?.naam).toBe('B')
  })

  it('valt terug op het eerste bij een onbekend of ontbrekend id', () => {
    // Een tv die op een oude link staat mag niet plots leeg lopen na een hernoeming.
    expect(kiesProfiel(lijst, 'weg')?.naam).toBe('A')
    expect(kiesProfiel(lijst)?.naam).toBe('A')
  })

  it('geeft null bij een lege lijst', () => {
    expect(kiesProfiel([], 'a')).toBeNull()
  })
})

describe('nieuwProfiel', () => {
  it('geeft een leeg profiel met een unieke naam', () => {
    const een = nieuwProfiel([])
    expect(een.naam).toBe(EERSTE_PROFIELNAAM)
    expect(een).toMatchObject({ clubIds: [], teamIds: [], matchIds: [] })

    const twee = nieuwProfiel([een])
    expect(twee.naam).toBe(`${EERSTE_PROFIELNAAM} 2`)
    expect(twee.id).not.toBe(een.id)
  })
})

describe('bewaarVorm', () => {
  it('schrijft altijd de nieuwe vorm weg, ook bij één profiel', () => {
    const p = [{ id: 'a', naam: 'A', clubIds: [1], teamIds: [], matchIds: [] }]
    expect(bewaarVorm(p)).toEqual({ profielen: p })
  })

  it('knipt af op het maximum', () => {
    const veel = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      naam: `S${i}`,
      clubIds: [],
      teamIds: [],
      matchIds: [],
    }))
    expect(bewaarVorm(veel).profielen).toHaveLength(MAX_PROFIELEN)
  })
})

describe('heen en weer', () => {
  it('overleeft een rondje opslaan en teruglezen', () => {
    const p = [
      { id: 'kantine', naam: 'Kantine', clubIds: [1, 2], teamIds: [3], matchIds: [] },
      { id: 'jeugd', naam: 'Jeugdterrein', clubIds: [], teamIds: [9], matchIds: [11] },
    ]
    expect(sanitizeProfielen(bewaarVorm(p))).toEqual(p)
  })
})
