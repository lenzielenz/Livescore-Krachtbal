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
  | 'viewer' // alleen lezen

export const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: 'Admin (volledige toegang)', value: 'admin' },
  { label: 'Federatie / comité', value: 'federatie' },
  { label: 'Scheidsrechter', value: 'scheidsrechter' },
  { label: 'Club-beheerder', value: 'club-beheerder' },
  { label: 'Kapitein', value: 'kapitein' },
  { label: 'Aantekenaar (scorekeeper)', value: 'scorekeeper' },
  { label: 'Kijker (alleen lezen)', value: 'viewer' },
]

type WithRoles = { roles?: UserRole[] | null; club?: number | string | { id: number | string } | null }

export function userRoles(user: unknown): UserRole[] {
  const roles = (user as WithRoles | null)?.roles
  return Array.isArray(roles) ? roles : []
}

export function hasRole(user: unknown, ...roles: UserRole[]): boolean {
  const have = userRoles(user)
  return roles.some((r) => have.includes(r))
}

/** Federatie-niveau: admin of federatie/comité — mag altijd alles (binnen reglement-grenzen). */
export function isFederationLevel(user: unknown): boolean {
  return hasRole(user, 'admin', 'federatie')
}

/** De club waaraan een club-beheerder gekoppeld is (id), indien aanwezig. */
export function userClubId(user: unknown): number | string | null {
  const club = (user as WithRoles | null)?.club
  if (club == null) return null
  if (typeof club === 'object') return club.id
  return club
}

// ---- Collection-level Access helpers ----

export const isAdmin: Access = ({ req }) => hasRole(req.user, 'admin')

export const isFederation: Access = ({ req }) => isFederationLevel(req.user)

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const publicRead: Access = () => true

// ---- Field-level helpers (FieldAccess heeft een ander args-type dan Access) ----

export const fieldIsFederation: FieldAccess = ({ req }) => isFederationLevel(req.user)
