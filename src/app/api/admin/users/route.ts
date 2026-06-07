import { hasRole, ROLE_OPTIONS, type UserRole } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

const VALID_ROLES = new Set<string>(ROLE_OPTIONS.map((o) => o.value))

// Admin-only: werk de rollen en club van een account bij. Server-side bewaakt zodat
// enkel een admin elk accounttype (supporter, club, scheidsrechter, federatie) kan beheren.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!hasRole(user, 'admin')) {
    return Response.json({ error: 'Enkel een admin kan accounts beheren.' }, { status: user ? 403 : 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const userId = Number(body.userId)
  if (!Number.isFinite(userId)) {
    return Response.json({ error: 'Ongeldig account.' }, { status: 400 })
  }

  // Rollen valideren (enkel bekende rollen; minstens één).
  const roles = Array.isArray(body.roles)
    ? [...new Set(body.roles.map(String).filter((r) => VALID_ROLES.has(r)))]
    : null
  if (!roles || roles.length === 0) {
    return Response.json({ error: 'Kies minstens één geldige rol.' }, { status: 400 })
  }

  // Club valideren (optioneel; null = loskoppelen).
  let club: number | null = null
  if (body.clubId != null && body.clubId !== '') {
    const cid = Number(body.clubId)
    if (Number.isFinite(cid) && cid > 0) {
      const exists = await payload.findByID({ collection: 'clubs', id: cid, depth: 0 }).catch(() => null)
      if (exists) club = cid
    }
  }

  // Een admin kan zichzelf niet per ongeluk de admin-rol ontnemen (laatste-slot-bescherming).
  if (Number(user!.id) === userId && !roles.includes('admin')) {
    return Response.json({ error: 'Je kan je eigen admin-rol niet verwijderen.' }, { status: 400 })
  }

  const analyseAccess = Boolean(body.analyseAccess)
  const trainingAccess = Boolean(body.trainingAccess)

  try {
    await payload.update({
      collection: 'users',
      id: userId,
      data: { roles: roles as UserRole[], club, analyseAccess, trainingAccess },
      overrideAccess: true,
    })
  } catch {
    return Response.json({ error: 'Bijwerken mislukt.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
