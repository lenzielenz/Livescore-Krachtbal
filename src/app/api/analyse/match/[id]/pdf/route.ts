import { canAnalyse } from '@/lib/access'
import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { buildMatchState, buildMatchStats } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { generateMatchAnalysisPdf } from '@/lib/submit/pdf-match-analysis'

// PDF-export van de wedstrijd-analyse (samenvatting + analyse). Analyse-only, privé per persoon.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig wedstrijd-id' }, { status: 400 })
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen toegang tot de analyse.' }, { status: 403 })

    const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    if (!matchDoc) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    if (!canViewAnalyseMatch(user, matchDoc as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
      return Response.json({ error: 'Deze analyse hoort bij een andere gebruiker.' }, { status: 403 })
    }

    const [state, statsRes] = await Promise.all([buildMatchState(payload, matchId), buildMatchStats(payload, matchId)])
    const teams = { home: state.teams.home.name, away: state.teams.away.name }
    const datum = matchDoc.date
      ? new Date(matchDoc.date as string).toLocaleDateString('nl-BE', { dateStyle: 'long' })
      : null

    const pdf = await generateMatchAnalysisPdf({
      teams,
      score: state.score,
      reeks: String((matchDoc as { reeks?: unknown }).reeks ?? ''),
      datum,
      stats: statsRes.stats,
    })
    const safeName = `${teams.home}-${teams.away}`.replace(/[^\w-]+/g, '_').toLowerCase()
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="analyse-${safeName}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
