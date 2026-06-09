import { authUser, mayScoreMatch } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

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
    const isAnalyse = Boolean((match as { analyseOnly?: boolean }).analyseOnly)
    const owner = isAnalyse ? rel((match as { analyseOwner?: unknown }).analyseOwner) : null
    const created = await payload.create({
      collection: 'players',
      data: {
        name,
        shirtNumber,
        team: teamId,
        ...(isAnalyse ? { analyseOnly: true, ...(owner != null ? { analyseOwner: owner } : {}) } : {}),
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, player: { id: created.id, name, shirtNumber, teamId } })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
