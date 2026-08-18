import { authUser, mayScoreMatch } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { POSITION_OPTIONS } from '@/collections/Players'

type Position = (typeof POSITION_OPTIONS)[number]['value']
const isPosition = (v: unknown): v is Position => typeof v === 'string' && POSITION_OPTIONS.some((o) => o.value === v)

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Positie van een speler wijzigen — rechtstreeks vanuit de spelerslijst i.p.v. enkel bij het
// (eenmalig) toevoegen. De positie zit op de speler zelf (niet per wedstrijd), dus dit geldt ook
// voor volgende wedstrijden — net als de rest van de spelersgegevens. Zelfde rechten als toevoegen.
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

  const playerId = Number(body.playerId)
  if (!Number.isFinite(playerId)) return Response.json({ error: 'Ongeldige speler.' }, { status: 400 })
  if (!isPosition(body.position)) return Response.json({ error: 'Kies een geldige positie.' }, { status: 400 })

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
    const teamIds = [rel(match.homeTeam), rel(match.awayTeam)].filter((v): v is number => v != null)

    const player = await payload.findByID({ collection: 'players', id: playerId, depth: 0 }).catch(() => null)
    if (!player) return Response.json({ error: 'Speler niet gevonden.' }, { status: 404 })
    const playerTeamId = rel((player as { team?: unknown }).team)
    if (playerTeamId == null || !teamIds.includes(playerTeamId)) {
      return Response.json({ error: 'Deze speler hoort niet bij deze wedstrijd.' }, { status: 403 })
    }

    await payload.update({ collection: 'players', id: playerId, data: { position: body.position }, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
