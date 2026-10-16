import type { Payload } from 'payload'

import { isFederationLevel } from './access'
import { analyseEditOwners, canViewAnalyseMatch } from './analyse-access'
import { authUser, type AuthedUser } from './api-auth'
import { wedstrijdVanDeelToken } from './app-analyse'

type MatchDoc = { id: number; analyseOnly?: boolean | null; analyseOwner?: unknown } & Record<string, unknown>

const eigenaarId = (m: MatchDoc): string | null => {
  const o = m.analyseOwner
  if (o == null) return null
  return typeof o === 'object' ? String((o as { id?: unknown }).id ?? '') || null : String(o)
}

/** Beheert deze gebruiker de analyse (eigenaar, wie "meedoen & aanpassen" kreeg, of federatie)? */
export function beheertAnalyse(user: unknown, match: MatchDoc): boolean {
  if (!user) return false
  if (isFederationLevel(user)) return true
  const eigenaar = eigenaarId(match)
  return eigenaar != null && analyseEditOwners(user).some((x) => String(x) === eigenaar)
}

export interface AnalyseToegang {
  match: MatchDoc
  user: AuthedUser | null
  beheert: boolean
  viaDeellink: boolean
}

/**
 * Wie mag deze analyse (een eigen analyse-opname) zien? Met een sessie: wie ze volgens de
 * analyse-regels mag zien. Zonder: enkel met de geldige deellink van precies deze wedstrijd.
 * null = geen toegang (of geen analysewedstrijd).
 */
export async function analyseToegang(
  payload: Payload,
  req: Request,
  matchId: number,
  deel: string | null = null,
): Promise<AnalyseToegang | null> {
  const match = (await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)) as MatchDoc | null
  if (!match || !match.analyseOnly) return null
  const user = await authUser(payload, req)
  if (user && canViewAnalyseMatch(user, match)) {
    return { match, user, beheert: beheertAnalyse(user, match), viaDeellink: false }
  }
  if (deel && (await wedstrijdVanDeelToken(deel)) === matchId) {
    return { match, user, beheert: false, viaDeellink: true }
  }
  return null
}

/** Naam waaronder een notitie verschijnt. */
export function weergaveNaam(user: AuthedUser | null): string {
  const u = (user ?? {}) as { name?: unknown; naam?: unknown; firstName?: unknown; email?: unknown }
  const naam = [u.name, u.naam, u.firstName].find((x) => typeof x === 'string' && x.trim())
  if (naam) return String(naam).trim()
  return typeof u.email === 'string' ? u.email.split('@')[0] : 'Onbekend'
}
