// Gedeelde rol- en toegangslogica voor de wedstrijdblad-laag (WEDSTRIJDBLAD-PROMPT §Rollen).
// Eén bron van waarheid zodat collecties consistente access-control gebruiken.

import type { Access, FieldAccess } from 'payload'

export type UserRole =
  | 'admin'
  | 'federatie' // comité/afgevaardigde — beheert vergunningen, reeksindeling, kan altijd overschrijven
  | 'scheidsrechter' // toegewezen aan een wedstrijd
  | 'club-beheerder' // beheert eigen club: leden + opstelling
  | 'club-medewerker' // operationele clubhelper: aantekenen, opstelling, spelers & training beheren — GEEN accounts/instellingen
  | 'club-lid' // herkend clublid: leden-content + eigen trainingsluik (bekijken)
  | 'kapitein' // tekent het blad af
  | 'scorekeeper' // bedient het live-aantekenscherm
  | 'viewer' // supporter — volgt live mee (alleen lezen). Standaardrol bij zelfregistratie.

export const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: 'Admin (volledige toegang)', value: 'admin' },
  { label: 'Federatie / comité', value: 'federatie' },
  { label: 'Scheidsrechter', value: 'scheidsrechter' },
  { label: 'Club-beheerder', value: 'club-beheerder' },
  { label: 'Club-medewerker (operationeel)', value: 'club-medewerker' },
  { label: 'Lid van de club', value: 'club-lid' },
  { label: 'Kapitein', value: 'kapitein' },
  { label: 'Aantekenaar (scorekeeper)', value: 'scorekeeper' },
  { label: 'Supporter (volgt live mee)', value: 'viewer' },
]

type WithRoles = {
  roles?: UserRole[] | null
  club?: number | string | { id: number | string } | null
  official?: number | string | { id: number | string } | null
  followedClubs?: (number | string | { id: number | string })[] | null
}

export function userRoles(user: unknown): UserRole[] {
  const roles = (user as WithRoles | null)?.roles
  return Array.isArray(roles) ? roles : []
}

// Een admin is superuser en erft alle GEZAG-rollen (federatie, scheidsrechter, kapitein,
// scorekeeper): admin mag overal aan, ook waar specifiek op die rollen gecontroleerd wordt.
// 'club-beheerder' en 'viewer' worden bewust NIET geërfd — die bepalen een club-/identiteits-
// scope (een admin heeft geen eigen club) en zouden anders de club-afbakening verstoren.
const ADMIN_INHERITS: UserRole[] = ['federatie', 'scheidsrechter', 'kapitein', 'scorekeeper']

export function hasRole(user: unknown, ...roles: UserRole[]): boolean {
  const have = userRoles(user)
  if (have.includes('admin') && roles.some((r) => r === 'admin' || ADMIN_INHERITS.includes(r))) {
    return true
  }
  return roles.some((r) => have.includes(r))
}

/** Federatie-niveau: admin of federatie/comité — mag altijd alles (binnen reglement-grenzen). */
export function isFederationLevel(user: unknown): boolean {
  return hasRole(user, 'admin', 'federatie')
}

/** Mag deze gebruiker de analysemodule gebruiken? Admin altijd; anderen als de admin hen
 * analyse-toegang gaf (users.analyseAccess) — of zodra iemand zijn analyses met hen deelt
 * (lezen of meedoen): delen moet volstaan om het aan de andere kant ook écht te zien. */
export function canAnalyse(user: unknown): boolean {
  if (hasRole(user, 'admin')) return true
  const u = user as { analyseAccess?: unknown; analyseToegangTot?: unknown; analyseBewerkTot?: unknown } | null
  if (u?.analyseAccess) return true
  const heeft = (v: unknown) => Array.isArray(v) && v.length > 0
  return heeft(u?.analyseToegangTot) || heeft(u?.analyseBewerkTot)
}

/** Operationele clubstaf: beheert de eigen club (aantekenen, opstelling, spelers, training) — maar
 * NIET de gevoelige zaken (accounts/rollen). Club-beheerder + club-medewerker. */
export function isClubStaff(user: unknown): boolean {
  return hasRole(user, 'club-beheerder', 'club-medewerker')
}

