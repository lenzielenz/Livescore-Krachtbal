import { authUser, hasRole, isFederationLevel, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Eén speler aanpassen (naam/rugnummer) of verwijderen. Enkel federatie of een club-beheerder
// van de eigen club. Bedoeld om foutjes recht te zetten bij het samenstellen van een opstelling
// (bv. een verkeerd of dubbel rugnummer, of een per ongeluk toegevoegde speler).

async function authorizeForPlayer(req: Request, playerId: number) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { error: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  if (!isFederationLevel(user) && !hasRole(user, 'club-beheerder')) {
    return { error: Response.json({ error: 'Enkel club-beheerder/federatie.' }, { status: 403 }) }
  }
  const player = await payload.findByID({ collection: 'players', id: playerId, depth: 1 }).catch(() => null)
  if (!player) return { error: Response.json({ error: 'Speler niet gevonden.' }, { status: 404 }) }
  // Club-beheerder: enkel spelers van een ploeg van de eigen club.
  if (!isFederationLevel(user)) {
    const clubId = userClubId(user)
    const team = player.team && typeof player.team === 'object' ? (player.team as { club?: unknown }) : null
    const teamClub = team ? (typeof team.club === 'object' && team.club ? (team.club as { id: number }).id : team.club) : null
    if (clubId == null || teamClub == null || String(teamClub) !== String(clubId)) {
      return { error: Response.json({ error: 'Deze speler hoort niet bij jouw club.' }, { status: 403 }) }
    }
  }
  return { payload }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const playerId = Number(id)
  if (!Number.isFinite(playerId)) return Response.json({ error: 'Ongeldige speler.' }, { status: 400 })

  let body: { name?: string; shirtNumber?: number | string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const auth = await authorizeForPlayer(req, playerId)
  if (auth.error) return auth.error
  const { payload } = auth

  const data: { name?: string; shirtNumber?: number } = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return Response.json({ error: 'Naam mag niet leeg zijn.' }, { status: 400 })
    data.name = name
  }
  if (body.shirtNumber !== undefined && body.shirtNumber !== '') {
    const n = Number(body.shirtNumber)
    if (!Number.isFinite(n) || n < 0) return Response.json({ error: 'Ongeldig rugnummer.' }, { status: 400 })
    data.shirtNumber = n
  }
  if (Object.keys(data).length === 0) return Response.json({ error: 'Niets te wijzigen.' }, { status: 400 })

  try {
    await payload.update({ collection: 'players', id: playerId, data, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message || 'Aanpassen mislukt.' }, { status: 400 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const playerId = Number(id)
  if (!Number.isFinite(playerId)) return Response.json({ error: 'Ongeldige speler.' }, { status: 400 })

  const auth = await authorizeForPlayer(req, playerId)
  if (auth.error) return auth.error
  const { payload } = auth

  try {
    await payload.delete({ collection: 'players', id: playerId, overrideAccess: true })
    return Response.json({ ok: true })
  } catch {
    // Meest voorkomend: de speler hangt al vast aan worpen/opstellingen van gespeelde wedstrijden.
    return Response.json(
      { error: 'Verwijderen lukt niet — deze speler komt al voor in een wedstrijd. Pas de naam/het nummer aan in plaats van te verwijderen.' },
      { status: 409 },
    )
  }
}
