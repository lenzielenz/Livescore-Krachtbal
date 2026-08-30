// Toegangscontrole voor de CV-brug (/api/cv/*): ofwel het gedeelde geheim uit CV_BRIDGE_TOKEN
// (de Python-pipeline), ofwel een ingelogde federatie-gebruiker. Zonder ingestelde token bestaat
// de token-weg effectief niet (CLAUDE.md invariant 2: geen ongeauthenticeerde mutatie-endpoints).

import { createHash, timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

/** Klopt de Bearer-token met CV_BRIDGE_TOKEN? Timing-veilig; zonder env-var altijd nee. */
function tokenGeldig(req: Request): boolean {
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
