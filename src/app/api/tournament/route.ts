import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { TOURNAMENT_CATEGORIES, type TournamentCategory } from '@/lib/categories'
import { getPayloadClient } from '@/lib/payload-client'
import { createTournament } from '@/lib/tournament-engine'

// Maak een nieuw tornooi aan. Body: { name, category, method, slots }.
// `slots` is de geordende loting (lengte = macht van 2; null = bye). De client berekent de slots
// (toggle = geschud, manueel = door de gebruiker geschikt); de server bouwt het schema.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const category = String(body.category ?? '') as TournamentCategory
  const method = body.method === 'manual' ? 'manual' : 'auto'
  const format = body.format === 'roundrobin' ? 'roundrobin' : 'knockout'
  const slots = Array.isArray(body.slots)
    ? body.slots.map((s) => (typeof s === 'string' && s.trim() ? s.trim() : null))
    : []
  // Expliciete club-koppeling per ploeg (optioneel): [{ name, clubId }].
  const teamClubs = Array.isArray(body.teamClubs)
    ? body.teamClubs
        .map((t) => {
          const o = t as { name?: unknown; clubId?: unknown }
          const nm = typeof o?.name === 'string' ? o.name.trim() : ''
          const clubId = Number(o?.clubId)
          return nm && Number.isFinite(clubId) ? { name: nm, clubId } : null
        })
        .filter((t): t is { name: string; clubId: number } => t !== null)
    : []
  // Koppeling ploegnaam → echte ploeg (optioneel): [{ name, teamId }]. Hierdoor kan de
  // aantekentafel exact hetzelfde aantekenblad met de echte spelerslijst gebruiken.
  const teamTeams = Array.isArray(body.teamTeams)
    ? body.teamTeams
        .map((t) => {
          const o = t as { name?: unknown; teamId?: unknown }
          const nm = typeof o?.name === 'string' ? o.name.trim() : ''
          const teamId = Number(o?.teamId)
          return nm && Number.isFinite(teamId) ? { name: nm, teamId } : null
        })
        .filter((t): t is { name: string; teamId: number } => t !== null)
    : []

  if (!name) return Response.json({ error: 'Geef het tornooi een naam.' }, { status: 400 })
  if (!TOURNAMENT_CATEGORIES.includes(category)) return Response.json({ error: 'Ongeldige categorie.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    // Enkel de federatie/admin maakt bekers/tornooien aan; supporters kijken mee.
    if (!isFederationLevel(user)) {
      return Response.json({ error: 'Enkel de federatie kan een beker/tornooi aanmaken.' }, { status: user ? 403 : 401 })
    }
    const id = await createTournament(payload, {
      name,
      category,
      method,
      slots,
      format,
      teamClubs,
      teamTeams,
      toonOpLive: Boolean(body.toonOpLive),
      groep: typeof body.groep === 'string' ? body.groep : undefined,
      hostClub: Number.isFinite(Number(body.hostClub)) && Number(body.hostClub) > 0 ? Number(body.hostClub) : undefined,
      plannedTimes: Array.isArray(body.plannedTimes)
        ? body.plannedTimes.map((t) => (typeof t === 'string' && !Number.isNaN(new Date(t).getTime()) ? t : null))
        : undefined,
    })
    return Response.json({ id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
