import { canAnalyse, hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { MATCH_DEPENDENT_COLLECTIONS } from '@/lib/match-cleanup'
import { getPayloadClient } from '@/lib/payload-client'

// Een wedstrijd én alle bijhorende data verwijderen. Federatie/admin mag alles; een analist mag
// z'n eigen analyse-opname verwijderen (privé per persoon).

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

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
    const isFed = isFederationLevel(user) || hasRole(user, 'federatie')
    if (!isFed) {
      // Niet-federatie mag enkel z'n eigen analyse-opname verwijderen.
      const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
      const ownerId = relId((match as { analyseOwner?: unknown } | null)?.analyseOwner)
      const isOwnAnalyse = Boolean(
        match && (match as { analyseOnly?: boolean }).analyseOnly && canAnalyse(user) && ownerId != null && String(ownerId) === String(user.id),
      )
      if (!isOwnAnalyse) return Response.json({ error: 'Enkel je eigen analyse-opname of federatie/admin.' }, { status: 403 })
    }

    for (const collection of MATCH_DEPENDENT_COLLECTIONS) {
      await payload.delete({ collection, where: { match: { equals: matchId } }, overrideAccess: true }).catch(() => {})
    }
    await payload.delete({ collection: 'matches', id: matchId, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
