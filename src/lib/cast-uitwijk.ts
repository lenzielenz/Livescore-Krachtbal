// Wat bied je aan wanneer casten hier niet kán?
//
// De Google Cast-knop werkt via `window.chrome.cast`, en die bestaat alleen in Chrome zélf. In een
// geïnstalleerde app (Android zet die in een eigen venster, los van de browser) is hij er niet, en
// op een iPhone bestaat Google Cast in geen enkele browser. De knop verdween daardoor precies
// wanneer iemand de app netjes geïnstalleerd had — je krijgt een betere app en verliest een knop.
//
// Verdwijnen is hier het slechtste antwoord: de kantine wil dat scherm op de tv, en er ís een weg.
// Alleen loopt die langs de browser. Op Android kunnen we die weg met één tik openen; elders
// blijft de link kopiëren over, want dat scherm heeft een vaste link die je ook op de tv zelf of
// op een laptop aan de tv kan openen.
//
// Bewust géén advies dat we niet kunnen waarmaken: er wordt niets beloofd over spiegelen vanuit
// Android's snelinstellingen — dat spiegelt je telefoon en dan sterft het scherm mee zodra je hem
// wegsteekt, terwijl deze weg de tv zijn eigen verbinding geeft.

export type Uitwijk = {
  titel: string
  uitleg: string
  /** Adres dat dit scherm in de browser opent, of null wanneer dat hier niet kan. */
  browserUrl: string | null
  /** Opschrift van die knop. */
  browserLabel: string | null
}

const isIOS = (ua: string) => /iphone|ipad|ipod/i.test(ua)
const isAndroid = (ua: string) => /android/i.test(ua)

/**
 * Een Android-intent dat dit adres in Chrome opent.
 *
 * Een gewone link helpt niet: die valt binnen het bereik van de app, dus Android opent hem in
 * dezelfde geïnstalleerde app — waar casten net niet kan. Een intent noemt Chrome bij naam.
 * `browser_fallback_url` vangt het geval waarin Chrome er niet is; dan opent de standaardbrowser
 * in plaats van dat er niets gebeurt.
 */
export function chromeIntent(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const zonderSchema = `${u.host}${u.pathname}${u.search}`
  const terug = encodeURIComponent(u.toString())
  return `intent://${zonderSchema}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${terug};end`
}

export function castUitwijk(opts: { ua: string; url: string }): Uitwijk {
  const { ua, url } = opts

  if (isIOS(ua)) {
    return {
      titel: 'Casten lukt niet vanaf een iPhone',
      uitleg:
        'Google Cast bestaat niet op iOS — ook niet in Safari of Chrome. Open deze link op een Android-toestel of een laptop, of tik ze rechtstreeks in op de tv: het scherm draait daarna op zichzelf.',
      browserUrl: null,
      browserLabel: null,
    }
  }

  if (isAndroid(ua)) {
    const intent = chromeIntent(url)
    return {
      titel: 'Casten gaat via Chrome',
      uitleg:
        'In de geïnstalleerde app laat Android de castknop niet toe. Open dit scherm één keer in Chrome en zet het daar op de tv — daarna draait de tv op zichzelf en mag je de app gewoon sluiten.',
      browserUrl: intent,
      browserLabel: intent ? '🌐 Open in Chrome' : null,
    }
  }

  return {
    titel: 'Casten gaat via de browser',
    uitleg:
      'Casten werkt in Chrome of Edge, niet in een geïnstalleerde app. Open dit scherm daar en zet het op de tv — daarna draait de tv op zichzelf.',
    browserUrl: null,
    browserLabel: null,
  }
}