/** Mag deze gebruiker het trainingsluik (progressie + aanwezigheid) gebruiken? Admin/federatie,
 * clubstaf en clubleden mogen het BEKIJKEN; anderen als de admin hen training-toegang gaf. Wie mag
 * INVOEREN wordt apart gecheckt (isFederationLevel || isClubStaff) — een club-lid kijkt enkel. */
export function canTraining(user: unknown): boolean {
  if (isFederationLevel(user) || hasRole(user, 'club-beheerder', 'club-medewerker', 'club-lid')) return true
  return Boolean((user as { trainingAccess?: unknown } | null)?.trainingAccess)
}

/**
 * Mag deze gebruiker een TORNOOIwedstrijd aantekenen?
 *
 * Op een tornooidag zit er iemand achter de tafel die geen scheidsrechter en geen federatielid is:
 * een ouder, een ploegverantwoordelijke, een vrijwilliger. Daarvoor bestaat dit recht — de admin
 * kent het per account toe (users.aantekenRechten), zoals hij dat ook voor analyse en training doet.
 *
 * Bewust géén bestaande rol hergebruikt: élk vers account krijgt standaard de rol 'scorekeeper',
 * dus die zou het recht aan iedereen geven — precies wat het niet mag zijn.
 *
 * Dit gaat enkel over AANTEKENEN. Een tornooi aanmaken, herloten of verwijderen blijft bij de
 * federatie; één bron van waarheid voor de knoppen én voor de API, zodat er nooit een knop staat
 * die de server daarna weigert.
 */
export function magTornooiAantekenen(user: unknown, supportersModus = false): boolean {
  if (isFederationLevel(user) || hasRole(user, 'scheidsrechter')) return true
  if (Boolean((user as { aantekenRechten?: unknown } | null)?.aantekenRechten)) return true
  // Supporters-modus: staat het platform op vrije livescore, dan mag élke INGELOGDE bezoeker ook
  // een tornooiwedstrijd meetellen — dezelfde afspraak als bij gewone wedstrijden (mayScoreMatch).
  // Op een tornooidag zijn er tien velden tegelijk bezig en zit er lang niet achter elk veld
  // iemand van de organisatie; zonder dit blijft de helft van de standen leeg.
  //
  // Aanmelden blijft verplicht: een naam achter elke melding is wat de vertrouwenslaag
  // (score-trust) nodig heeft om een stand als bevestigd te kunnen tonen. Wie aan bod komt
  // wanneer er al iemand meetelt, beslist die laag — niet deze functie.
  return supportersModus && Boolean((user as { id?: unknown } | null)?.id)
}

/** De club waaraan een club-beheerder gekoppeld is (id), indien aanwezig. */
export function userClubId(user: unknown): number | string | null {
  const club = (user as WithRoles | null)?.club
  if (club == null) return null
  if (typeof club === 'object') return club.id
  return club
}

/** Clubs die een supporter zonder eigen club toch volgt (id's), voor wie geen `club` heeft. */
export function userFollowedClubIds(user: unknown): (number | string)[] {
  const list = (user as WithRoles | null)?.followedClubs
  if (!Array.isArray(list)) return []
  return list.map((c) => (c != null && typeof c === 'object' ? c.id : c)).filter((id): id is number | string => id != null)
}

/** Het official-dossier (scheidsrechter/grensrechter) gekoppeld aan deze gebruiker, indien aanwezig. */
export function userOfficialId(user: unknown): number | string | null {
  const off = (user as WithRoles | null)?.official
  if (off == null) return null
  if (typeof off === 'object') return off.id
  return off
}

/** Het speler-dossier dat aan dit account gekoppeld is (id), indien aanwezig. */
export function userPlayerId(user: unknown): number | string | null {
  const p = (user as { player?: unknown } | null)?.player
  if (p == null) return null
  if (typeof p === 'object') return (p as { id: number | string }).id
  return p as number | string
}

// ---- Collection-level Access helpers ----

export const isAdmin: Access = ({ req }) => hasRole(req.user, 'admin')

export const isFederation: Access = ({ req }) => isFederationLevel(req.user)

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const publicRead: Access = () => true

// ---- Field-level helpers (FieldAccess heeft een ander args-type dan Access) ----

export const fieldIsFederation: FieldAccess = ({ req }) => isFederationLevel(req.user)
