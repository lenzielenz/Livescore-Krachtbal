import { KIJKMODUS_COOKIE } from './kijkmodus'
import { clearNavAuth } from './nav-auth-cache'

// Browser-kant van de sessie: kijkmodus (een beheerder bekijkt de site als vers lid) en uitloggen.
// Gedeeld door de gewone header (SiteHeader) en de zijbalk van het federatieplatform (FedShell).

/** Staat de kijkmodus aan? Pas lezen ná het mounten: de cookie bestaat niet op de server. */
export function kijkmodusCookieAan(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim() === `${KIJKMODUS_COOKIE}=1`)
}

/** Kijkmodus aan/uit: cookie zetten of wissen en herladen, zodat zowel de server-render als de
 *  navigatie meteen de gestripte kijk (of de volledige) tonen. */
export function zetKijkmodus(aan: boolean): void {
  document.cookie = aan
    ? `${KIJKMODUS_COOKIE}=1; path=/; max-age=${12 * 3600}`
    : `${KIJKMODUS_COOKIE}=; path=/; max-age=0`
  clearNavAuth()
  window.location.reload()
}

/** Uitloggen en naar de startpagina. Een mislukte oproep is geen ramp: de sessie verloopt sowieso server-side. */
export async function uitloggen(): Promise<void> {
  try {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
  } catch {
    /* sessie verloopt sowieso server-side */
  }
  clearNavAuth()
  window.location.href = '/'
}
