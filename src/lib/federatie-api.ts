import { isFederationLevel } from './access'
import { authUser, type AuthedUser } from './api-auth'
import { getPayloadClient } from './payload-client'

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>

/**
 * Gemeenschappelijke ingang voor de federatietools (/api/federatie/*): enkel federatie/admin.
 * Geeft de payload + gebruiker, of een kant-en-klaar foutantwoord.
 */
export async function federatieToegang(
  req: Request,
): Promise<{ payload: PayloadClient; user: AuthedUser; fout?: undefined } | { fout: Response }> {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  if (!isFederationLevel(user)) return { fout: Response.json({ error: 'Enkel de federatie.' }, { status: 403 }) }
  return { payload, user }
}

export async function leesJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
