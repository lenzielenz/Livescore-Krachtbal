import { authUser } from '@/lib/api-auth'
import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { isFieldScreenTheme } from '@/lib/field-screens'
import { getPublicFieldScreenState, setFieldScreenTheme } from '@/lib/field-screens-data'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'

// Kleurthema van één veld wijzigen (donker/licht — zie collections/FieldScreens.ts). Club-beheerder
// van de EIGEN club altijd; club-medewerker enkel met een expliciete toekenning voor
// 'club/veldscherm' (zie lib/function-grants.ts); of federatie/admin.
export async function POST(req: Request) {
  let body: { fieldScreenId?: unknown; theme?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const fieldScreenId = Number(body.fieldScreenId)
  if (!Number.isFinite(fieldScreenId)) return Response.json({ error: 'Ongeldig veldscherm.' }, { status: 400 })
  if (!isFieldScreenTheme(body.theme)) return Response.json({ error: 'Ongeldig thema.' }, { status: 400 })

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const screen = await getPublicFieldScreenState(payload, fieldScreenId)
  if (!screen) return Response.json({ error: 'Veldscherm niet gevonden.' }, { status: 404 })
  if (!isFederationLevel(user)) {
    const clubId = userClubId(user)
    if (clubId == null || Number(clubId) !== screen.clubId) {
      return Response.json({ error: 'Dit veldscherm hoort niet bij jouw club.' }, { status: 403 })
    }
    const medewerkerGrant = hasRole(user, 'club-medewerker')
      ? await hasFunctionGrant(payload, user.id, 'club/veldscherm', clubId)
      : false
    if (!hasRole(user, 'club-beheerder') && !medewerkerGrant) {
      return Response.json({ error: 'Geen rechten.' }, { status: 403 })
    }
  }

  await setFieldScreenTheme(payload, fieldScreenId, body.theme)
  return Response.json({ ok: true })
}
