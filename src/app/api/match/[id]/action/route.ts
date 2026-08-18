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
  recordPass,
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
import { notifyGoalScored } from '@/lib/match-notify'
import { missingSteps } from '@/lib/match-readiness'
import { getPayloadClient } from '@/lib/payload-client'
import { noteContribution } from '@/lib/score-trust-store'
import {
  adjustRefereeStop,
  adjustSimpleCross,
  adjustSimpleTimeout,
  advanceSimpleHalf,
  recordSimpleGoal,
  reportFinalResult,
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
    // Idempotentie (offline-hardening): elke muterende actie draagt een client-gegenereerde `opId`.
    // Is die al verwerkt, dan geven we exact dezelfde response terug zónder de actie opnieuw toe te
    // passen. Cruciaal bij wegvallend netwerk: de offline-wachtrij levert at-least-once, dus een
    // worp/doelpunt/undo die de server al verwerkte (maar waarvan het antwoord verloren ging) mag
    // bij heruitzending niet dubbel tellen. Acties zonder opId (oudere clients) lopen ongewijzigd.
    const opId = typeof body.opId === 'string' && body.opId ? body.opId : null
    if (opId) {
      const prior = await payload.find({
        collection: 'processed-ops',
        where: { opId: { equals: opId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const seen = prior.docs[0] as { response?: unknown } | undefined
      if (seen) return Response.json(seen.response ?? { ok: true, deduped: true })
    }

    let result: unknown
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
        result = await startMatch(payload, matchId, Number(body.startingTeamId))
        break
      }
      case 'throw': {
        const r = await recordThrow(payload, {
          matchId,
          playerId: Number(body.playerId),
          type: body.type === 'rug' ? 'rug' : 'nek',
          point: { x: Number(body.x), y: Number(body.y) },
          tapCount: body.tapCount === 2 ? 2 : 1,
          touchedBeforeOut: Boolean(body.touchedBeforeOut),
          originX: body.originX !== undefined && body.originX !== null ? Number(body.originX) : undefined,
          gameClock: body.gameClock !== undefined ? Number(body.gameClock) : undefined,
          caughtById: body.caughtById !== undefined && body.caughtById !== null ? Number(body.caughtById) : undefined,
          tappedById: body.tappedById !== undefined && body.tappedById !== null ? Number(body.tappedById) : undefined,
          actorId,
        })
        // Doelpunt → fans van de scorende club een push sturen (fire-and-forget).
        if (r.outcome === 'goal') notifyGoalScored({ matchId, playerId: Number(body.playerId) })
        result = r
        break
      }
      case 'pass':
        // Pass (§6.10): verbruikt geen werpbeurt, verlegt enkel de werpplaats.
        result = await recordPass(payload, {
          matchId,
          playerId: Number(body.playerId),
          point: { x: Number(body.x), y: Number(body.y) },
          gameClock: body.gameClock !== undefined ? Number(body.gameClock) : undefined,
          actorId,
        })
        break
      case 'undo':
        result = await undoLastThrow(payload, matchId)
        break
      case 'clock':
        result = await setClock(payload, matchId, {
          running: body.running !== undefined ? Boolean(body.running) : undefined,
          seconds: body.seconds !== undefined ? Number(body.seconds) : undefined,
        })
        break
      case 'half':
        result = await advanceHalf(payload, matchId)
        break
      case 'endhalf':
        result = await endHalf(payload, matchId)
        break
      case 'starthalf':
        result = await startNextHalf(payload, matchId)
        break
      case 'finish':
        result = await finishMatch(payload, matchId)
        break
      case 'reopen':
        // Een afgesloten wedstrijd heropenen voor correcties — enkel federatie/admin.
        if (!isFederationLevel(user)) {
          return Response.json({ error: 'Enkel de federatie kan een wedstrijd heropenen.' }, { status: 403 })
        }
        result = await reopenMatch(payload, matchId)
        break
      case 'timeout':
        result = await recordTimeout(payload, matchId, Number(body.teamId), actorId)
        break
      case 'referee_stop':
        result = await recordRefereeStop(payload, matchId, actorId)
        break
      case 'freethrow':
        result = await startFreeThrow(payload, matchId, Number(body.teamId))
        break
      case 'substitute':
        result = await substitute(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.outPlayerId), Number(body.inPlayerId))
        break
      case 'setlineup':
        result = await setLineup(
          payload,
          matchId,
          body.side === 'away' ? 'away' : 'home',
          Array.isArray(body.playerIds) ? body.playerIds.map(Number) : [],
        )
        break
      case 'setcaptain':
        result = await setCaptain(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.playerId))
        break
      // ── Simpele aantekenmodus (snelscoremodus): +1/+2 zonder veldschema ──
      case 'simplestart':
        result = await startSimpleMatch(payload, matchId)
        break
      case 'simplegoal': {
        const goalSide = body.side === 'away' ? 'away' : 'home'
        const res = await recordSimpleGoal(payload, matchId, goalSide, body.points === 2 ? 2 : 1, {
          id: Number(body.playerId),
          number: body.shirtNumber !== undefined ? Number(body.shirtNumber) : undefined,
          name: typeof body.playerName === 'string' ? body.playerName : undefined,
        })
        notifyGoalScored({ matchId, side: goalSide })
        result = res
        break
      }
      case 'simpleundo':
        result = await undoSimpleGoal(payload, matchId)
        break
      case 'simplecross':
        result = await adjustSimpleCross(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.delta) || 1)
        break
      case 'simpletimeout':
        result = await adjustSimpleTimeout(payload, matchId, body.side === 'away' ? 'away' : 'home', Number(body.delta) || 1)
        break
      case 'simplerefstop':
        result = await adjustRefereeStop(payload, matchId, Number(body.delta) || 1)
        break
      case 'simplehalf':
        result = await advanceSimpleHalf(payload, matchId)
        break
      // Wedstrijd gedaan zonder live-notatie: een supporter geeft achteraf de eindstand door.
      case 'reportresult':
        result = await reportFinalResult(payload, matchId, Number(body.home), Number(body.away))
        break
      default:
        return Response.json({ error: `Onbekende actie: ${action}` }, { status: 400 })
    }

    // Vertrouwenslaag: onthoud wie deze wedstrijd aantekent. De eerste die scoort wordt official
    // scorer; elke volgende actie houdt die claim levend (zie score-trust.ts). Fire-and-forget.
    if (actorId != null) {
      noteContribution(matchId, { id: actorId, name: String((user as { name?: unknown })?.name ?? '').trim() || 'Supporter' })
    }

    // Bewaar de response onder de opId, zodat een herverzonden actie (zie boven) niet dubbel telt.
    // Een unieke botsing (parallel al verwerkt) negeren we — de actie is dan al toegepast.
    if (opId) {
      try {
        await payload.create({
          collection: 'processed-ops',
          data: { match: matchId, opId, response: result as Record<string, unknown> },
          overrideAccess: true,
        })
      } catch {
        /* unieke index-botsing = al verwerkt; negeren */
      }
    }
    return Response.json(result)
    }))
  } catch (err) {
    const msg = (err as Error).message
    // Database-fouten (bv. een query die faalt tijdens een deploy/lock) bevatten de ruwe SQL —
    // die hoort niet in de UI. Log volledig server-side, toon de aantekenaar een korte uitleg.
    if (/Failed query|timeout|ECONNREFUSED|terminat/i.test(msg)) {
      console.error('match-action databasefout:', err)
      return Response.json(
        { error: 'Bewaren mislukt (tijdelijke databasefout) — probeer het meteen opnieuw.' },
        { status: 503 },
      )
    }
    return Response.json({ error: msg }, { status: 400 })
  }
}
