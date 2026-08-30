import { getPayloadClient } from '@/lib/payload-client'

import { cvAuthorized } from '../../cv-auth'

export const dynamic = 'force-dynamic'

// Review-endpoint voor CV-voorstellen (fase 1): een mens bevestigt of wijst een voorstel af op de
// review-tijdlijn. Zet reviewed=true en verdict; optioneel corrigeert de reviewer meteen worpType
// en/of eventType. worpTypeOrigineel blijft daarbij onaangeroerd — retraining wil "model zei X,
// mens zei Y". Dit raakt de waarheid (throws) nooit: een bevestigd voorstel is nog steeds enkel
// trainingsdata/reviewstatus, geen score of statistiek.
//
// Herreviewen is toegestaan: een reviewer mag zijn mening herzien, de laatste review wint.
// Daarom is er géén guard op een al gereviewd voorstel.
//
// Auth: zelfde als de andere cv-routes — Bearer CV_BRIDGE_TOKEN of federatie-login (cv-auth.ts).
// Contract: body { actie: 'bevestig' | 'wijsaf', worpType?, eventType? };
// 200 { ok, event: { id, reviewed, verdict, worpType, eventType } }; 400 { error }; 401; 404.

const EVENT_TYPES = ['worp', 'vangst', 'doelpunt', 'buitenspel'] as const
type CvEventType = (typeof EVENT_TYPES)[number]

const WORP_TYPES = ['nek', 'rug'] as const
type WorpType = (typeof WORP_TYPES)[number]

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const eventId = Number(id)
  if (!Number.isInteger(eventId)) {
    return Response.json({ error: 'Ongeldig voorstel-id.' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  if (!(await cvAuthorized(payload, req))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }

  let body: { actie?: unknown; worpType?: unknown; eventType?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON-body.' }, { status: 400 })
  }

  if (body.actie !== 'bevestig' && body.actie !== 'wijsaf') {
    return Response.json({ error: "actie moet 'bevestig' of 'wijsaf' zijn." }, { status: 400 })
  }
  if (body.worpType != null && !WORP_TYPES.includes(body.worpType as WorpType)) {
    return Response.json({ error: "worpType moet 'nek' of 'rug' zijn." }, { status: 400 })
  }
  if (body.eventType != null && !EVENT_TYPES.includes(body.eventType as CvEventType)) {
    return Response.json(
      { error: 'eventType is onbekend (worp/vangst/doelpunt/buitenspel).' },
      { status: 400 },
    )
  }

  const bestaand = await payload
    .findByID({ collection: 'cv-events', id: eventId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!bestaand) {
    return Response.json({ error: 'Voorstel niet gevonden.' }, { status: 404 })
  }

  // Tussen findByID en update kan een federatie-collega het voorstel verwijderen: dan hoort
  // hier het contract-404 te komen, geen kale 500.
  let event
  try {
    event = await payload.update({
      collection: 'cv-events',
      id: eventId,
      data: {
        reviewed: true,
        verdict: body.actie === 'bevestig' ? 'bevestigd' : 'afgewezen',
        // Correcties overschrijven het voorstel; worpTypeOrigineel blijft de claim van het model.
        ...(body.worpType != null ? { worpType: body.worpType as WorpType } : {}),
        ...(body.eventType != null ? { eventType: body.eventType as CvEventType } : {}),
      },
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    return Response.json({ error: 'Voorstel niet gevonden.' }, { status: 404 })
  }

  return Response.json({
    ok: true,
    event: {
      id: event.id,
      reviewed: event.reviewed,
      verdict: event.verdict,
      worpType: event.worpType ?? null,
      eventType: event.eventType,
    },
  })
}
