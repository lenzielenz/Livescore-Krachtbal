// Toegangscontrole voor de CV-brug (/api/cv/*): ofwel het gedeelde geheim uit CV_BRIDGE_TOKEN
// (de Python-pipeline), ofwel een ingelogde federatie-gebruiker. Zonder ingestelde token bestaat
// de token-weg effectief niet (CLAUDE.md invariant 2: geen ongeauthenticeerde mutatie-endpoints).

import { createHash, timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { mayEditMatchVideo } from '@/lib/video-access'

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

/** Klopt de Bearer-token met CV_BRIDGE_TOKEN? Timing-veilig; zonder env-var altijd nee. */
export function tokenGeldig(req: Request): boolean {
  const secret = process.env.CV_BRIDGE_TOKEN
  if (!secret) return false
  const bearer = bearerToken(req)
  if (!bearer) return false
  // timingSafeEqual vereist buffers van gelijke lengte — vergelijk daarom de sha256-digests.
  const a = createHash('sha256').update(bearer).digest()
  const b = createHash('sha256').update(secret).digest()
  return timingSafeEqual(a, b)
}

/** Mag deze request de CV-brug gebruiken? Token van de pipeline of federatie-login. */
export async function cvAuthorized(payload: Payload, req: Request): Promise<boolean> {
  if (tokenGeldig(req)) return true
  const user = await authUser(payload, req)
  return isFederationLevel(user)
}

/**
 * Mag deze request de CV-gegevens van DEZE wedstrijd bewerken? Alles wat cvAuthorized toelaat, plus
 * de beheerder van een eigen analyse-opname (analyseOnly) — dezelfde kring die er de video van mag
 * koppelen en de voorstellen mag overzetten (mayEditMatchVideo). Officiële wedstrijden blijven
 * voorbehouden aan de pipeline en de federatie.
 */
export async function cvAuthorizedForMatch(payload: Payload, req: Request, matchId: number | string): Promise<boolean> {
  if (await cvAuthorized(payload, req)) return true
  const user = await authUser(payload, req)
  if (!user) return false
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match || !(match as { analyseOnly?: boolean | null }).analyseOnly) return false
  return mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })
}
