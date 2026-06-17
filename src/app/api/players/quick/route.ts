import { authUser, hasRole, isFederationLevel, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').trim()

// Snel een spelerslijst aanvullen voor een ploeg: enkel namen ingeven, rugnummers worden
// automatisch toegekend. Reeds bestaande namen in de ploeg worden overgeslagen (geen dubbels).
export async function POST(req: Request) {
  let body: { teamId?: number; names?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const teamId = Number(body.teamId)
  if (!Number.isFinite(teamId)) return Response.json({ error: 'Kies eerst een ploeg.' }, { status: 400 })

  const names = (Array.isArray(body.names) ? body.names : [])
    .map((n) => String(n ?? '').replace(/\s+/g, ' ').trim())
    .filter((n) => n.length > 0)
  if (names.length === 0) return Response.json({ error: 'Geef minstens één naam in.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'club-beheerder', 'club-medewerker')) {
      return Response.json({ error: 'Enkel club-beheerder/federatie.' }, { status: 403 })
    }

    // Club-beheerder mag enkel spelers toevoegen aan een ploeg van de eigen club.
    const team = await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)
    if (!team) return Response.json({ error: 'Ploeg niet gevonden.' }, { status: 404 })
    if (!isFederationLevel(user)) {
      const clubId = userClubId(user)
      const teamClub = typeof team.club === 'object' && team.club ? team.club.id : team.club
      if (clubId == null || teamClub == null || String(teamClub) !== String(clubId)) {
        return Response.json({ error: 'Deze ploeg hoort niet bij jouw club.' }, { status: 403 })
      }
    }

    // Bestaande spelers van de ploeg → bepaal het volgende rugnummer + sla bestaande namen over.
    const existing = await payload
      .find({ collection: 'players', where: { team: { equals: teamId } }, depth: 0, limit: 2000 })
      .catch(() => ({ docs: [] as { name?: string; shirtNumber?: number }[] }))
    const have = new Set(existing.docs.map((p) => norm(String(p.name ?? ''))))
    let nextNr = existing.docs.reduce((mx, p) => Math.max(mx, Number(p.shirtNumber) || 0), 0) + 1

    // Ook binnen dezelfde invoer ontdubbelen.
    const seen = new Set<string>()
    let created = 0
    let skipped = 0
    for (const name of names) {
      const key = norm(name)
      if (have.has(key) || seen.has(key)) {
        skipped += 1
        continue
      }
      seen.add(key)
      await payload.create({ collection: 'players', data: { team: teamId, name, shirtNumber: nextNr }, overrideAccess: true })
      nextNr += 1
      created += 1
    }
    return Response.json({ ok: true, created, skipped })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
