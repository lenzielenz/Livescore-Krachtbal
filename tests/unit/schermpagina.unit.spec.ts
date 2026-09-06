import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { isSchermPagina } from '@/lib/prive-pagina'

// Een kantine- of tornooischerm is een tv aan de muur: openbaar, en niemand loopt er tijdens een
// wedstrijd naartoe om iets op te lossen.
//
// Robin, 2026-09-06: "ik wil dat de link van het kantinescherm actief blijft, zelfs nadat ik een
// nieuwe merge heb doorgevoerd." Dat ging mis omdat de tv ingelogd was (je stelt je scherm
// ingelogd in): de pagina kreeg het privé-kopje, de service worker bewaarde ze niet, en tijdens
// een uitrol — de server is dan een halve minuut weg — kreeg de tv de offline-pagina te zien.

const SCHERMEN = [
  '/kantine/scherm',
  '/kantine/scherm/12',
  '/kantine/club/7',
  '/tornooi/44/kantine',
  '/tornooi/44/kantine/',
  '/tornooi/groep/west-vlaanderen/kantine',
  '/cast-tv',
]

const PERSOONLIJK = [
  '/kantine', // de kiespagina: toont jouw eigen keuze
  '/kantine/scherme', // lijkt erop, is het niet
  '/profiel',
  '/scorekeeper/12',
  '/tornooi/44',
  '/tornooi/44/kantineklaar',
  '/hub',
  '/',
]

describe('isSchermPagina', () => {
  it('herkent de tv-schermen', () => {
    for (const pad of SCHERMEN) expect(isSchermPagina(pad), pad).toBe(true)
  })

  it('laat alles wat persoonlijk kan zijn met rust', () => {
    // Cruciaal: een pagina die per bezoeker verschilt en hier tóch doorglipt, wordt bewaard en
    // straks aan iemand anders getoond.
    for (const pad of PERSOONLIJK) expect(isSchermPagina(pad), pad).toBe(false)
  })
})

describe('de service worker hanteert dezelfde lijst', () => {
  // sw.js is gewone JS in public/ en kan niet importeren. De functie staat er dus twee keer —
  // deze test bewaakt dat ze niet uit elkaar lopen, want dat zou je pas merken wanneer een tv
  // tijdens een uitrol zwart blijft.
  const bron = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

  it('bevat de functie', () => {
    expect(bron).toMatch(/function isSchermPagina\(pathname\)/)
  })

  it('geeft op elk pad hetzelfde antwoord als de server', () => {
    const match = bron.match(/function isSchermPagina\(pathname\) \{[\s\S]*?\n\}/)
    expect(match, 'isSchermPagina niet gevonden in public/sw.js').toBeTruthy()
    const swVersie = new Function(`${match?.[0]}; return isSchermPagina`)() as (p: string) => boolean
    for (const pad of [...SCHERMEN, ...PERSOONLIJK]) {
      expect(swVersie(pad), pad).toBe(isSchermPagina(pad))
    }
  })

  it('heeft een opgehoogde cache-versie zodat oude kopieën verdwijnen', () => {
    // Zonder ophoging houdt een tv die al draaide zijn oude worker én zijn oude beslissing.
    expect(bron).toMatch(/const CACHE = 'kb-cache-v5'/)
  })
})
