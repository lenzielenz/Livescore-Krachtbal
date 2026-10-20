// Functies binnen een club, toegekend door de club-beheerder (users.clubFuncties + functieTeams).
// Bovenop de rollen (lib/access.ts): de rol zegt wat je in de club mag in het algemeen
// (club-beheerder = admin van de club, club-medewerker, club-lid), de functie voor welke ploegen.
//
//   admin (club-beheerder)    alles van de eigen club (rol, geen functie)
//   jeugdverantwoordelijke    opstellingen en training van alle jeugdploegen van de club
//   trainer                   training van zijn ploegen
//   coach                     opstellingen van zijn ploegen
//   speler / lid              informatief; rechten als club-lid
//
// Meerdere functies tegelijk mogen; een scheidsrechter kan ook speler of coach zijn.

import { hasRole, isClubStaff, isFederationLevel, userClubId } from './access'

export type ClubFunctie = 'jeugdverantwoordelijke' | 'trainer' | 'coach' | 'speler' | 'lid'

export const CLUB_FUNCTIE_OPTIONS: { label: string; value: ClubFunctie }[] = [
  { label: 'Jeugdverantwoordelijke', value: 'jeugdverantwoordelijke' },
  { label: 'Trainer', value: 'trainer' },
  { label: 'Coach', value: 'coach' },
  { label: 'Speler', value: 'speler' },
  { label: 'Lid', value: 'lid' },
]

export const CLUB_FUNCTIES = new Set<string>(CLUB_FUNCTIE_OPTIONS.map((o) => o.value))

export type FunctieTeam = { id: number | string; club?: unknown; category?: string | null }

const relId = (v: unknown): string | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null ? null : String(id)
}

export function clubFunctiesVan(user: unknown): ClubFunctie[] {
  const f = (user as { clubFuncties?: unknown } | null)?.clubFuncties
  return Array.isArray(f) ? (f.filter((x) => CLUB_FUNCTIES.has(String(x))) as ClubFunctie[]) : []
}

function functieTeamIds(user: unknown): Set<string> {
  const t = (user as { functieTeams?: unknown } | null)?.functieTeams
  return new Set((Array.isArray(t) ? t : []).map(relId).filter((x): x is string => x != null))
}

const vanEigenClub = (user: unknown, team: FunctieTeam) => {
  const eigen = userClubId(user)
  return eigen != null && relId(team.club) === String(eigen)
}

/** Jeugd = alles behalve senioren. */
const isJeugd = (team: FunctieTeam) => Boolean(team.category) && team.category !== 'senioren'

/**
 * Mag deze gebruiker de opstelling van deze ploeg zetten? Federatie en scheidsrechter altijd; de
 * staf van de club; de coach van die ploeg; de jeugdverantwoordelijke voor een jeugdploeg van de club.
 */
export function magOpstellingVoor(user: unknown, team: FunctieTeam): boolean {
  if (isFederationLevel(user) || hasRole(user, 'scheidsrechter')) return true
  if (!vanEigenClub(user, team)) return false
  if (isClubStaff(user)) return true
  const f = clubFunctiesVan(user)
  if (f.includes('coach') && functieTeamIds(user).has(String(team.id))) return true
  return f.includes('jeugdverantwoordelijke') && isJeugd(team)
}

/** Mag deze gebruiker training invoeren voor deze ploeg? Zelfde idee: trainer/coach van de ploeg, jeugdverantwoordelijke voor jeugd. */
export function magTrainingVoor(user: unknown, team: FunctieTeam): boolean {
  if (isFederationLevel(user)) return true
  if (!vanEigenClub(user, team)) return false
  if (isClubStaff(user)) return true
  const f = clubFunctiesVan(user)
  if ((f.includes('trainer') || f.includes('coach')) && functieTeamIds(user).has(String(team.id))) return true
  return f.includes('jeugdverantwoordelijke') && isJeugd(team)
}
