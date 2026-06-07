// Gedeelde authenticatie/autorisatie voor de custom REST-routes onder /api/*.
//
// DECISION: de custom routes draaien de match-engine met overrideAccess:true (de server is
// vertrouwd), dus Payload's collection-access is hier GÉÉN vangnet. Elke muterende route MOET
// daarom hier eerst de beller verifiëren vóór ze de engine aanroept. Eén bron van waarheid.

import type { Payload } from 'payload'

import { canAnalyse, hasRole, isFederationLevel, userClubId, userOfficialId, type UserRole } from './access'

export type AuthedUser = { id: number | string; roles?: UserRole[] | null } & Record<string, unknown>

/** Haal de ingelogde gebruiker op uit de request-headers; nooit gooien. */
export async function authUser(payload: Payload, req: Request): Promise<AuthedUser | null> {
  const { user } = await payload.auth({ headers: req.headers }).catch(() => ({ user: null }))
  return (user as AuthedUser | null) ?? null
}

/** 401 indien niet ingelogd, 403 indien rol ontbreekt; anders null (= ok). */
export function requireRole(user: AuthedUser | null, ...roles: UserRole[]): Response | null {
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (isFederationLevel(user)) return null
  if (!hasRole(user, ...roles)) return Response.json({ error: 'Geen rechten.' }, { status: 403 })
  return null
}

const relId = (rel: unknown): number | string | null => {
  if (rel == null) return null
  if (typeof rel === 'object') return (rel as { id: number | string }).id
  return rel as number | string
}

/** Club-id's van de thuis- en uitploeg van een wedstrijd (null als onbekend). */
export async function matchSideClubs(
  payload: Payload,
  matchId: number | string,
): Promise<{ home: number | string | null; away: number | string | null }> {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  if (!match) return { home: null, away: null }
  const clubOf = (teamRel: unknown) => {
    const team = typeof teamRel === 'object' && teamRel ? (teamRel as { club?: unknown }) : null
    return team ? relId(team.club) : null
  }
  return { home: clubOf(match.homeTeam), away: clubOf(match.awayTeam) }
}

/** Welke clubs zijn bij een wedstrijd betrokken (thuis + uit)? */
async function matchClubIds(payload: Payload, matchId: number | string): Promise<(number | string)[]> {
  const { home, away } = await matchSideClubs(payload, matchId)
  return [home, away].filter((c): c is number | string => c != null)
}

/**
 * Mag deze gebruiker de score van DEZE wedstrijd bedienen?
 * - admin/federatie: altijd
 * - scorekeeper: ja (vertrouwde aantekenaar — strikte per-match-binding kan later via vrijgaveCode)
 * - scheidsrechter: gebonden aan de toewijzing — is er een toegewezen (backup-)SR op het blad, dan
 *   mag enkel die; staat er geen toewijzing, dan mag elke scheidsrechter (backwards compatible)
 * - club-beheerder: enkel als de eigen club bij de wedstrijd betrokken is
 */
export async function mayScoreMatch(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number | string,
): Promise<boolean> {
  // Gemachtigde aantekenaars mogen meteen — geen extra query nodig.
  if (user && (isFederationLevel(user) || hasRole(user, 'scorekeeper'))) return true
  // Demo-wedstrijden zijn vrij speelbaar, ook zonder login (oefenmodus).
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (match && (match as { isDemo?: boolean }).isDemo) return true
  if (!user) return false
  // Analyse-opname: de eigenaar (met analyse-toegang) tekent z'n eigen analysewedstrijd zelf aan.
  if (match && (match as { analyseOnly?: boolean }).analyseOnly && canAnalyse(user)) {
    const ownerId = relId((match as { analyseOwner?: unknown }).analyseOwner)
    if (ownerId != null && String(ownerId) === String(user.id)) return true
  }
  if (hasRole(user, 'scheidsrechter')) {
    const sheets = await payload
      .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1 })
      .catch(() => null)
    const sheet = sheets?.docs?.[0]
    const assigned = [sheet?.assignedReferee, sheet?.backupReferee]
      .map((r) => (typeof r === 'object' && r ? (r as { id: number }).id : r))
      .filter((x) => x != null)
    if (assigned.length === 0) return true // geen toewijzing → elke SR mag
    const own = userOfficialId(user)
    return own != null && assigned.some((id) => String(id) === String(own))
  }
  if (hasRole(user, 'club-beheerder')) {
    const clubId = userClubId(user)
    if (clubId == null) return false
    const clubs = await matchClubIds(payload, matchId)
    return clubs.some((c) => String(c) === String(clubId))
  }
  return false
}

/** Is deze gebruiker (niet-federatie) de toegewezen/backup-scheidsrechter van deze wedstrijd? */
export async function isAssignedReferee(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number | string,
): Promise<boolean> {
  if (!user) return false
  if (isFederationLevel(user)) return true
  const ownOfficial = userOfficialId(user)
  if (ownOfficial == null) return false
  const sheets = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1 })
    .catch(() => null)
  const sheet = sheets?.docs?.[0]
  if (!sheet) return false
  const ids = [sheet.assignedReferee, sheet.backupReferee]
    .map((r) => (typeof r === 'object' && r ? (r as { id: number }).id : r))
    .filter((x) => x != null)
  return ids.some((id) => String(id) === String(ownOfficial))
}

export { isFederationLevel, hasRole, userClubId, userOfficialId }
