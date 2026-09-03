import { describe, expect, it } from 'vitest'

import { castUitwijk, chromeIntent } from '@/lib/cast-uitwijk'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const URL_KANTINE = 'https://livescore.roodgries.be/kantine/scherm'

// Wat we aanbieden wanneer casten hier niet kan. De aanleiding: wie de app netjes installeerde,
// zag de castknop verdwijnen — Android laat `chrome.cast` niet toe in een geïnstalleerde app.
// Niets tonen is dan het slechtste antwoord, want de kantine wil dat scherm nog steeds op de tv.
describe('chromeIntent', () => {
  it('noemt Chrome bij naam en houdt host en pad intact', () => {
    const i = chromeIntent(URL_KANTINE)!
    expect(i.startsWith('intent://livescore.roodgries.be/kantine/scherm#Intent;')).toBe(true)
    expect(i).toContain('scheme=https')
    expect(i).toContain('package=com.android.chrome')
    expect(i.endsWith(';end')).toBe(true)
  })

  it('neemt een terugvaladres mee, zodat er iets gebeurt zonder Chrome', () => {
    const i = chromeIntent(URL_KANTINE)!
    expect(i).toContain(`S.browser_fallback_url=${encodeURIComponent(URL_KANTINE)}`)
  })

  it('houdt de queryreeks mee', () => {
    const i = chromeIntent('https://voorbeeld.be/kantine/club/7?vol=1')!
    expect(i).toContain('intent://voorbeeld.be/kantine/club/7?vol=1#Intent;')
  })

  it('weigert wat geen webadres is', () => {
    // Zonder deze controle zou een rare `location` een intent opleveren dat naar iets anders dan
    // een webpagina wijst — een intent is een opdracht aan het toestel, geen link.
    expect(chromeIntent('javascript:alert(1)')).toBeNull()
    expect(chromeIntent('file:///etc/passwd')).toBeNull()
    expect(chromeIntent('geen adres')).toBeNull()
  })
})

describe('castUitwijk', () => {
  it('biedt op Android één tik naar Chrome', () => {
    const u = castUitwijk({ ua: ANDROID, url: URL_KANTINE })
    expect(u.browserUrl).toContain('package=com.android.chrome')
    expect(u.browserLabel).toBeTruthy()
    expect(u.uitleg).toContain('Chrome')
  })

  it('belooft op een iPhone niets wat niet kan', () => {
    // Google Cast bestaat op iOS in geen enkele browser; een "open in Chrome"-knop zou daar
    // gewoon dezelfde doodlopende straat openen.
    const u = castUitwijk({ ua: IPHONE, url: URL_KANTINE })
    expect(u.browserUrl).toBeNull()
    expect(u.browserLabel).toBeNull()
    expect(u.uitleg).toMatch(/Android|laptop|tv/i)
  })

  it('verwijst elders naar de browser', () => {
    const u = castUitwijk({ ua: DESKTOP, url: URL_KANTINE })
    expect(u.browserUrl).toBeNull()
    expect(u.titel).toMatch(/browser/i)
  })

  it('geeft altijd een titel en uitleg om te tonen', () => {
    for (const ua of [ANDROID, IPHONE, DESKTOP, '']) {
      const u = castUitwijk({ ua, url: URL_KANTINE })
      expect(u.titel.length).toBeGreaterThan(0)
      expect(u.uitleg.length).toBeGreaterThan(0)
    }
  })
})
