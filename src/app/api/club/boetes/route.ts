import { hasRole, userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { boeteDoorClub } from '@/lib/boetes'
import { getPayloadClient } from '@/lib/payload-client'

// De club reageert op een opgelegde boete (vanuit /club/boetes): betaling melden of betwisten.
//   POST { actie: 'betaling' | 'betwisten', id, opmerking? }
// Enkel de clubbeheerder/-medewerker, en enkel voor een boete van de eigen club.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const club = userClubId(user)
  if (club == null || !hasRole(user, 'club-beheerder', 'club-medewerker')) return Response.json({ error: 'Enkel de clubbeheerder.' }, { status: 403 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = Number(body?.id)
  const actie = body?.actie
  if (!Number.isFinite(id) || (actie !== 'betaling' && actie !== 'betwisten')) return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  try {
    const r = await boeteDoorClub(payload, Number(club), id, actie, typeof body?.opmerking === 'string' ? body.opmerking : null)
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
