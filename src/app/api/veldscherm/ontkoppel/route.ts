import { authUser } from '@/lib/api-auth'
import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { getPublicFieldScreenState, unpairFieldScreen, unpairFieldScreensForMatch } from '@/lib/field-screens-data'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'

// Ontkoppel een veldscherm — bv. wanneer per ongeluk de verkeerde wedstrijd gekoppeld werd. Twee
// ingangen, elk met de authenticatie van hun eigen koppelpad:
//  - `matchId`: vanuit de wedstrijdpagina/aantekentafel (zie VeldschermKoppelen.tsx en
//    SimpleScorekeeper.tsx) — zelfde lichte grendel als koppelen zelf (api/veldscherm/koppel):
//    ingelogd volstaat, want dat pad kent de koppelcode niet, enkel de wedstrijd. Ontkoppelt élk
//    veldscherm dat aan deze wedstrijd hangt (normaal precies één).
//  - `fieldScreenId`: vanuit "Mijn club" → Veldscherm (VeldschermManager.tsx) — daar wél de volle
//    club-staf-controle, zoals bij api/veldscherm/thema.
export async function POST(req: Request) {
  let body: { matchId?: unknown; fieldScreenId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

  if (body.fieldScreenId !== undefined) {
    const fieldScreenId = Number(body.fieldScreenId)
    if (!Number.isFinite(fieldScreenId)) return Response.json({ error: 'Ongeldig veldscherm.' }, { status: 400 })

    const screen = await getPublicFieldScreenState(payload, fieldScreenId)
    if (!screen) return Response.json({ error: 'Veldscherm niet gevonden.' }, { status: 404 })
    // Het demo-scorebord blijft bewust permanent gekoppeld aan zijn fictieve wedstrijd (zie
    // ensureClubDemoScreens) — ontkoppelen zou dat kapotmaken zonder terugweg.
    if (screen.isDemo) return Response.json({ error: 'Een demoscherm kan niet ontkoppeld worden.' }, { status: 400 })
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
    const pairingCode = await unpairFieldScreen(payload, fieldScreenId)
    return Response.json({ ok: true, pairingCode })
  }

  const matchId = Number(body.matchId)
  if (!Number.isFinite(matchId) || matchId <= 0) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  await unpairFieldScreensForMatch(payload, matchId)
  return Response.json({ ok: true })
}
