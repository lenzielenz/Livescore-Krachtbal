import type { Payload } from 'payload'

import { canAnalyse, hasRole } from './access'
import { analyseEditOwners } from './analyse-access'
import { authUser, type AuthedUser } from './api-auth'

// Gedeelde autorisatie voor de analyse-beheerroutes (clubs/ploegen/spelers CRUD). Analyse-entiteiten
// zijn privé per eigenaar: enkel wie analyse-toegang heeft mag ze aanmaken, en bewerken/verwijderen
// kan enkel de eigenaar (admin mag alle). Competitie-records worden door deze routes nooit geraakt:
// de mutaties checken altijd eerst dat het doc `analyseOnly` is én van de beller.

export type AnalyseUserResult = { user: AuthedUser } | { error: Response }

/** Login + analyse-toegang vereisen (zoals canAnalyse: admin of users.analyseAccess). */
export async function requireAnalyseUser(payload: Payload, req: Request): Promise<AnalyseUserResult> {
  const user = await authUser(payload, req)
  if (!user) return { error: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  if (!canAnalyse(user)) return { error: Response.json({ error: 'Geen analyse-toegang.' }, { status: 403 }) }
  return { user }
}

const relId = (rel: unknown): number | string | null =>
  rel && typeof rel === 'object' ? ((rel as { id?: number | string }).id ?? null) : (rel as number | string | null)

/**
 * Mag deze gebruiker deze analyse-entiteit (club/ploeg/speler) bewerken of verwijderen? Enkel een
 * échte analyse-entiteit (`analyseOnly`) die van de beller is — of van iemand die hem "meedoen &
 * aanpassen" toekende — of de admin (mag alle). Geeft false voor competitie-records, zodat de
 * analyse-routes nooit competitie-data kunnen muteren.
 */
export function ownsAnalyse(
  doc: { analyseOnly?: boolean | null; analyseOwner?: unknown } | null | undefined,
  user: unknown,
): boolean {
  if (!doc || !doc.analyseOnly) return false
  if (hasRole(user, 'admin')) return true
  const owner = relId(doc.analyseOwner)
  if (owner == null) return false
  return analyseEditOwners(user).some((x) => String(x) === String(owner))
}
