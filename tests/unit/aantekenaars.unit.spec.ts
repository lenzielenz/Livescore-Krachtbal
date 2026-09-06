import { describe, expect, it } from 'vitest'

import {
  MAX_AANTEKENAARS,
  MAX_NAAM,
  NAAMLOOS,
  aantekenaarTekst,
  boekAantekenaar,
  hoofdAantekenaar,
  sanitizeAantekenaars,
  sanitizeAfsluiter,
  veiligeNaam,
  type Aantekenaar,
} from '@/lib/aantekenaars'

// Het auditspoor onder een tornooiwedstrijd: wie tekende ze aan, wie sloot ze af. Deze regels
// bepalen wat er publiek onder een uitslag komt te staan, dus ze moeten kloppen én veilig zijn.

const maak = (v: Partial<Aantekenaar> & { id: number }): Aantekenaar => ({
  naam: 'Jan Peeters',
  rol: 'organisatie',
  eerste: 1000,
  laatste: 1000,
  acties: 1,
  ...v,
})

describe('veiligeNaam', () => {
  it('laat een gewone naam ongemoeid', () => {
    expect(veiligeNaam('Jan Peeters')).toBe('Jan Peeters')
    expect(veiligeNaam('  Rita Claes  ')).toBe('Rita Claes')
  })

  it('weigert een e-mailadres', () => {
    // De kern: dit veld is publiek, en het privacybeleid zegt dat adressen dat niet zijn. Meerdere
    // schrijfpaden in dit project vallen terug op user.email wanneer de naam leeg is.
    expect(veiligeNaam('jan@voorbeeld.be')).toBe(NAAMLOOS)
    expect(veiligeNaam('Jan <jan@voorbeeld.be>')).toBe(NAAMLOOS)
  })

  it('valt terug bij een leeg of onbruikbaar veld', () => {
    expect(veiligeNaam('')).toBe(NAAMLOOS)
    expect(veiligeNaam('   ')).toBe(NAAMLOOS)
    expect(veiligeNaam(null)).toBe(NAAMLOOS)
    expect(veiligeNaam(undefined)).toBe(NAAMLOOS)
    expect(veiligeNaam(42)).toBe(NAAMLOOS)
  })

  it('kapt een absurd lange naam af', () => {
    const lang = 'a'.repeat(300)
    const uit = veiligeNaam(lang)
    expect(uit.length).toBeLessThanOrEqual(80)
    expect(uit.endsWith('…')).toBe(true)
  })
})

describe('sanitizeAantekenaars', () => {
  it('leest een geldige lijst uit', () => {
    const uit = sanitizeAantekenaars([
      { id: 3, naam: 'Rita Claes', rol: 'supporter', eerste: 10, laatste: 90, acties: 4 },
    ])
    expect(uit).toEqual([{ id: 3, naam: 'Rita Claes', rol: 'supporter', eerste: 10, laatste: 90, acties: 4 }])
  })

  it('gooit rommel weg zonder de rest mee te slepen', () => {
    const uit = sanitizeAantekenaars([null, 'tekst', { id: 0 }, { id: -2 }, {}, { id: 7, naam: 'Jan' }])
    expect(uit).toHaveLength(1)
    expect(uit[0].id).toBe(7)
  })

  it('houdt maar één rij per persoon over', () => {
    const uit = sanitizeAantekenaars([{ id: 5, naam: 'Jan' }, { id: 5, naam: 'Jan opnieuw' }])
    expect(uit).toHaveLength(1)
    expect(uit[0].naam).toBe('Jan')
  })

  it('trekt een omgekeerde tijdsvolgorde recht', () => {
    const uit = sanitizeAantekenaars([{ id: 1, naam: 'Jan', eerste: 500, laatste: 100 }])
    expect(uit[0].laatste).toBe(500)
  })

  it('valt terug op de organisatierol bij een onbekende rol', () => {
    expect(sanitizeAantekenaars([{ id: 1, naam: 'Jan', rol: 'burgemeester' }])[0].rol).toBe('organisatie')
  })

  it('geeft een lege lijst terug bij een lege of foute kolom', () => {
    expect(sanitizeAantekenaars(null)).toEqual([])
    expect(sanitizeAantekenaars({})).toEqual([])
    expect(sanitizeAantekenaars('[]')).toEqual([])
  })

  it('houdt de lijst begrensd', () => {
    const veel = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, naam: `Persoon ${i}` }))
    expect(sanitizeAantekenaars(veel)).toHaveLength(MAX_AANTEKENAARS)
  })
})

