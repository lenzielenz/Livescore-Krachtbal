import { canAnalyse, hasRole, isClubStaff, isFederationLevel, userClubId } from '@/lib/access'
import { authUser, mayScoreMatch } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { POSITION_OPTIONS } from '@/collections/Players'

type Position = (typeof POSITION_OPTIONS)[number]['value']
const isPosition = (v: unknown): v is Position => typeof v === 'string' && POSITION_OPTIONS.some((o) => o.value === v)

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Manueel een speler toevoegen aan een ploeg vanuit de scoreopnemer (handig voor analyse of
// wanneer de tegenstander nog niet in het systeem staat). Enkel een gemachtigde aantekenaar.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const side = body.side === 'away' ? 'away' : body.side === 'home' ? 'home' : null
  const name = String(body.name ?? '').trim()
  const shirtNumber = Number(body.shirtNumber)
  if (!side) return Response.json({ error: 'Kies thuis of uit.' }, { status: 400 })
  if (!name) return Response.json({ error: 'Naam is verplicht.' }, { status: 400 })
  if (!Number.isFinite(shirtNumber) || shirtNumber < 0) return Response.json({ error: 'Geef een geldig rugnummer.' }, { status: 400 })
  // Positie is optioneel voor een snelle competitie-toevoeging, maar verplicht bij een
  // analysewedstrijd (de positie voedt de analyse — zie hieronder).
  if (body.position !== undefined && !isPosition(body.position)) return Response.json({ error: 'Kies een geldige positie.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!(await mayScoreMatch(payload, user, matchId))) {
      return Response.json(
        { error: user ? 'Geen rechten om deze wedstrijd aan te tekenen.' : 'Niet ingelogd.' },
        { status: user ? 403 : 401 },
      )
    }

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    const teamId = side === 'home' ? rel(match.homeTeam) : rel(match.awayTeam)
    if (teamId == null) return Response.json({ error: 'Ploeg niet gevonden.' }, { status: 400 })

    // Dubbel rugnummer binnen dezelfde ploeg vermijden.
    const dup = await payload.find({
      collection: 'players',
      where: { and: [{ team: { equals: teamId } }, { shirtNumber: { equals: shirtNumber } }] },
      limit: 1,
    })
    if (dup.totalDocs > 0) {
      return Response.json({ error: `Rugnummer ${shirtNumber} bestaat al in deze ploeg.` }, { status: 409 })
    }

    // Bij een analysewedstrijd hoort de toegevoegde speler bij de analyse-database (privé per
    // eigenaar), niet bij de competitie-roster. Zo lekt een analyse-toevoeging nooit in de competitie.
    // Owner: bij voorkeur de eigenaar van de wedstrijd; val terug op de (gemachtigde) gebruiker, zodat
    // er nooit een eigenaarloze (en dus onzichtbare/onbeheerbare) analyse-speler ontstaat.
    const isAnalyse = Boolean((match as { analyseOnly?: boolean }).analyseOnly)
    const owner = isAnalyse
      ? (rel((match as { analyseOwner?: unknown }).analyseOwner) ?? (canAnalyse(user) ? Number(user!.id) : null))
      : null
    // Een speler toevoegen aan een COMPETITIEploeg wijzigt die ploeg voor heel het seizoen. In
    // supportersmodus mag elke ingelogde bezoeker aantekenen, maar daarom nog geen leden aanmaken:
    // dat blijft bij de federatie, de scheidsrechter of de staf van de club van die ploeg.
    if (!isAnalyse && !isFederationLevel(user) && !hasRole(user, 'scheidsrechter')) {
      const team = await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)
      const eigen = userClubId(user)
      const vanEigenClub = eigen != null && String(rel(team?.club)) === String(eigen)
      if (!vanEigenClub || !isClubStaff(user)) {
        return Response.json(
          { error: 'Een speler toevoegen aan deze ploeg kan enkel de club zelf, de scheidsrechter of de federatie.' },
          { status: 403 },
        )
      }
    }
    if (isAnalyse && owner == null) {
      return Response.json({ error: 'Analysewedstrijd zonder eigenaar.' }, { status: 400 })
    }
    // Bij een analysewedstrijd moet een nieuwe speler meteen een positie krijgen — die voedt de
    // analyse (vanger-suggestie, ploegrapport per positie). Voor een gewone wedstrijd is ze optioneel.
    if (isAnalyse && !isPosition(body.position)) {
      return Response.json({ error: 'Kies een positie voor deze speler.' }, { status: 400 })
    }
    const created = await payload.create({
      collection: 'players',
      data: {
        name,
        shirtNumber,
        team: teamId,
        ...(isPosition(body.position) ? { position: body.position } : {}),
        ...(isAnalyse ? { analyseOnly: true, analyseOwner: owner } : {}),
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, player: { id: created.id, name, shirtNumber, teamId, position: isPosition(body.position) ? body.position : null } })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
