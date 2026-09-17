import { authUser } from '@/lib/api-auth'
import { isClubStaff, isFederationLevel, userClubId } from '@/lib/access'
import { MAX_VELDEN, MIN_VELDEN } from '@/lib/field-screens'
import { syncVeldenCount } from '@/lib/field-screens-data'
import { getPayloadClient } from '@/lib/payload-client'

// Aantal velden van de EIGEN club instellen. Club-staf (beheerder + medewerker) van die club, of
// federatie/admin. Zie /club/veldscherm en lib/field-screens.ts (planVeldenSync) voor de regels.
export async function POST(req: Request) {
  let body: { count?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const count = Number(body.count)
  if (!Number.isFinite(count)) return Response.json({ error: 'Ongeldig aantal.' }, { status: 400 })

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!isFederationLevel(user) && !isClubStaff(user)) {
    return Response.json({ error: 'Geen rechten.' }, { status: 403 })
  }
  const clubId = userClubId(user)
  if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 400 })

  try {
    const result = await syncVeldenCount(payload, Number(clubId), Math.max(MIN_VELDEN, Math.min(MAX_VELDEN, count)))
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
