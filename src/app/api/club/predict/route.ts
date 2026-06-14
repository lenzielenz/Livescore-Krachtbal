import { authUser, userClubId } from '@/lib/api-auth'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { countUserWeekendPredictions, LIVE_PRONOSTIEK_MAX_PER_WEEKEND } from '@/lib/pronostiek-weekend'
import { reeksHalfDurationSeconds, type Reeks } from '@/lib/reeksen'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

type PredEntry = { userId: number; name: string; clubId: number | null; home: number; away: number; at: number; weight: number }

// Eén score-voorspelling van een clublid wegschrijven (upsert per persoon). Enkel vóór de aftrap
// (status 'scheduled') en enkel voor wedstrijden van de eigen club.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`predict:${ip}`, Number(process.env.PREDICT_MAX_PER_SEC) || 10, 1000)) {
    return Response.json({ error: 'Te veel verzoeken.' }, { status: 429 })
  }

  let body: { matchId?: number; home?: number; away?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const matchId = Number(body.matchId)
  const home = Math.round(Number(body.home))
  const away = Math.round(Number(body.away))
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 199 || away > 199) {
    return Response.json({ error: 'Geef een geldige uitslag (0–199).' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const rawClub = userClubId(user)
    const clubId = rawClub != null && Number.isFinite(Number(rawClub)) ? Number(rawClub) : null
    if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 403 })

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    if (!match || match.analyseOnly || (match as { isDemo?: boolean }).isDemo) {
      return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    }
    // Voorspellen kan vóór én tijdens de match (iedereen mag meedoen) — enkel niet meer na afloop.
    if (match.status !== 'scheduled' && match.status !== 'live') {
      return Response.json({ error: 'De wedstrijd is afgelopen — voorspellen kan niet meer.' }, { status: 409 })
    }
    // Elke competitiewedstrijd mag voorspeld worden (je kan via een pool uitgenodigd zijn voor de
    // matchen van een andere ploeg/club). De klassementen filteren toch op club of pool.

    // Puntweging: vóór de aftrap volle waarde (1). Tijdens de match daalt ze met de speeltijd, met
    // een bodem van 0,1 zodat een late voorspelling nog meetelt — we willen dat iedereen meedoet.
    let weight = 1
    if (match.status === 'live') {
      try {
        const st = await buildMatchState(payload, matchId)
        const halfSec = reeksHalfDurationSeconds((match as { reeks?: Reeks }).reeks as Reeks)
        const total = Math.max(1, 2 * halfSec)
        const elapsed = Math.max(0, (st.match.currentHalf - 1) * halfSec + st.match.clockSeconds)
        const frac = Math.min(1, elapsed / total)
        weight = Math.max(0.1, Math.round((1 - frac) * 100) / 100)
      } catch {
        weight = 0.5 // kon de klok niet lezen → halve waarde als veilige tussenstand
      }
    }

    const userId = Number((user as { id: number }).id)
    const name = String((user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'Lid')
    const existing = Array.isArray(match.scorePredictions) ? (match.scorePredictions as PredEntry[]) : []
    // Eenmaal doorgegeven, staat de voorspelling vast — niet meer te wijzigen (dat maakt het spannend).
    if (existing.some((p) => Number(p?.userId) === userId)) {
      return Response.json({ error: 'Je hebt al voorspeld voor deze wedstrijd — dat staat vast.' }, { status: 409 })
    }
    // Weekendlimiet: maximaal X wedstrijden per speelweekend (eerlijk globaal klassement).
    const used = await countUserWeekendPredictions(payload, userId, String((match as { date?: unknown }).date ?? ''), matchId)
    if (used >= LIVE_PRONOSTIEK_MAX_PER_WEEKEND) {
      return Response.json({ error: `Je ${LIVE_PRONOSTIEK_MAX_PER_WEEKEND} pronostieken voor dit weekend zijn op.` }, { status: 409 })
    }
    const next = [...existing, { userId, name, clubId, home, away, at: Date.now(), weight }]

    await payload.update({ collection: 'matches', id: matchId, data: { scorePredictions: next }, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
