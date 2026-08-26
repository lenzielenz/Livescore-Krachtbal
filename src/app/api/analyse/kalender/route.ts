import { canAnalyse } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'
import type { Where } from 'payload'

export const dynamic = 'force-dynamic'

// De echte competitiekalender voor de analyse-kiezer: recent gespeelde en komende wedstrijden
// van één reeks. Alleen-lezen — wie een wedstrijd kiest, krijgt een eigen analyse-kopie
// (zie /api/analyse/match met fromMatch); het live-platform wordt nooit aangeraakt.
const DAGEN_TERUG = 14
const DAGEN_VOORUIT = 90
const MAX = 60

export async function GET(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen analyse-toegang.' }, { status: 403 })

    const url = new URL(req.url)
    const reeks = url.searchParams.get('reeks')?.trim() ?? ''
    if (!REEKS_OPTIONS.some((o) => o.value === reeks)) {
      return Response.json({ error: 'Kies een geldige reeks.' }, { status: 400 })
    }

    const van = new Date(Date.now() - DAGEN_TERUG * 86_400_000).toISOString()
    const tot = new Date(Date.now() + DAGEN_VOORUIT * 86_400_000).toISOString()
    const clauses: Where[] = [
      competitionWhere(),
      { reeks: { equals: reeks } },
      { date: { greater_than_equal: van } },
      { date: { less_than: tot } },
    ]
    const res = await payload.find({
      collection: 'matches',
      where: { and: clauses },
      sort: 'date',
      depth: 1,
      limit: MAX,
    })

    const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
    const matches = res.docs
      .filter((m) => !(m as { isDemo?: boolean }).isDemo)
      .map((m) => ({
        id: m.id,
        date: m.date ?? null,
        wanneer: m.date ? formatDateTimeBE(String(m.date), { dateStyle: 'medium', timeStyle: 'short' }) : 'datum n.t.b.',
        home: naam(m.homeTeam),
        away: naam(m.awayTeam),
        gespeeld: m.status === 'finished',
      }))
    return Response.json({ matches })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
