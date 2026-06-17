import { authUser, hasRole, isFederationLevel, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { TRAINING_METRICS } from '@/lib/training-metrics'

// Een trainingmeting opslaan (admin/federatie of club-beheerder). Club-beheerders enkel voor
// spelers van de eigen club. Metriekwaarden zijn optioneel (je meet niet altijd alles tegelijk).
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const spelerId = Number(body.speler)
  if (!Number.isFinite(spelerId)) return Response.json({ error: 'Kies een speler.' }, { status: 400 })

  // Datum: accepteer YYYY-MM-DD (date-input) of ISO; val terug op vandaag.
  const rawDatum = typeof body.datum === 'string' ? body.datum : ''
  const datum = rawDatum ? new Date(rawDatum) : new Date()
  if (Number.isNaN(datum.getTime())) return Response.json({ error: 'Ongeldige datum.' }, { status: 400 })

  // Enkel toegelaten metrieken, geparset naar getal (of weggelaten als leeg/ongeldig).
  const waarden: Record<string, number> = {}
  for (const m of TRAINING_METRICS) {
    const v = body[m.key]
    if (v === '' || v == null) continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) waarden[m.key] = n
  }
  if (Object.keys(waarden).length === 0) {
    return Response.json({ error: 'Vul minstens één meetwaarde in.' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'club-beheerder', 'club-medewerker')) {
      return Response.json({ error: 'Enkel club-beheerder/federatie.' }, { status: 403 })
    }

    // Een club-beheerder mag enkel metingen ingeven voor spelers van de eigen club.
    if (!isFederationLevel(user)) {
      const clubId = userClubId(user)
      const speler = await payload.findByID({ collection: 'players', id: spelerId, depth: 2 }).catch(() => null)
      const team = speler && typeof speler.team === 'object' ? speler.team : null
      const spelerClub = team && typeof team.club === 'object' && team.club ? team.club.id : (team?.club ?? null)
      if (clubId == null || spelerClub == null || String(spelerClub) !== String(clubId)) {
        return Response.json({ error: 'Deze speler hoort niet bij jouw club.' }, { status: 403 })
      }
    }

    const doc = await payload.create({
      collection: 'trainingmetingen',
      data: { speler: spelerId, datum: datum.toISOString(), ...waarden },
      overrideAccess: true,
    })
    return Response.json({ ok: true, id: doc.id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