describe('sanitizeAfsluiter', () => {
  it('leest wie afsloot', () => {
    expect(sanitizeAfsluiter({ id: 9, naam: 'Rita Claes', op: 500 })).toEqual({ id: 9, naam: 'Rita Claes', op: 500 })
  })

  it('geeft null bij niets of rommel', () => {
    expect(sanitizeAfsluiter(null)).toBeNull()
    expect(sanitizeAfsluiter({ naam: 'Jan' })).toBeNull()
    expect(sanitizeAfsluiter({ id: 0, naam: 'Jan' })).toBeNull()
  })

  it('houdt ook hier een adres uit het zicht', () => {
    expect(sanitizeAfsluiter({ id: 9, naam: 'rita@voorbeeld.be', op: 1 })?.naam).toBe(NAAMLOOS)
  })
})

describe('boekAantekenaar', () => {
  it('zet een nieuwe persoon op de lijst', () => {
    const uit = boekAantekenaar([], { id: 4, naam: 'Jan Peeters', rol: 'organisatie' }, 1234)
    expect(uit).toEqual([{ id: 4, naam: 'Jan Peeters', rol: 'organisatie', eerste: 1234, laatste: 1234, acties: 1 }])
  })

  it('telt op bij wie er al op staat en houdt het eerste moment vast', () => {
    const start = boekAantekenaar([], { id: 4, naam: 'Jan', rol: 'organisatie' }, 100)
    const uit = boekAantekenaar(start, { id: 4, naam: 'Jan', rol: 'organisatie' }, 900)
    expect(uit).toHaveLength(1)
    expect(uit[0]).toMatchObject({ acties: 2, eerste: 100, laatste: 900 })
  })

  it('neemt een hernoemd account over', () => {
    const start = boekAantekenaar([], { id: 4, naam: 'J. Peeters', rol: 'organisatie' }, 100)
    const uit = boekAantekenaar(start, { id: 4, naam: 'Jan Peeters', rol: 'organisatie' }, 200)
    expect(uit[0].naam).toBe('Jan Peeters')
  })

  it('raakt de lijst niet aan bij een onbruikbare id', () => {
    const start = [maak({ id: 1 })]
    expect(boekAantekenaar(start, { id: 0, naam: 'Jan', rol: 'organisatie' }, 1)).toBe(start)
    expect(boekAantekenaar(start, { id: NaN, naam: 'Jan', rol: 'organisatie' }, 1)).toBe(start)
  })

  it('laat de lijst niet eindeloos groeien', () => {
    let lijst: Aantekenaar[] = []
    for (let i = 1; i <= MAX_AANTEKENAARS + 5; i += 1) {
      lijst = boekAantekenaar(lijst, { id: i, naam: `Persoon ${i}`, rol: 'organisatie' }, i)
    }
    expect(lijst).toHaveLength(MAX_AANTEKENAARS)
    // Wie er als eerste bij was blijft staan — die zat effectief aan tafel.
    expect(lijst[0].id).toBe(1)
  })
})

