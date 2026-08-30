import { getPayloadClient } from '@/lib/payload-client'

import { cvAuthorized } from '../../../cv-auth'

export const dynamic = 'force-dynamic'

// Ground truth voor hertraining (fase 6): alle GEREVIEWDE CV-voorstellen van een wedstrijd,
// mét de bevroren modelclaim ernaast — "model zei X, mens zei Y" is precies wat een volgende
// trainingsronde nodig heeft. Afgewezen voorstellen zijn even waardevol als bevestigde: dat
// zijn de valse positieven die het model moet afleren. Open (ongereviewde) voorstellen horen
// hier niet in — een half oordeel is geen waarheid.
//
// Auth: zelfde als de andere cv-routes — Bearer CV_BRIDGE_TOKEN of federatie-login (cv-auth.ts).
// Contract (cv/groundtruth.py leest exact deze vorm):
//   { "match": { id }, "reviews": [{ id, video_time_s, event_type, verdict,
//     worp_type, worp_type_origineel, side, rugnummer, in_doelgebied, x_m, y_m, afstand_m,
//     confidence, provenance: { model, model_version } }],
//     "rapport": { totaal, bevestigd, afgewezen, worp_type_gecorrigeerd } }
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) {
    return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  if (!(await cvAuthorized(payload, req))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }

  const match = await payload
    .findByID({ collection: 'matches', id: matchId, depth: 0 })
    .catch(() => null)
  if (!match) {
    return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  }

  const res = await payload.find({
    collection: 'cv-events',
    where: { and: [{ match: { equals: matchId } }, { reviewed: { equals: true } }] },
    sort: 'videoTimeS',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  let bevestigd = 0
  let afgewezen = 0
  let gecorrigeerd = 0
  const reviews = res.docs.map((e) => {
    if (e.verdict === 'bevestigd') bevestigd++
    if (e.verdict === 'afgewezen') afgewezen++
    const origineel = e.worpTypeOrigineel ?? null
    if (origineel != null && e.worpType != null && origineel !== e.worpType) gecorrigeerd++
    return {
      id: e.id,
      video_time_s: e.videoTimeS,
      event_type: e.eventType,
      verdict: e.verdict ?? null,
      worp_type: e.worpType ?? null,
      worp_type_origineel: origineel,
      side: e.side ?? null,
      rugnummer: e.rugnummer ?? null,
      in_doelgebied: e.inDoelgebied === true,
      x_m: e.xM ?? null,
      y_m: e.yM ?? null,
      afstand_m: e.afstandM ?? null,
      confidence: e.confidence,
      provenance: {
        model: e.provenance?.model ?? null,
        model_version: e.provenance?.modelVersion ?? null,
      },
    }
  })

  return Response.json({
    match: { id: matchId },
    reviews,
    rapport: {
      totaal: reviews.length,
      bevestigd,
      afgewezen,
      worp_type_gecorrigeerd: gecorrigeerd,
    },
  })
}
