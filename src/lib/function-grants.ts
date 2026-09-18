import type { Payload, Where } from 'payload'

// Fijnmazige toekenning per functie (veldscherm, kantinescherm, vergoedingen, ...): federatie/admin
// kan zo één specifieke gebruiker toegang geven tot één specifieke functie, zonder hem de volledige
// rol (club-medewerker, scheidsrechter, federatie) te geven. Zie collections/FunctionGrants.ts voor
// het datamodel en /beheer/rechten voor het beheerscherm.
//
// Dezelfde functies als de "tools" in profiles.ts (het "Meer"-menu + de profielpagina's) — dat
// bestand blijft de bron van waarheid voor "welke knop hoort bij welke rol"; dit bestand voegt enkel
// de per-gebruiker uitzondering toe. Bewust NIET elke tool uit profiles.ts:
//   - het publieke reglement en de admin-only routes (/admin, /beheer/accounts) horen niet in een
//     lichte toekenning thuis — die blijven aan de echte rol vast.
//   - de scheidsrechter-tools (portaal, vergoedingen) ontbreken bewust: die zijn verweven met een
//     gekoppeld officials-dossier (portaal) resp. een IDOR-bescherming op financiële PII
//     (vergoedingen — enkel de scheidsrechter zélf mag zijn eigen kwitantie ophalen). Een lichte
//     toekenning zou die controles moeten verzwakken om iets te betekenen; dat is dit niet waard.
export type FunctieGroep = 'clubs' | 'federatie'

export type FunctieDef = {
  value: string
  label: string
  groep: FunctieGroep
  /** Clubgebonden functies (de clubtools) vereisen een club bij de toekenning; scheidsrechter-/
   * federatiefuncties zijn club-onafhankelijk. */
  clubGebonden: boolean
}

export const FUNCTIES: FunctieDef[] = [
  { value: 'club/voorspel', label: '🔮 Pronostiek', groep: 'clubs', clubGebonden: true },
  { value: 'kantine', label: '🍻 Kantinescherm', groep: 'clubs', clubGebonden: true },
  { value: 'cast', label: '📺 Schermen naar tv', groep: 'clubs', clubGebonden: true },
  { value: 'club/veldscherm', label: '🏟️ Veldscherm', groep: 'clubs', clubGebonden: true },
  { value: 'beheer/spelers', label: '➕ Spelers toevoegen', groep: 'clubs', clubGebonden: true },
  { value: 'beheer/training/aanwezigheid', label: '✅ Aanwezigheidslijst', groep: 'clubs', clubGebonden: true },
  { value: 'beheer/leden', label: '🩺 Ledenkeuring', groep: 'federatie', clubGebonden: false },
  { value: 'beheer/aantekenaars', label: '✏️ Aantekenaars', groep: 'federatie', clubGebonden: false },
  { value: 'beheer/planning', label: '📅 Seizoensplanning', groep: 'federatie', clubGebonden: false },
  { value: 'knipjes', label: '✂️ Knipjes', groep: 'federatie', clubGebonden: false },
  { value: 'bekerfinale', label: '🏆 Bekerfinale', groep: 'federatie', clubGebonden: false },
]

export const FUNCTIE_OPTIONS = FUNCTIES.map((f) => ({ label: `${f.label} (${f.groep})`, value: f.value }))

export function functieDef(value: string): FunctieDef | undefined {
  return FUNCTIES.find((f) => f.value === value)
}

/** Heeft deze gebruiker — los van zijn rol — een expliciete toekenning voor deze functie? Voor een
 * clubgebonden functie telt enkel een toekenning voor DEZE club. */
export async function hasFunctionGrant(
  payload: Payload,
  userId: number | string | null | undefined,
  functie: string,
  clubId?: number | string | null,
): Promise<boolean> {
  if (userId == null) return false
  const def = functieDef(functie)
  const and: Where[] = [{ user: { equals: userId } }, { functie: { equals: functie } }]
  if (def?.clubGebonden) {
    if (clubId == null) return false
    and.push({ club: { equals: clubId } })
  }
  const res = await payload
    .find({ collection: 'function-grants', where: { and }, limit: 1, depth: 0, overrideAccess: true })
    .catch(() => ({ totalDocs: 0 }))
  return res.totalDocs > 0
}
