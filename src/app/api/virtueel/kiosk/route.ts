import { competitionWhere } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { activeTokens, type RadToken } from '@/lib/pronostiek-rad'
import { countUserWeekendPredictions, LIVE_PRONOSTIEK_MAX_PER_WEEKEND, pronostiekOpen, weekendRange } from '@/lib/pronostiek-weekend'
import { reeksNaam } from '@/lib/reeksen'
import { KIOSK_DAGEN, kioskWedstrijden, type KioskRuw } from '@/lib/virtueel-kiosk'

export const dynamic = 'force-dynamic'

// De wedkiosken in het wedkantoor van het virtuele stadion (zie lib/virtueel-kiosk.ts): de komende
// wedstrijden om op te voorspellen, met wat je al voorspelde, hoeveel pronostieken je per speelweek
// nog over hebt en je boosters van het bonusrad. Enkel lezen; voorspellen zelf gaat langs
// POST /api/club/predict, met precies dezelfde regels als op de matchpagina.

const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
const id = (v: unknown): number | null => (v && typeof v === 'object' ? Number((v as { id?: unknown }).id) || null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const ik = await authUser(payload, req).catch(() => null)
  const userId = ik ? Number((ik as { id: number }).id) : null
  const club = Number(new URL(req.url).searchParams.get('club'))
  const nu = new Date()

  const [res, ploegen] = await Promise.all([
    payload
      .find({
        collection: 'matches',
        where: {
          and: [
            { status: { equals: 'scheduled' } },
            { date: { greater_than: nu.toISOString() } },
            { date: { less_than_equal: new Date(nu.getTime() + KIOSK_DAGEN * 86_400_000).toISOString() } },
            competitionWhere(),
          ],
        },
        depth: 1,
        limit: 300,
        sort: 'date',
      })
      .catch(() => ({ docs: [] as Record<string, unknown>[] })),
    Number.isFinite(club) && club > 0
      ? payload
          .find({ collection: 'teams', where: { and: [{ club: { equals: club } }, competitionWhere()] }, depth: 0, limit: 200 })
          .catch(() => ({ docs: [] as Record<string, unknown>[] }))
      : Promise.resolve({ docs: [] as Record<string, unknown>[] }),
  ])

  const ruw: KioskRuw[] = (res.docs as Record<string, unknown>[]).map((m) => ({
    id: Number(m.id),
    datum: String(m.date ?? ''),
    status: String(m.status ?? ''),
    reeks: reeksNaam(m.reeks),
    thuisId: id(m.homeTeam),
    uitId: id(m.awayTeam),
    thuis: naam(m.homeTeam),
    uit: naam(m.awayTeam),
    isDemo: Boolean(m.isDemo),
    analyseOnly: Boolean(m.analyseOnly),
    preds: Array.isArray(m.scorePredictions) ? (m.scorePredictions as KioskRuw['preds']) : [],
  }))
  const wedstrijden = kioskWedstrijden(ruw, {
    nu,
    clubPloegen: new Set((ploegen.docs as Record<string, unknown>[]).map((t) => Number(t.id))),
    userId,
    isOpen: (d) => pronostiekOpen(d, nu),
  })

  // Per speelweek: hoeveel pronostieken je nog over hebt (dezelfde telling als bij het voorspellen).
  const over: Record<string, number> = {}
  if (userId != null) {
    const weken = new Map<string, string>()
    for (const w of wedstrijden) weken.set(weekendRange(w.datum).startIso, w.datum)
    await Promise.all(
      [...weken].map(async ([start, datum]) => {
        const gebruikt = await countUserWeekendPredictions(payload, userId, datum).catch(() => 0)
        over[start] = Math.max(0, LIVE_PRONOSTIEK_MAX_PER_WEEKEND - gebruikt)
      }),
    )
  }
  const boosters = activeTokens(((ik as { pronostiekPower?: { tokens?: RadToken[] } | null } | null)?.pronostiekPower)?.tokens).map((t) => Number(t.mult))

  return Response.json(
    {
      ingelogd: userId != null,
      max: LIVE_PRONOSTIEK_MAX_PER_WEEKEND,
      boosters,
      wedstrijden: wedstrijden.map((w) => {
        const week = weekendRange(w.datum).startIso
        return { ...w, week, over: userId != null ? (over[week] ?? LIVE_PRONOSTIEK_MAX_PER_WEEKEND) : null }
      }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
