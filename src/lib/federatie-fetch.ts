// De federatiepagina ophalen. Bewust server-side: de browser mag krachtbal.be niet uitlezen
// (geen CORS), en zo hoeft niemand een bestand te downloaden en te plakken.

/** Standaardadres; overschrijfbaar via de omgeving of per oproep. */
export const FEDERATIE_URL_DEFAULT = 'https://www.krachtbal.be/kalender.php'

/** Enkel de federatiesite mag opgehaald worden — dit endpoint is geen open proxy. */
export function isToegelatenBron(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    return host === 'krachtbal.be' || host.endsWith('.krachtbal.be')
  } catch {
    return false
  }
}

export interface FetchResultaat {
  html: string
  status: number
  url: string
}

/**
 * Haalt de pagina op. De federatiesite is een oude PHP-site: die kan traag zijn en levert soms
 * latin-1 in plaats van UTF-8. Daarom een ruime timeout en een expliciete decodering op basis van
 * de meegegeven charset — anders komt "Sint-Michiels" als "Sint-Michiels" binnen en matcht geen
 * enkele ploegnaam.
 */
export async function haalFederatiePagina(url: string, timeoutMs = 20_000): Promise<FetchResultaat> {
  if (!isToegelatenBron(url)) throw new Error('Enkel adressen op krachtbal.be zijn toegelaten.')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Een gewone browser-identificatie; sommige sites weigeren een lege user-agent.
        'User-Agent': 'Mozilla/5.0 (compatible; KrachtbalLive/1.0; +https://krachtbal.be)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'nl-BE,nl;q=0.9',
      },
      cache: 'no-store',
    })
    const buf = new Uint8Array(await res.arrayBuffer())
    const type = res.headers.get('content-type') ?? ''
    const html = decodeer(buf, type)
    return { html, status: res.status, url: res.url || url }
  } finally {
    clearTimeout(timer)
  }
}

/** Kiest de tekencodering: uit de content-type-header, anders uit een <meta charset> in de pagina. */
function decodeer(buf: Uint8Array, contentType: string): string {
  const uitHeader = /charset=([\w-]+)/i.exec(contentType)?.[1]
  const ruw = new TextDecoder('utf-8').decode(buf)
  const uitMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(ruw.slice(0, 4096))?.[1]
  const charset = (uitHeader ?? uitMeta ?? 'utf-8').toLowerCase()
  if (charset === 'utf-8' || charset === 'utf8') return ruw
  try {
    return new TextDecoder(charset).decode(buf)
  } catch {
    // Onbekende codering: latin-1 is de gebruikelijke tweede kans op oudere Belgische sites.
    try {
      return new TextDecoder('windows-1252').decode(buf)
    } catch {
      return ruw
    }
  }
}
