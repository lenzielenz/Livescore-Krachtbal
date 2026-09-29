import { authUser, userClubId } from '@/lib/api-auth'
import { formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { activeTokens } from '@/lib/pronostiek-rad'
import { countUserWeekendPredictions, LIVE_PRONOSTIEK_MAX_PER_WEEKEND, pronostiekOpen, pronostiekOpenVanaf } from '@/lib/pronostiek-weekend'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

type PredEntry = { userId: number; name: string; clubId: number | null; home: number; away: number; at: number; weight: number; mult?: number }
type RadToken = { mult: number; wonAt: string; expiresAt: string }
type Power = { tokens?: RadToken[]; spinWeek?: string; spinsUsed?: number }

// Eén score-voorspelling wegschrijven (upsert per persoon). Elke ingelogde supporter mag meedoen
// (club niet vereist); voorspellen kan enkel vóór de aftrap — eens de wedstrijd bezig is (of
// afgelopen) ken je de uitslag al deels of helemaal, dus dan mag niet meer voorspeld worden.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`predict:${ip}`, Number(process.env.PREDICT_MAX_PER_SEC) || 10, 1000)) {
    return Response.json({ error: 'Te veel verzoeken.' }, { status: 429 })
  }

  let body: { matchId?: number; home?: number; away?: number; boosterMult?: number }
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
    // Een clubkoppeling is géén voorwaarde: iedereen met een account speelt mee in het globale
    // klassement. De club blijft wel mee opgeslagen (indien gekend) voor de club-klassementen.
    const rawClub = userClubId(user)
    const clubId = rawClub != null && Number.isFinite(Number(rawClub)) ? Number(rawClub) : null

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    if (!match || match.analyseOnly || (match as { isDemo?: boolean }).isDemo) {
      return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    }
    // Voorspellen kan enkel vóór de aftrap — eens de match bezig is (of afgelopen) is voorspellen
    // eigenlijk gewoon de uitslag natikken, dus dan sluiten we af.
    if (match.status !== 'scheduled') {
      return Response.json({ error: 'De wedstrijd is al gestart — voorspellen kan niet meer.' }, { status: 409 })
    }
    // De pronostiek opent zodra het vorige speelweekend afgelopen is (zondag om middernacht):
    // vanaf maandag 00:00 staat de hele komende speelweek open.
    const matchDateIso = String((match as { date?: unknown }).date ?? '')
    if (!pronostiekOpen(matchDateIso)) {
      const vanaf = formatDateTimeBE(pronostiekOpenVanaf(matchDateIso), { dateStyle: 'full' })
      return Response.json({ error: `De pronostiek voor deze wedstrijd opent op ${vanaf} om middernacht.` }, { status: 409 })
    }
    // Elke competitiewedstrijd mag voorspeld worden (je kan via een pool uitgenodigd zijn voor de
    // matchen van een andere ploeg/club). De klassementen filteren toch op club of pool.

    // Voorspellen kan enkel nog vóór de aftrap, dus de puntweging staat altijd op volle waarde.
    const weight = 1

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
    // Bonusrad-booster: de speler kiest welke gewonnen vermenigvuldiger hij op deze voorspelling
    // zet. We zoeken een nog-geldige booster met die waarde, plakken hem op de voorspelling en
    // verwijderen hem van het account (1 keer bruikbaar).
    let mult = 1
    const wanted = Number(body.boosterMult)
    if (Number.isFinite(wanted) && wanted > 1) {
      const power = ((user as { pronostiekPower?: Power | null }).pronostiekPower ?? {}) as Power
      const tokens = activeTokens(power.tokens)
      const at = tokens.findIndex((t) => Number(t.mult) === wanted)
      if (at >= 0) {
        mult = Number(tokens[at].mult)
        tokens.splice(at, 1)
        await payload
          .update({ collection: 'users', id: userId, data: { pronostiekPower: { ...power, tokens } }, overrideAccess: true })
          .catch(() => null)
      }
    }
    const next = [...existing, { userId, name, clubId, home, away, at: Date.now(), weight, mult }]

    await payload.update({ collection: 'matches', id: matchId, data: { scorePredictions: next }, overrideAccess: true })
    return Response.json({ ok: true, boosterUsed: mult > 1 ? mult : undefined })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
