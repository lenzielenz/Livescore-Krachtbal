import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Een (dubbele) ploeg verwijderen, optioneel samen met haar spelers. Enkel federatie/admin.
// Wedstrijden die naar de ploeg verwijzen, verliezen die verwijzing (FK → null) — bedoeld voor
// het opkuisen van dubbele/test-ploegen.
export async function POST(req: Request) {
  let body: { teamId?: number; deletePlayers?: boolean }
  try {
    body = (await req.json()) as { teamId?: number; deletePlayers?: boolean }
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const teamId = Number(body.teamId)
  if (!Number.isFinite(teamId)) return Response.json({ error: 'Ongeldige ploeg.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    let deletedPlayers = 0
    if (body.deletePlayers) {
      const players = await payload
        .find({ collection: 'players', where: { team: { equals: teamId } }, depth: 0, limit: 5000 })
        .catch(() => ({ docs: [] as { id: number }[] }))
      for (const p of players.docs) {
        await payload.delete({ collection: 'players', id: (p as { id: number }).id, overrideAccess: true }).catch(() => {})
        deletedPlayers += 1
      }
    }

    await payload.delete({ collection: 'teams', id: teamId, overrideAccess: true })
    return Response.json({ ok: true, deletedPlayers })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
