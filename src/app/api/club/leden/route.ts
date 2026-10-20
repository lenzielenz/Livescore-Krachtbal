import { authUser, hasRole, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { ledenIndienen, lidOpslaan } from '@/lib/registratie-server'

// Ledenregistratie door de club (zie lib/registratie-server.ts):
//   POST { actie: 'opslaan', playerId?, teamId, voornaam, achternaam, birthDate, geslacht, email?, soortLid,
//          shirtNumber?, medischeKeuringOp? } → { ok, id }
//   POST { actie: 'indienen', playerIds: number[] } → { ok, ingediend, overgeslagen }
// Enkel clubstaf (club-beheerder/-medewerker), enkel voor de eigen club.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!hasRole(user, 'club-beheerder', 'club-medewerker')) {
    return Response.json({ error: 'Enkel de staf van een club beheert de leden.' }, { status: 403 })
  }
  const clubId = userClubId(user)
  if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  try {
    if (body.actie === 'indienen') {
      const ids = (Array.isArray(body.playerIds) ? body.playerIds : []).map(Number).filter(Number.isFinite)
      if (!ids.length) return Response.json({ error: 'Kies minstens één lid.' }, { status: 400 })
      const r = await ledenIndienen(payload, clubId, ids.slice(0, 200))
      return Response.json({ ok: true, ...r })
    }
    if (body.actie === 'opslaan') {
      const r = await lidOpslaan(payload, clubId, {
        playerId: body.playerId != null && body.playerId !== '' ? Number(body.playerId) : null,
        teamId: Number(body.teamId),
        voornaam: String(body.voornaam ?? ''),
        achternaam: String(body.achternaam ?? ''),
        birthDate: String(body.birthDate ?? ''),
        geslacht: String(body.geslacht ?? ''),
        email: body.email ? String(body.email) : null,
        soortLid: String(body.soortLid ?? 'speler'),
        shirtNumber: body.shirtNumber != null && body.shirtNumber !== '' ? Number(body.shirtNumber) : null,
        medischeKeuringOp: body.medischeKeuringOp ? String(body.medischeKeuringOp) : null,
      })
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status })
      return Response.json({ ok: true, id: r.id })
    }
    return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
