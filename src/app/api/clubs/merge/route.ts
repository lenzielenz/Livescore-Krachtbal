import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Twee clubs handmatig samenvoegen (enkel federatie/admin). Voor dubbels die te verschillend
// geschreven zijn voor de automatische opkuis (bv. "KBC St. Michiels" vs "Sint-Michiels").
// Ploegen, trainingen en accounts verhuizen van de bron naar de doelclub; daarna wordt de bron
// verwijderd.
export async function POST(req: Request) {
  let body: { fromClubId?: number; intoClubId?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const from = Number(body.fromClubId)
  const into = Number(body.intoClubId)
  if (!Number.isFinite(from) || !Number.isFinite(into)) return Response.json({ error: 'Ongeldige club(s).' }, { status: 400 })
  if (from === into) return Response.json({ error: 'Kies twee verschillende clubs.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    const movedTeams = await payload
      .update({ collection: 'teams', where: { club: { equals: from } }, data: { club: into }, overrideAccess: true })
      .then((r) => r.docs.length)
      .catch(() => 0)
    await payload.update({ collection: 'trainingen', where: { club: { equals: from } }, data: { club: into }, overrideAccess: true }).catch(() => {})
    await payload.update({ collection: 'users', where: { club: { equals: from } }, data: { club: into }, overrideAccess: true }).catch(() => {})
    // De bronclub heeft nu geen ploegen meer; verwijderen ruimt de rest op via de Clubs-hook.
    await payload.delete({ collection: 'clubs', id: from, overrideAccess: true })

    return Response.json({ ok: true, movedTeams })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
