import { authUser, hasRole, isFederationLevel, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { TRAINING_METRICS } from '@/lib/training-metrics'

const METRICS = TRAINING_METRICS.map((m) => m.key) as string[]

// Een trainingsdoel toevoegen of verwijderen. Admin/federatie of club-beheerder (enkel eigen club).
export async function POST(req: Request) {
  let body: { action?: string; id?: number; speler?: number; metriek?: string; doel?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'club-beheerder', 'club-medewerker')) {
      return Response.json({ error: 'Enkel club-beheerder/federatie.' }, { status: 403 })
    }

    // Club-beheerder mag enkel doelen voor spelers van de eigen club beheren.
    const ownsPlayer = async (playerId: number): Promise<boolean> => {
      if (isFederationLevel(user)) return true
      const clubId = userClubId(user)
      const speler = await payload.findByID({ collection: 'players', id: playerId, depth: 2 }).catch(() => null)
      const team = speler && typeof speler.team === 'object' ? speler.team : null
      const spelerClub = team && typeof team.club === 'object' && team.club ? team.club.id : (team?.club ?? null)
      return clubId != null && spelerClub != null && String(spelerClub) === String(clubId)
    }

    if (body.action === 'delete') {
      const id = Number(body.id)
      if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig doel.' }, { status: 400 })
      const doc = await payload.findByID({ collection: 'trainingdoelen', id, depth: 0 }).catch(() => null)
      const sp = doc ? (typeof doc.speler === 'object' ? doc.speler?.id : doc.speler) : null
      if (sp != null && !(await ownsPlayer(Number(sp)))) return Response.json({ error: 'Geen toegang tot deze speler.' }, { status: 403 })
      await payload.delete({ collection: 'trainingdoelen', id, overrideAccess: true })
      return Response.json({ ok: true })
    }

    // Toevoegen (action 'set' = upsert: vervangt een bestaand doel voor dezelfde speler+metriek,
    // zodat het trainingsplan z'n doelen kan wegschrijven zonder duplicaten).
    const speler = Number(body.speler)
    const metriek = String(body.metriek ?? '')
    const doel = Number(body.doel)
    if (!Number.isFinite(speler)) return Response.json({ error: 'Kies een speler.' }, { status: 400 })
    if (!METRICS.includes(metriek)) return Response.json({ error: 'Ongeldige meetwaarde.' }, { status: 400 })
    if (!Number.isFinite(doel) || doel <= 0) return Response.json({ error: 'Geef een geldige streefwaarde.' }, { status: 400 })
    if (!(await ownsPlayer(speler))) return Response.json({ error: 'Deze speler hoort niet bij jouw club.' }, { status: 403 })

    if (body.action === 'set') {
      const existing = await payload
        .find({ collection: 'trainingdoelen', where: { and: [{ speler: { equals: speler } }, { metriek: { equals: metriek } }] }, depth: 0, limit: 50, overrideAccess: true })
        .catch(() => ({ docs: [] as { id: number }[] }))
      for (const d of existing.docs) await payload.delete({ collection: 'trainingdoelen', id: (d as { id: number }).id, overrideAccess: true })
    }

    const doc = await payload.create({
      collection: 'trainingdoelen',
      data: { speler, metriek: metriek as 'worp4', doel },
      overrideAccess: true,
    })
    return Response.json({ ok: true, id: doc.id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
