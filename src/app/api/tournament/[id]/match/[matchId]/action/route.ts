import { isFederationLevel, magTornooiAantekenen } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { withLock } from '@/lib/async-mutex'
import { getPayloadClient } from '@/lib/payload-client'
import { isSupportersMode } from '@/lib/score-mode'
import { castVote, claimScorer, mayClaim, mayVote, recordContribution, voteWindowOpen } from '@/lib/score-trust'
import { readMatchTrust, userTrustScore, writeMatchTrust } from '@/lib/score-trust-store'
import {
  advanceHalf,
  assignVeld,
  buildTournamentState,
  finishMatch,
  matchResetImpact,
  planMatch,
  reopenMatch,
  resetMatch,
  recordCross,
  recordGoal,
  recordRefereeStop,
  recordTimeout,
  setClock,
  startMatch,
  swapSides,
  undoGoal,
} from '@/lib/tournament-engine'

/**
 * Wat een supporter in supporters-modus mag: de wedstrijd meetellen. Dus starten, scoren,
 * terugnemen, klok, helft, kruisjes, minuten en beëindigen — plus bevestigen of betwisten.
 *
 * Wat er níét in staat is even belangrijk: plannen, een veld toewijzen en kanten wisselen zijn
 * dagorganisatie, en 'reopen'/'reset' zijn correcties op andermans werk. Dezelfde grens als bij een
 * gewone wedstrijd, waar de supporters-modus wegvalt zodra het om corrigeren gaat (mayCorrectMatch).
 */
