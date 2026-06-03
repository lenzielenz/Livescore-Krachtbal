import { authUser, hasRole, isFederationLevel } from '@/lib/api-auth'
import { buildMatchSheet } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

// JSON-export van het wedstrijdblad (data-portabiliteit / archief). Bevat persoonsgegevens
// (opstellingen, officials) → enkel ingelogde interne rollen.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) {
    return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!(isFederationLevel(user) || hasRole(user, 'scheidsrechter', 'club-beheerder'))) {
      return Response.json({ error: 'Geen rechten.' }, { status: 403 })
    }
    const sheet = await buildMatchSheet(payload, matchId)
    return new Response(JSON.stringify(sheet, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="wedstrijdblad-${matchId}.json"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 })
  }
}
