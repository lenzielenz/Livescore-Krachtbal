import { hasRole } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import type { Match } from '@/payload-types'

// Maakt een "enkel voor analyse"-wedstrijd aan (niet live/publiek zichtbaar). Admin-only.
// Wordt vanuit de analyse-hub gebruikt om manueel een wedstrijd op te nemen.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!hasRole(user, 'admin')) return Response.json({ error: 'Enkel een admin kan dit.' }, { status: 403 })

    const homeTeam = Number(body.homeTeam)
    const awayTeam = Number(body.awayTeam)
    const reeks = typeof body.reeks === 'string' ? body.reeks : ''
    const date = typeof body.date === 'string' && body.date ? body.date : new Date().toISOString()

    if (!Number.isFinite(homeTeam) || !Number.isFinite(awayTeam)) {
      return Response.json({ error: 'Kies een thuis- en uitploeg.' }, { status: 400 })
    }
    if (homeTeam === awayTeam) {
      return Response.json({ error: 'Thuis- en uitploeg moeten verschillen.' }, { status: 400 })
    }
    if (!reeks) return Response.json({ error: 'Kies een reeks.' }, { status: 400 })

    const created = await payload.create({
      collection: 'matches',
      data: {
        reeks: reeks as NonNullable<Match['reeks']>,
        homeTeam,
        awayTeam,
        date,
        status: 'scheduled',
        goalAreaDepth: 10,
        analyseOnly: true,
      },
    })

    return Response.json({ id: (created as { id: number }).id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
