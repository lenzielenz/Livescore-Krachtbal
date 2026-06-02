import { isFederationLevel } from '@/lib/access'
import {
  advanceHalf,
  endHalf,
  finishMatch,
  recordRefereeStop,
  startNextHalf,
  recordThrow,
  recordTimeout,
  setClock,
  startFreeThrow,
  startMatch,
  substitute,
  undoLastThrow,
} from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { missingSteps } from '@/lib/match-readiness'
import { getPayloadClient } from '@/lib/payload-client'

// Eén POST-endpoint dat aantekenaar-acties dispatcht op het veld `action`.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) {
    return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })
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
      case 'start': {
        // Startcontrole: opstellingen + scheidsrechtersakkoord (of demo). Een admin/federatie
        // mag de controle bewust overslaan via een testknop (allowUnready).
        const readiness = await getMatchReadiness(payload, matchId)
        if (!readiness.ready) {
          const { user } = await payload.auth({ headers: req.headers }).catch(() => ({ user: null }))
          const mayBypass = isFederationLevel(user) && body.allowUnready === true
          if (!mayBypass) {
            return Response.json(
              { error: `Nog niet klaar om te starten: ${missingSteps(readiness).join(', ')}.`, readiness },
              { status: 409 },
            )
          }
        }
        return Response.json(await startMatch(payload, matchId, Number(body.startingTeamId)))
      }
      case 'throw': {
        const result = await recordThrow(payload, {
          matchId,
          playerId: Number(body.playerId),
          type: body.type === 'rug' ? 'rug' : 'nek',
          point: { x: Number(body.x), y: Number(body.y) },
          tapCount: body.tapCount === 2 ? 2 : 1,
          touchedBeforeOut: Boolean(body.touchedBeforeOut),
          gameClock: body.gameClock !== undefined ? Number(body.gameClock) : undefined,
        })
        return Response.json(result)
      }
      case 'undo':
        return Response.json(await undoLastThrow(payload, matchId))
      case 'clock':
        return Response.json(
          await setClock(payload, matchId, {
            running: body.running !== undefined ? Boolean(body.running) : undefined,
            seconds: body.seconds !== undefined ? Number(body.seconds) : undefined,
          }),
        )
      case 'half':
        return Response.json(await advanceHalf(payload, matchId))
      case 'endhalf':
        return Response.json(await endHalf(payload, matchId))
      case 'starthalf':
        return Response.json(await startNextHalf(payload, matchId))
      case 'finish':
        return Response.json(await finishMatch(payload, matchId))
      case 'timeout':
        return Response.json(await recordTimeout(payload, matchId, Number(body.teamId)))
      case 'referee_stop':
        return Response.json(await recordRefereeStop(payload, matchId))
      case 'freethrow':
        return Response.json(await startFreeThrow(payload, matchId, Number(body.teamId)))
      case 'substitute':
        return Response.json(
          await substitute(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.outPlayerId), Number(body.inPlayerId)),
        )
      default:
        return Response.json({ error: `Onbekende actie: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
