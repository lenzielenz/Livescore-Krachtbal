import { authUser, hasRole, isFederationLevel, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Meerdere spelers in één keer toevoegen aan een ploeg.
export async function POST(req: Request) {
  let body: { teamId?: number; players?: { shirtNumber?: number; name?: string; birthDate?: string }[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  // Geboortedatum: dd/mm/jjjj, jjjj-mm-dd of enkel een geboortejaar (jjjj → 1 juli).
  const toBirthISO = (s: string): string | null => {
    const v = s.trim()
    if (!v) return null
    let m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    m = v.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    if (/^\d{4}$/.test(v)) return `${v}-07-01`
    return null
  }

  const teamId = Number(body.teamId)
  if (!Number.isFinite(teamId)) {
    return Response.json({ error: 'Kies eerst een ploeg.' }, { status: 400 })
  }
  const rows = (body.players ?? [])
    .map((p) => ({ name: String(p.name ?? '').trim(), shirtNumber: Number(p.shirtNumber), birthDate: toBirthISO(String(p.birthDate ?? '')) }))
    .filter((p) => p.name.length > 0 && Number.isFinite(p.shirtNumber))

  if (rows.length === 0) {
    return Response.json({ error: 'Geen geldige spelers ingevoerd.' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'club-beheerder', 'club-medewerker')) {
      return Response.json({ error: 'Enkel club-beheerder/federatie.' }, { status: 403 })
    }
    // Een club-beheerder mag enkel spelers toevoegen aan een ploeg van de eigen club.
    if (!isFederationLevel(user)) {
      const clubId = userClubId(user)
      const team = await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)
      const teamClub = team ? (typeof team.club === 'object' && team.club ? team.club.id : team.club) : null
      if (clubId == null || teamClub == null || String(teamClub) !== String(clubId)) {
        return Response.json({ error: 'Deze ploeg hoort niet bij jouw club.' }, { status: 403 })
      }
    }
    let created = 0
    for (const row of rows) {
      await payload.create({
        collection: 'players',
        data: { team: teamId, name: row.name, shirtNumber: row.shirtNumber, ...(row.birthDate ? { birthDate: row.birthDate } : {}) },
        overrideAccess: true,
      })
      created += 1
    }
    return Response.json({ created })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
