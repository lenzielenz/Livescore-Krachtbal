import { hasRole, isFederationLevel } from '@/lib/access'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import type { MatchSheetStatus } from '@/lib/matchsheet-workflow'
import { getPayloadClient } from '@/lib/payload-client'

// Scheidsrechter-/federatie-acties op het blad: statusovergang en materiële keuring.
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  let body: {
    action?: string
    to?: string
    keuring?: Record<string, string>
    officials?: Record<string, string>
    refereeKm?: number
    forfait?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    const referee = isFederationLevel(user) || hasRole(user, 'scheidsrechter')
    if (!referee) return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })

    const sheet = await getOrCreateMatchSheet(payload, matchId)

    if (body.action === 'status') {
      const to = body.to as MatchSheetStatus
      // De status-machine + override-log worden afgedwongen in de collection-hook.
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { status: to },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, status: updated.status })
    }

    if (body.action === 'keuring') {
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { keuring: body.keuring ?? {} },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, keuring: updated.keuring })
    }

    if (body.action === 'officials') {
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { officials: body.officials ?? {} },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, officials: updated.officials })
    }

    if (body.action === 'vergoeding') {
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { refereeKm: body.refereeKm ?? null, forfait: body.forfait ?? {} },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, refereeKm: updated.refereeKm, forfait: updated.forfait })
    }

    return Response.json({ error: `Onbekende actie: ${body.action}` }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