describe('hoofdAantekenaar', () => {
  it('kiest wie het meest deed', () => {
    const lijst = [maak({ id: 1, naam: 'Jan', acties: 3 }), maak({ id: 2, naam: 'Rita', acties: 40 })]
    expect(hoofdAantekenaar(lijst)?.naam).toBe('Rita')
  })

  it('kiest bij gelijk aantal wie er het eerst aan begon', () => {
    const lijst = [
      maak({ id: 1, naam: 'Jan', acties: 5, eerste: 900 }),
      maak({ id: 2, naam: 'Rita', acties: 5, eerste: 100 }),
    ]
    expect(hoofdAantekenaar(lijst)?.naam).toBe('Rita')
  })

  it('geeft null bij een lege lijst', () => {
    expect(hoofdAantekenaar([])).toBeNull()
  })
})

describe('aantekenaarTekst', () => {
  it('noemt één aantekenaar', () => {
    expect(aantekenaarTekst([maak({ id: 1, naam: 'Jan Peeters' })])).toBe('Aangetekend door Jan Peeters')
  })

  it('noemt er twee bij naam', () => {
    const lijst = [maak({ id: 1, naam: 'Jan Peeters', acties: 9 }), maak({ id: 2, naam: 'Rita Claes' })]
    expect(aantekenaarTekst(lijst)).toBe('Aangetekend door Jan Peeters en Rita Claes')
  })

  it('telt er meer dan twee samen', () => {
    const lijst = [
      maak({ id: 1, naam: 'Jan', acties: 9 }),
      maak({ id: 2, naam: 'Rita' }),
      maak({ id: 3, naam: 'Bert' }),
      maak({ id: 4, naam: 'Els' }),
    ]
    expect(aantekenaarTekst(lijst)).toBe('Aangetekend door Jan en 3 anderen')
  })

  it('vermeldt wie afsloot wanneer dat iemand anders was', () => {
    const lijst = [maak({ id: 1, naam: 'Jan Peeters' })]
    expect(aantekenaarTekst(lijst, { id: 2, naam: 'Rita Claes', op: 10 })).toBe(
      'Aangetekend door Jan Peeters · afgesloten door Rita Claes',
    )
  })

  it('herhaalt dezelfde naam niet wanneer de aantekenaar zelf afsloot', () => {
    const lijst = [maak({ id: 1, naam: 'Jan Peeters' })]
    expect(aantekenaarTekst(lijst, { id: 1, naam: 'Jan Peeters', op: 10 })).toBe('Aangetekend door Jan Peeters')
  })

  it('zwijgt wanneer er niets bekend is', () => {
    expect(aantekenaarTekst([])).toBeNull()
    expect(aantekenaarTekst([], { id: 1, naam: 'Jan', op: 1 })).toBeNull()
  })
})

describe('veiligeNaam en Unicode', () => {
  it('knipt nooit midden in een emoji', () => {
    // Afkappen op UTF-16-eenheden liet een losse surrogate achter. Dat is geen geldige Unicode
    // meer, en Postgres weigert zo'n string in een jsonb-kolom — de aantekenactie strandde dan
    // op een naam. Gereproduceerd met een emoji net over de grens van 80 tekens.
    const naam = 'a'.repeat(78) + '😀' + 'b'.repeat(20)
    const uit = veiligeNaam(naam)
    const losseSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    expect(losseSurrogate.test(uit)).toBe(false)
    expect(JSON.stringify(uit)).not.toMatch(/\\ud[89ab]/i)
  })

  it('telt in lettertekens, niet in code units', () => {
    // 60 emoji's zijn 120 UTF-16-eenheden maar 60 lettertekens: die naam past gewoon.
    const emoji = '😀'.repeat(60)
    expect(veiligeNaam(emoji)).toBe(emoji)
  })

  it('kapt een te lange naam met emoji doorgaans wél af, en netjes', () => {
    const lang = '😀'.repeat(200)
    const uit = veiligeNaam(lang)
    expect([...uit].length).toBeLessThanOrEqual(MAX_NAAM)
    expect(uit.endsWith('…')).toBe(true)
  })
})
