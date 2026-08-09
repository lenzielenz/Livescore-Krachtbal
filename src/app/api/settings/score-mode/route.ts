import { NextResponse } from 'next/server'

import { authUser, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { getScoreMode, SCORE_MODES, type ScoreMode } from '@/lib/score-mode'

export const dynamic = 'force-dynamic'

// De globale aantekenmodus omzetten vanuit de app zelf (federatiepagina), zodat je daarvoor niet
// meer in de Payload-admin hoeft te zoeken. Ingrijpend genoeg om enkel federatie/admin toe te
// laten: de modus geldt voor álle wedstrijden tegelijk.

export async function GET() {
  const payload = await getPayloadClient()
  return NextResponse.json({ mode: await getScoreMode(payload) })
}

export async function POST(req: Request) {
  let body: { mode?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const mode = String(body.mode ?? '') as ScoreMode
  if (!SCORE_MODES.includes(mode)) {
    return NextResponse.json({ error: `Onbekende modus: ${body.mode}` }, { status: 400 })
  }

  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!isFederationLevel(user)) {
    return NextResponse.json({ error: 'Enkel de federatie kan de aantekenmodus wijzigen.' }, { status: 403 })
  }

  await payload.updateGlobal({ slug: 'settings', data: { scoreMode: mode }, overrideAccess: true })
  return NextResponse.json({ ok: true, mode })
}
