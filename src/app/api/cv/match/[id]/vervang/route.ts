import type { Where } from 'payload'

import { getPayloadClient } from '@/lib/payload-client'

import { cvAuthorizedForMatch } from '../../../cv-auth'

export const dynamic = 'force-dynamic'

// Een nieuwe analyse vervangt de vorige: haalt de nog NIET nagekeken CV-voorstellen van een
// wedstrijd weg (optioneel enkel die van één model) en desgewenst het loopwerk (cvFysiek), zodat
// een herberekening opnieuw kan uploaden zonder dubbels. Wat een mens al bevestigde of afwees,
// blijft altijd staan: dat is waarheid voor hertraining, geen modelclaim meer. Raakt throws nooit.
//
// Auth: Bearer CV_BRIDGE_TOKEN, federatie-login, of de beheerder van deze eigen analyse-opname
// (cvAuthorizedForMatch).
// Contract: POST { model?: string, fysiek?: boolean } → 200 { verwijderd, fysiekWeg }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) {
    return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  if (!(await cvAuthorizedForMatch(payload, req, matchId))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) {
    return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  }

  let body: { model?: unknown; fysiek?: unknown } = {}
  try {
    const tekst = await req.text()
    body = tekst ? JSON.parse(tekst) : {}
  } catch {
    return Response.json({ error: 'Body is geen geldige JSON.' }, { status: 400 })
  }
  if (body.model != null && (typeof body.model !== 'string' || !body.model.trim())) {
    return Response.json({ error: 'model moet een niet-lege tekst zijn.' }, { status: 400 })
  }

  const waar: Where[] = [{ match: { equals: matchId } }, { reviewed: { not_equals: true } }]
  if (typeof body.model === 'string') waar.push({ 'provenance.model': { equals: body.model.trim() } })
  const weg = await payload.delete({ collection: 'cv-events', where: { and: waar }, overrideAccess: true })

  let fysiekWeg = false
  if (body.fysiek === true && (match as { cvFysiek?: unknown }).cvFysiek) {
    await payload.update({ collection: 'matches', id: matchId, data: { cvFysiek: null }, overrideAccess: true })
    fysiekWeg = true
  }
  return Response.json({ verwijderd: weg.docs.length, fysiekWeg })
}
