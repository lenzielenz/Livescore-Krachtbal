import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Een wedstrijd én alle bijhorende data verwijderen (enkel federatie/admin). Bedoeld om
// analyse-/testwedstrijden op te kuisen. Worpen eerst (FK naar balbezit), dan de rest.
const DEPENDENTS = ['throws', 'possessions', 'match-events', 'matchsheets', 'accidents'] as const

export async function POST(req: Request) {
  let body: { matchId?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const matchId = Number(body.matchId)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    for (const collection of DEPENDENTS) {
      await payload.delete({ collection, where: { match: { equals: matchId } }, overrideAccess: true }).catch(() => {})
    }
    await payload.delete({ collection: 'matches', id: matchId, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
