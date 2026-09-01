import { NextResponse } from 'next/server'

import { authUser, isFederationLevel } from '@/lib/api-auth'
import { ONTDUBBEL_CONFIRM_PHRASE, ontdubbelWedstrijden } from '@/lib/match-duplicates'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Dubbele wedstrijden opruimen. GET telt (en toont voorbeelden), POST ruimt echt op.
//
// De weg terug voor een kalender die dubbel in de agenda staat — zoals na twee imports die
// elkaar overlapten. Enkel federatie/admin: dit verwijdert wedstrijden.

async function toegang(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  if (!isFederationLevel(user)) {
    return { fout: NextResponse.json({ error: 'Enkel de federatie kan het speelplan opruimen.' }, { status: 403 }) }
  }
  return { payload }
}

export async function GET(req: Request) {
  const t = await toegang(req)
  if ('fout' in t) return t.fout
  try {
    return NextResponse.json({ ok: true, ...(await ontdubbelWedstrijden(t.payload, { commit: false })) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  const t = await toegang(req)
  if ('fout' in t) return t.fout

  // Zelfde vangnet als bij "vervang volledig speelplan": een losstaande aanvraag mag geen
  // wedstrijden kunnen verwijderen zonder dat iemand het letterlijk bevestigd heeft.
  let body: { confirm?: unknown } = {}
  try {
    body = (await req.json()) as { confirm?: unknown }
  } catch {
    body = {}
  }
  if (String(body.confirm ?? '') !== ONTDUBBEL_CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Typ exact "${ONTDUBBEL_CONFIRM_PHRASE}" om te bevestigen.` }, { status: 400 })
  }

  try {
    return NextResponse.json({ ok: true, ...(await ontdubbelWedstrijden(t.payload, { commit: true })) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
