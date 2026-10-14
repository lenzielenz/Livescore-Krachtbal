import { describe, expect, it } from 'vitest'

import { fotografen, fotoKaders, toeval, type GalerijFoto, type GalerijWedstrijd } from '@/lib/virtueel-fotos'

// De fotogalerij in de gangen van Virtueel krachtbal.
const wedstrijden = new Map<number, GalerijWedstrijd>([
  [1, { label: 'KBC St. Michiels A – KRB Jabbeke', datum: '2026-10-11T12:00:00.000Z' }],
  [2, { label: 'KBK Ichtegem – KBC St. Michiels A', datum: '2026-10-04T12:00:00.000Z' }],
])
const foto = (id: number, matchId: number, auteur = `Fan${id} X`): GalerijFoto => ({ id, url: `/f/${id}.jpg`, auteur, matchId })
const veel = Array.from({ length: 30 }, (_, i) => foto(i + 1, (i % 2) + 1))

describe('fotoKaders', () => {
  it('is voorspelbaar per zaad en anders met een ander zaad', () => {
    const a = fotoKaders(veel, wedstrijden, { zaad: 42 })
    expect(fotoKaders(veel, wedstrijden, { zaad: 42 })).toEqual(a)
    expect(fotoKaders(veel, wedstrijden, { zaad: 43 })).not.toEqual(a)
  })

  it('1 tot 4 foto’s per kader, max. kaders, elke foto hoogstens één keer', () => {
    const k = fotoKaders(veel, wedstrijden, { zaad: 7, maxKaders: 6 })
    expect(k.length).toBeLessThanOrEqual(6)
    for (const kader of k) expect(kader.fotos.length).toBeGreaterThanOrEqual(1)
    for (const kader of k) expect(kader.fotos.length).toBeLessThanOrEqual(4)
    const urls = k.flatMap((x) => x.fotos.map((f) => f.url))
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('met weinig foto’s: één per kader', () => {
    const k = fotoKaders([foto(1, 1), foto(2, 2), foto(3, 1)], wedstrijden, { zaad: 1, maxKaders: 8 })
    expect(k.map((x) => x.fotos.length)).toEqual([1, 1, 1])
  })

  it('onderschrift: de wedstrijd en de datum, of het aantal wedstrijden', () => {
    const een = fotoKaders([foto(1, 1, 'Lotte Vermeersch')], wedstrijden, { zaad: 1 })[0]
    expect(een.titel).toBe('KBC St. Michiels A – KRB Jabbeke')
    expect(een.sub).toBe('11 oktober · foto van Lotte')
    // Een kader met foto's van beide wedstrijden heet "2 wedstrijden".
    const gemengd = [1, 2, 3, 4, 5, 6, 7, 8]
      .flatMap((zaad) => fotoKaders(veel, wedstrijden, { zaad }))
      .find((k) => new Set(k.fotos.map((f) => Number(f.url.match(/\d+/)![0]) % 2)).size > 1)
    expect(gemengd?.titel).toBe('2 wedstrijden')
  })

  it('negeert foto’s zonder url of van een onbekende wedstrijd', () => {
    expect(fotoKaders([{ ...foto(1, 1), url: '' }, foto(2, 99)], wedstrijden, { zaad: 1 })).toEqual([])
  })
})

describe('fotografen', () => {
  it('voornamen zonder dubbels', () => {
    expect(fotografen([])).toBe('supporters')
    expect(fotografen(['Lotte V.', 'Lotte V.'])).toBe('Lotte')
    expect(fotografen(['Lotte V.', 'Jan D.'])).toBe('Lotte en Jan')
    expect(fotografen(['A', 'B', 'C'])).toBe('A, B en C')
    expect(fotografen(['A', 'B', 'C', 'D'])).toBe('A, B en 2 anderen')
  })
})

describe('toeval', () => {
  it('geeft getallen in [0, 1)', () => {
    const r = toeval(5)
    for (let i = 0; i < 100; i++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})
