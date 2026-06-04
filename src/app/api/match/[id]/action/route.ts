import { isFederationLevel } from '@/lib/access'
import { authUser, mayScoreMatch } from '@/lib/api-auth'
import { withLock } from '@/lib/async-mutex'
import { withDbLock } from '@/lib/db-lock'
import {
  advanceHalf,
  endHalf,
  finishMatch,
  recordRefereeStop,
  startNextHalf,
  recordThrow,
  recordTimeout,
  reopenMatch,
  setCaptain,
  setClock,
  setLineup,
  startFreeThrow,
  startMatch,
  substitute,
  undoLastThrow,
} from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { missingSteps } from '@/lib/match-readiness'
import { getPayloadClient } from '@/lib/payload-client'
import {
  adjustRefereeStop,
  adjustSimpleCross,
  adjustSimpleTimeout,
  advanceSimpleHalf,
  recordSimpleGoal,
  startSimpleMatch,
  undoSimpleGoal,
} from '@/lib/simple-match-engine'

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

    // Auth: enkel een gemachtigde aantekenaar mag muteren. De engine draait overrideAccess,
    // dus dit is de enige beschermlaag (zie AUDIT-2026-06.md §4).
    const user = await authUser(payload, req)
    if (!(await mayScoreMatch(payload, user, matchId))) {
      return Response.json(
        { error: user ? 'Geen rechten om deze wedstrijd aan te tekenen.' : 'Niet ingelogd.' },
        { status: user ? 403 : 401 },
      )
    }

    // Serialiseer alle mutaties op dezelfde wedstrijd: in-process mutex (zelfde instance) +
    // Postgres advisory lock (cross-instance). Voorkomt throw/undo-races (AUDIT §2).
    const actorId = typeof user?.id === 'number' ? user.id : undefined
    return await withLock(`match:${matchId}`, () => withDbLock(payload, 'match', matchId, async () => {
    switch (action) {
      case 'start': {
        // Startcontrole: opstellingen + scheidsrechtersakkoord (of demo). Een admin/federatie
        // mag de controle bewust overslaan via een testknop (allowUnready).
        const readiness = await getMatchReadiness(payload, matchId)
        if (!readiness.ready) {
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
          actorId,
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
      case 'reopen':
        // Een afgesloten wedstrijd heropenen voor correcties — enkel federatie/admin.
        if (!isFederationLevel(user)) {
          return Response.json({ error: 'Enkel de federatie kan een wedstrijd heropenen.' }, { status: 403 })
        }
        return Response.json(await reopenMatch(payload, matchId))
      case 'timeout':
        return Response.json(await recordTimeout(payload, matchId, Number(body.teamId), actorId))
      case 'referee_stop':
        return Response.json(await recordRefereeStop(payload, matchId, actorId))
      case 'freethrow':
        return Response.json(await startFreeThrow(payload, matchId, Number(body.teamId)))
      case 'substitute':
        return Response.json(
          await substitute(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.outPlayerId), Number(body.inPlayerId)),
        )
      case 'setlineup':
        return Response.json(
          await setLineup(
            payload,
            matchId,
            body.side === 'away' ? 'away' : 'home',
            Array.isArray(body.playerIds) ? body.playerIds.map(Number) : [],
          ),
        )
      case 'setcaptain':
        return Response.json(
          await setCaptain(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.playerId)),
        )
      // ── Simpele aantekenmodus (snelscoremodus): +1/+2 zonder veldschema ──
      case 'simplestart':
        return Response.json(await startSimpleMatch(payload, matchId))
      case 'simplegoal':
        return Response.json(
          await recordSimpleGoal(payload, matchId, body.side === 'away' ? 'away' : 'home', body.points === 2 ? 2 : 1, {
            id: Number(body.playerId),
            number: body.shirtNumber !== undefined ? Number(body.shirtNumber) : undefined,
            name: typeof body.playerName === 'string' ? body.playerName : undefined,
          }),
        )
      case 'simpleundo':
        return Response.json(await undoSimpleGoal(payload, matchId))
      case 'simplecross':
        return Response.json(
          await adjustSimpleCross(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.delta) || 1),
        )
      case 'simpletimeout':
        return Response.json(
          await adjustSimpleTimeout(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.delta) || 1),
        )
      case 'simplerefstop':
        return Response.json(await adjustRefereeStop(payload, matchId, Number(body.delta) || 1))
      case 'simplehalf':
        return Response.json(await advanceSimpleHalf(payload, matchId))
      default:
        return Response.json({ error: `Onbekende actie: ${action}` }, { status: 400 })
    }
    }))
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
