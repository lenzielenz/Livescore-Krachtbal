// Gedeelde rol- en toegangslogica voor de wedstrijdblad-laag (WEDSTRIJDBLAD-PROMPT §Rollen).
// Eén bron van waarheid zodat collecties consistente access-control gebruiken.

import type { Access, FieldAccess } from 'payload'

export type UserRole =
  | 'admin'
  | 'federatie' // comité/afgevaardigde — beheert vergunningen, reeksindeling, kan altijd overschrijven
  | 'scheidsrechter' // toegewezen aan een wedstrijd
  | 'club-beheerder' // beheert eigen club: leden + opstelling
  | 'kapitein' // tekent het blad af
  | 'scorekeeper' // bedient het live-aantekenscherm
  | 'viewer' // supporter — volgt live mee (alleen lezen). Standaardrol bij zelfregistratie.

export const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: 'Admin (volledige toegang)', value: 'admin' },
  { label: 'Federatie / comité', value: 'federatie' },
  { label: 'Scheidsrechter', value: 'scheidsrechter' },
  { label: 'Club-beheerder', value: 'club-beheerder' },
  { label: 'Kapitein', value: 'kapitein' },
  { label: 'Aantekenaar (scorekeeper)', value: 'scorekeeper' },
  { label: 'Supporter (volgt live mee)', value: 'viewer' },
]

type WithRoles = {
  roles?: UserRole[] | null
  club?: number | string | { id: number | string } | null
  official?: number | string | { id: number | string } | null
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

/** Mag deze gebruiker het trainingsluik (progressie + aanwezigheid) gebruiken? Admin/federatie
 * en club-beheerders altijd; anderen als de admin hen training-toegang gaf (users.trainingAccess). */
export function canTraining(user: unknown): boolean {
  if (isFederationLevel(user) || hasRole(user, 'club-beheerder')) return true
  return Boolean((user as { trainingAccess?: unknown } | null)?.trainingAccess)
}

/** De club waaraan een club-beheerder gekoppeld is (id), indien aanwezig. */
export function userClubId(user: unknown): number | string | null {
  const club = (user as WithRoles | null)?.club
  if (club == null) return null
  if (typeof club === 'object') return club.id
  return club
}

/** Het official-dossier (scheidsrechter/grensrechter) gekoppeld aan deze gebruiker, indien aanwezig. */
export function userOfficialId(user: unknown): number | string | null {
  const off = (user as WithRoles | null)?.official
  if (off == null) return null
  if (typeof off === 'object') return off.id
  return off
}

// ---- Collection-level Access helpers ----

export const isAdmin: Access = ({ req }) => hasRole(req.user, 'admin')

export const isFederation: Access = ({ req }) => isFederationLevel(req.user)

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const publicRead: Access = () => true

// ---- Field-level helpers (FieldAccess heeft een ander args-type dan Access) ----

export const fieldIsFederation: FieldAccess = ({ req }) => isFederationLevel(req.user)
