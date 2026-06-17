import { hasRole, userClubId, type UserRole } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Clubteam-beheer door een CLUB-BEHEERDER: ken de club-subrollen (club-medewerker / club-lid) toe
// aan leden van de EIGEN club. Strikt afgeschermd tegen escalatie:
//  - enkel een club-beheerder (admins gebruiken /beheer/accounts);
//  - enkel accounts die al aan de EIGEN club gekoppeld zijn;
//  - enkel de twee club-subrollen — nooit admin/federatie/scheidsrechter/club-beheerder aanraken;
//  - de overige rollen van het account blijven ongemoeid.
const CLUB_SUBROLES = ['club-medewerker', 'club-lid'] as const
type ClubSubRole = (typeof CLUB_SUBROLES)[number]
const PROTECTED = ['admin', 'federatie', 'scheidsrechter', 'club-beheerder']

const relId = (v: unknown): number | string | null =>
  v && typeof v === 'object' ? ((v as { id?: number | string }).id ?? null) : (v as number | string | null)

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!hasRole(user, 'club-beheerder')) {
    return Response.json(
      { error: user ? 'Enkel een club-beheerder kan het clubteam beheren.' : 'Niet ingelogd.' },
      { status: user ? 403 : 401 },
    )
  }
  const myClub = userClubId(user)
  if (myClub == null) {
    return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const userId = Number(body.userId)
  if (!Number.isFinite(userId)) return Response.json({ error: 'Ongeldig account.' }, { status: 400 })
  const role = String(body.role ?? 'none')
  if (role !== 'none' && !CLUB_SUBROLES.includes(role as ClubSubRole)) {
    return Response.json({ error: 'Ongeldige rol.' }, { status: 400 })
  }

  const target = await payload.findByID({ collection: 'users', id: userId, depth: 0 }).catch(() => null)
  if (!target) return Response.json({ error: 'Account niet gevonden.' }, { status: 404 })

  // Strikt: enkel leden van de EIGEN club.
  if (String(relId((target as { club?: unknown }).club) ?? '') !== String(myClub)) {
    return Response.json({ error: 'Je kan enkel leden van je eigen club beheren.' }, { status: 403 })
  }
  // Nooit een account met een hogere/andere rol aanraken (geen escalatie, ook niet jezelf).
  const current = Array.isArray((target as { roles?: unknown }).roles) ? (target as { roles: string[] }).roles : []
  if (current.some((r) => PROTECTED.includes(r))) {
    return Response.json({ error: 'Dit account beheer je niet hier (hogere rol — vraag de federatie).' }, { status: 403 })
  }

  // Toggle enkel de club-subrollen; behoud de rest (bv. supporter). Nooit zonder rol achterlaten.
  let next = current.filter((r) => !CLUB_SUBROLES.includes(r as ClubSubRole))
  if (role !== 'none') next.push(role)
  if (next.length === 0) next = ['viewer']

  try {
    await payload.update({ collection: 'users', id: userId, data: { roles: next as UserRole[] }, overrideAccess: true })
  } catch {
    return Response.json({ error: 'Bijwerken mislukt.' }, { status: 500 })
  }
  return Response.json({ ok: true, roles: next })
}
