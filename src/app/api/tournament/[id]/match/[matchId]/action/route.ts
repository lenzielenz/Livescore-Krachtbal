import { authUser, requireRole } from '@/lib/api-auth'
import { withLock } from '@/lib/async-mutex'
import { getPayloadClient } from '@/lib/payload-client'
import {
  advanceHalf,
  buildTournamentState,
  finishMatch,
  planMatch,
  recordCross,
  recordGoal,
  recordRefereeStop,
  recordTimeout,
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

    const user = await authUser(payload, req)
    const denied = requireRole(user, 'scorekeeper', 'scheidsrechter')
    if (denied) return denied

    // Serialiseer mutaties op dezelfde tornooiwedstrijd (voorkomt verloren doelpunten, AUDIT §2).
    return await withLock(`tmatch:${matchId}`, async () => {
    switch (action) {
      case 'start':
        await startMatch(payload, matchId)
        break
      case 'goal':
        await recordGoal(
          payload,
          matchId,
          body.side === 'away' ? 'away' : 'home',
          body.points === 2 ? 2 : 1,
          body.playerId !== undefined && body.playerId !== null
            ? {
                id: Number(body.playerId),
                shirtNumber: body.shirtNumber !== undefined ? Number(body.shirtNumber) : undefined,
                name: typeof body.playerName === 'string' ? body.playerName : undefined,
              }
            : undefined,
        )
        break
      case 'undo':
        await undoGoal(payload, matchId)
        break
      case 'refstop':
        await recordRefereeStop(payload, matchId, Number(body.delta) < 0 ? -1 : 1)
        break
      case 'cross':
        await recordCross(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.delta) < 0 ? -1 : 1)
        break
      case 'timeout':
        await recordTimeout(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.delta) < 0 ? -1 : 1)
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
      case 'plan':
        await planMatch(payload, matchId, typeof body.plannedAt === 'string' && body.plannedAt ? body.plannedAt : null)
        break
      case 'finish':
        await finishMatch(payload, matchId, body.winner === 'home' ? 'home' : body.winner === 'away' ? 'away' : undefined)
        break
      default:
        return Response.json({ error: `Onbekende actie: ${action}` }, { status: 400 })
    }
    const state = await buildTournamentState(payload, tournamentId)
    return Response.json({ state })
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
