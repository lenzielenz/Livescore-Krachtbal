// Lichte client-cache voor de navigatie-auth (ingelogd? + welke menu-items).
//
// De SiteHeader leeft in elke pagina (niet in de root-layout), dus hij remount bij élke
// navigatie en deed daardoor telkens opnieuw een fetch naar /api/users/me — met een
// zichtbare flikkering ("ingelogd"-items verschijnen pas ná het antwoord). We bewaren de
// uitkomst kort in sessionStorage zodat een volgende paginawissel meteen de juiste navigatie
// schildert zónder netwerkronde. In-/uitloggen maakt de cache leeg, zodat de staat klopt.

export type NavAuth = {
  loggedIn: boolean
  canAnalyse: boolean
  canTraining: boolean
  // Rolvlaggen voor het op-rol tonen van de profiel-ingangen (club/scheids/federatie).
  isClub: boolean
  isReferee: boolean
  isFed: boolean
}

const KEY = 'kb-nav-auth'
const TTL_MS = 60_000

type Stored = { at: number; state: NavAuth }

/** Gecachte navigatie-auth + of die nog vers is. `null` als er niets (bruikbaars) staat. */
export function readNavAuth(): { state: NavAuth; fresh: boolean } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const { at, state } = JSON.parse(raw) as Stored
    if (!state || typeof state.loggedIn !== 'boolean') return null
    return { state, fresh: Date.now() - at < TTL_MS }
  } catch {
    return null
  }
}

export function writeNavAuth(state: NavAuth): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), state } satisfies Stored))
  } catch {
    /* sessionStorage kan vol/geblokkeerd zijn — dan vervalt de cache gewoon */
  }
}

/** Bij in-/uitloggen aanroepen: de volgende header-mount haalt dan verse staat op. */
export function clearNavAuth(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* niets aan te doen */
  }
}
