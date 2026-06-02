import { getPayloadClient } from '@/lib/payload-client'
import {
  advanceHalf,
  buildTournamentState,
  finishMatch,
  recordGoal,
  setClock,
  startMatch,
  undoGoal,
} from '@/lib/tournament-engine'

// Aantekenaar-acties voor één tornooiwedstrijd. Na elke actie geven we de verse tornooi-state terug
// zodat het aantekenscherm meteen kan updaten (de SSE-stream voedt de andere schermen).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  const { id, matchId: matchIdStr } = await params
  const tournamentId = Number(id)
  const matchId = Number(matchIdStr)
  if (!Number.isFinite(tournamentId) || !Number.isFinite(matchId)) {
    return Response.json({ error: 'Ongeldig id' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const action = String(body.action ?? '')
  try {
    const payload = await getPayloadClient()
    switch (action) {
      case 'start':
        await startMatch(payload, matchId)
        break
      case 'goal':
        await recordGoal(payload, matchId, body.side === 'away' ? 'away' : 'home', body.points === 2 ? 2 : 1)
        break
      case 'undo':
        await undoGoal(payload, matchId)
        break
      case 'clock':
        await setClock(payload, matchId, {
          running: body.running !== undefined ? Boolean(body.running) : undefined,
          seconds: body.seconds !== undefined ? Number(body.seconds) : undefined,
        })
        break
      case 'half':
        await advanceHalf(payload, matchId)
        break
      case 'finish':
        await finishMatch(payload, matchId, body.winner === 'home' ? 'home' : body.winner === 'away' ? 'away' : undefined)
        break
      default:
        return Response.json({ error: `Onbekende actie: ${action}` }, { status: 400 })
    }
    const state = await buildTournamentState(payload, tournamentId)
    return Response.json({ state })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