const SUPPORTER_ACTIES = new Set([
  'start',
  'goal',
  'undo',
  'refstop',
  'cross',
  'timeout',
  'clock',
  'half',
  'finish',
  'bevestig',
  'betwist',
])

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

    // Wie mag hier iets aan veranderen: de organisatie (federatie/admin), de aangestelde
    // scheidsrechters, wie van de admin aantekenrechten kreeg — en, zodra het platform in
    // supporters-modus staat, élke ingelogde bezoeker. Zie magTornooiAantekenen.
    // Let op: élk vers lid krijgt standaard de basisrol 'scorekeeper' — die volstaat hier niet.
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const supporters = await isSupportersMode(payload)
    if (!magTornooiAantekenen(user, supporters)) {
      return Response.json({ error: 'Geen aantekenrechten voor tornooien.' }, { status: 403 })
    }
    // Is deze gebruiker enkel binnen dankzij de supporters-modus, dan geldt de vertrouwenslaag:
    // één iemand telt mee, de rest bevestigt of betwist. Wie een echt aantekenrecht heeft
    // (organisatie, scheidsrechter, vrijwilliger achter de tafel) gaat daar niet door.
    const viaSupporters = supporters && !magTornooiAantekenen(user, false)
    if (viaSupporters && !SUPPORTER_ACTIES.has(action)) {
      return Response.json({ error: 'Enkel de organisatie kan dit aanpassen.' }, { status: 403 })
    }
    const userId = Number(user.id)
    const userNaam = String((user as { name?: unknown }).name ?? (user as { email?: unknown }).email ?? 'Supporter')

    // Bevestigen of betwisten van de stand: enkel in supporters-modus, en enkel door wie niet
    // zelf aan het meetellen is (dat zou een handtekening onder je eigen werk zijn).
    if (action === 'bevestig' || action === 'betwist') {
      if (!supporters) {
        return Response.json({ error: 'Bevestigen kan enkel in supporters-modus.' }, { status: 400 })
      }
      return await withLock(`tmatch:${matchId}`, async () => {
        const wedstrijd = await payload
          .findByID({ collection: 'tournament-matches', id: matchId, depth: 0, overrideAccess: true })
          .catch(() => null)
        if (!wedstrijd) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
        const trust = await readMatchTrust(payload, matchId, 'tournament-matches')
        // Tekent de organisatie deze wedstrijd aan (niemand claimde ze), dan valt er niets te
        // bevestigen: die stand komt van de tafel. Anders stapelen er stemmen op die nergens
        // getoond worden.
        if (trust.scorerId == null) {
          return Response.json({ error: 'Deze stand komt van de organisatie.' }, { status: 400 })
        }
        if (!mayVote(trust, userId)) {
          return Response.json({ error: 'Je telt zelf mee bij deze wedstrijd.' }, { status: 400 })
        }
        // Stemmen kan tijdens de wedstrijd en nog een dag erna; daarna staat de stand vast.
        //
        // Een tornooiwedstrijd heeft geen 'beëindigd op'-veld, dus nemen we de laatste
        // aantekenactie van wie meetelde als eindmoment. Bewust níét `updatedAt`: elke stem is
        // zelf een update, dus daarmee zou het venster bij elke stem opnieuw beginnen te lopen.
        const status = String((wedstrijd as { status?: unknown }).status ?? '')
        const laatste = trust.lastActiveAt != null ? new Date(trust.lastActiveAt).toISOString() : null
        if (!voteWindowOpen(status, laatste)) {
          return Response.json({ error: 'De stand van deze wedstrijd staat al vast.' }, { status: 400 })
        }
        const trustScore = await userTrustScore(payload, userId)
        await writeMatchTrust(
          payload,
          matchId,
          castVote(trust, { id: userId, name: userNaam, trust: trustScore }, action === 'bevestig' ? 'confirm' : 'dispute'),
          'tournament-matches',
        )
        const state = await buildTournamentState(payload, tournamentId)
        return Response.json({ state })
      })
    }

    // Serialiseer mutaties op dezelfde tornooiwedstrijd (voorkomt verloren doelpunten, AUDIT §2).
    return await withLock(`tmatch:${matchId}`, async () => {
    // Supporter die meetelt: eerst de wedstrijd claimen. Telt er al iemand anders mee en is die
    // nog actief, dan blijft het bij bevestigen of betwisten — anders krijg je twee mensen die
    // om beurten een andere stand doorgeven. Een claim vervalt vanzelf na lange stilte, zodat
    // een lege batterij een wedstrijd nooit blokkeert (zie score-trust.ts).
    let trust = viaSupporters ? await readMatchTrust(payload, matchId, 'tournament-matches') : null
    if (viaSupporters && trust) {
      if (!mayClaim(trust, userId)) {
        return Response.json(
          { error: `${trust.scorerName ?? 'Iemand anders'} telt deze wedstrijd al mee. Je kan de stand wel bevestigen of betwisten.` },
          { status: 403 },
        )
      }
      if (trust.scorerId !== userId) {
        trust = claimScorer(trust, { id: userId, name: userNaam, trust: await userTrustScore(payload, userId) })
      }
    }
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
      case 'wissel':
        // Thuis- en uitploeg van plaats wisselen — kan enkel vóór de start.
        await swapSides(payload, matchId)
        break
      case 'veld':
        // Wedstrijd aan een veld toewijzen (of loskoppelen met null).
        await assignVeld(payload, matchId, body.veld == null || body.veld === '' ? null : Number(body.veld))
        break
      case 'finish':
        await finishMatch(payload, matchId, body.winner === 'home' ? 'home' : body.winner === 'away' ? 'away' : undefined)
        break
      case 'reopen':
        await reopenMatch(payload, matchId)
        break
      case 'reset': {
        // Terugzetten op "nog niet gestart": er werd te vroeg gestart, deze reeks moet nog beginnen.
        // De ingevoerde doelpunten gaan mee weg, dus zolang er al iets staat blijft dit voorbehouden
        // aan de organisatie; een lege, per ongeluk gestarte wedstrijd zet de tafel zelf recht.
        const { doelpunten } = await matchResetImpact(payload, matchId)
        if (doelpunten > 0 && !isFederationLevel(user)) {
          return Response.json(
            { error: `Er staan al ${doelpunten} doelpunten ingevoerd. Enkel de organisatie kan deze wedstrijd terugzetten.` },
            { status: 403 },
          )
        }
        await resetMatch(payload, matchId)
        break
      }
      default:
        return Response.json({ error: `Onbekende actie: ${action}` }, { status: 400 })
    }
    // De actie is gelukt: pas nu de bijdrage boeken, zodat een geweigerde actie geen claim
    // achterlaat op een wedstrijd waar niets gebeurde.
    if (viaSupporters && trust) {
      await writeMatchTrust(
        payload,
        matchId,
        recordContribution(trust, { id: userId, name: userNaam }),
        'tournament-matches',
      )
    }
    const state = await buildTournamentState(payload, tournamentId)
    return Response.json({ state })
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
