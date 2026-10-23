// Waar de browser een clublogo vandaan haalt.
//
// De meeste clublogo's verwezen rechtstreeks naar de site van de federatie
// (www.krachtbal.be/images/logo_N.png). Die afbeeldingen verdwenen in oktober 2026 (404) en sindsdien
// toonde elke badge enkel nog initialen. We laten zulke externe logo's daarom via onze eigen route
// /api/clublogo lopen: die bewaart een kopie op het volume en valt terug op het webarchief als de
// bron weg is (zie lib/clublogo-cache.ts). Eigen uploads (/api/media/…) blijven ongewijzigd.
//
// Puur en zonder serverafhankelijkheden: wordt zowel in client-componenten als op de server gebruikt.

/** Hosts waarvan we logo's zelf bewaren. Bewust een korte vaste lijst: de route is geen open proxy. */
export const BEWAARDE_LOGO_HOSTS = ['www.krachtbal.be', 'krachtbal.be'] as const

/** Enkel afbeeldingsbestanden in de beeldmappen van die site. */
const PAD = /^\/(?:images|news_images)\/[\w.-]+\.(?:png|gif|jpe?g|webp|svg)$/i

/** Mag deze (absolute) URL via /api/clublogo bewaard en geserveerd worden? */
export function isBewaardLogo(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (u.username || u.password || u.port) return false
    if (!(BEWAARDE_LOGO_HOSTS as readonly string[]).includes(u.hostname.toLowerCase())) return false
    return PAD.test(u.pathname) && !u.search
  } catch {
    return false
  }
}

/** De URL die een <img> moet gebruiken voor dit logo. Null en lege waarden blijven null. */
export function logoBron(url: string | null | undefined): string | null {
  if (!url) return null
  const schoon = url.trim()
  if (!schoon) return null
  if (!isBewaardLogo(schoon)) return schoon
  // Altijd https naar de bron: zo is de cachesleutel voor http- en https-varianten dezelfde.
  const u = new URL(schoon)
  u.protocol = 'https:'
  return `/api/clublogo?u=${encodeURIComponent(u.href)}`
}
