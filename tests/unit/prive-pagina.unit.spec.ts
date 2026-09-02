import { describe, it, expect } from 'vitest'

import { Users } from '@/collections/Users'
import { PRIVE_HEADER, SESSIE_COOKIE, heeftSessie } from '@/lib/prive-pagina'

// Welke pagina's de service worker níét mag bewaren.
//
// Aanleiding: "het kantinescherm is actief als je ingelogd hebt, maar als ik een update
// doorvoer word je afgemeld". Tijdens een uitrol is de server even weg; de service worker valt
// dan terug op een bewaarde kopie van de pagina, en als die van vóór het inloggen was, sta je
// plots als uitgelogd op het scherm terwijl je sessie gewoon nog geldig is.
//
// De worker kan de sessiecookie zelf niet lezen (httpOnly, en dat hoort zo), dus doet de server
// het: één kopje op het antwoord. Deze functie beslist wanneer dat kopje erop gaat, en de
// randgevallen zijn het hele punt.

describe('heeftSessie', () => {
  it('herkent de sessiecookie', () => {
    expect(heeftSessie(`${SESSIE_COOKIE}=abc.def.ghi`)).toBe(true)
  })

  it('vindt hem ook tussen andere cookies', () => {
    expect(heeftSessie(`kijkmodus=1; ${SESSIE_COOKIE}=abc; theme=dark`)).toBe(true)
    expect(heeftSessie(`theme=dark; ${SESSIE_COOKIE}=abc`)).toBe(true)
  })

  it('trapt niet in een cookie die er alleen maar op lijkt', () => {
    // `niet-payload-token` bevat de naam als deeltekst; op "bevat" testen zou elke bezoeker met
    // zo'n cookie als ingelogd bestempelen.
    expect(heeftSessie('niet-payload-token=abc')).toBe(false)
    expect(heeftSessie('payload-token-oud=abc')).toBe(false)
  })

  it('ziet een lege cookie als uitgelogd', () => {
    // Uitloggen wist de cookie door hem leeg te zetten; die staat dus nog even in de header.
    expect(heeftSessie(`${SESSIE_COOKIE}=`)).toBe(false)
    expect(heeftSessie(`${SESSIE_COOKIE}=   `)).toBe(false)
  })

  it('doet niets zonder cookies', () => {
    expect(heeftSessie(null)).toBe(false)
    expect(heeftSessie(undefined)).toBe(false)
    expect(heeftSessie('')).toBe(false)
  })

  it('gebruikt een kopje in kleine letters', () => {
    // De service worker leest hem met exact deze naam; HTTP-kopjes komen in de fetch-API altijd
    // in kleine letters binnen.
    expect(PRIVE_HEADER).toBe(PRIVE_HEADER.toLowerCase())
  })
})

// En de sessieduur zelf. Payload's standaard is twee uur; wie het kantinescherm 's middags
// klaarzet is tegen de tweede helft uitgelogd, en dat merk je pas bij de eerstvolgende
// herlading — bijvoorbeeld net na een update. Vandaar dat het leek alsof de uitrol uitlogde.
describe('sessieduur van de Users-collection', () => {
  it('houdt een sessie dagen lang geldig, niet twee uur', () => {
    const auth = Users.auth as { tokenExpiration?: number }
    expect(typeof auth).toBe('object')
    expect(auth.tokenExpiration).toBeGreaterThanOrEqual(60 * 60 * 24 * 7)
  })
})
