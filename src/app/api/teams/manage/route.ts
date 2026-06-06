import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Dubbele/test-ploegen opkuisen (enkel federatie/admin):
//  • action 'delete' (of geen action, voor compat): de ploeg verwijderen, optioneel met haar spelers.
//  • action 'merge': een dubbele ploeg samenvoegen met een andere — spelers en wedstrijden
//    (thuis/uit) verhuizen naar de behouden ploeg, daarna wordt de dubbele verwijderd.
export async function POST(req: Request) {
  let body: { action?: string; teamId?: number; deletePlayers?: boolean; fromTeamId?: number; intoTeamId?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    if (body.action === 'merge') {
      const from = Number(body.fromTeamId)
      const into = Number(body.intoTeamId)
      if (!Number.isFinite(from) || !Number.isFinite(into)) return Response.json({ error: 'Ongeldige ploeg(en).' }, { status: 400 })
      if (from === into) return Response.json({ error: 'Kan een ploeg niet met zichzelf samenvoegen.' }, { status: 400 })

      // Spelers verhuizen naar de behouden ploeg.
      const movedPlayers = await payload
        .update({ collection: 'players', where: { team: { equals: from } }, data: { team: into }, overrideAccess: true })
        .then((res) => res.docs.length)
        .catch(() => 0)
      // Wedstrijden (thuis + uit) omhangen naar de behouden ploeg.
      const movedHome = await payload
        .update({ collection: 'matches', where: { homeTeam: { equals: from } }, data: { homeTeam: into }, overrideAccess: true })
        .then((res) => res.docs.length)
        .catch(() => 0)
      const movedAway = await payload
        .update({ collection: 'matches', where: { awayTeam: { equals: from } }, data: { awayTeam: into }, overrideAccess: true })
        .then((res) => res.docs.length)
        .catch(() => 0)

      await payload.delete({ collection: 'teams', id: from, overrideAccess: true })
      return Response.json({ ok: true, merged: true, movedPlayers, movedMatches: movedHome + movedAway })
    }

    // Verwijderen (standaard).
    const teamId = Number(body.teamId)
    if (!Number.isFinite(teamId)) return Response.json({ error: 'Ongeldige ploeg.' }, { status: 400 })

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
