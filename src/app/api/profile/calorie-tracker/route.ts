import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { sanitizeTracker } from '@/lib/calorie-tracker'
import { getPayloadClient } from '@/lib/payload-client'

// Bewaar de persoonlijke calorie-tracker (dagelijkse voedingslog + gewichtsmetingen) van de
// ingelogde gebruiker. De waarden worden gesaneerd en begrensd voor ze opgeslagen worden.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const store = sanitizeTracker(body)
  await payload.update({
    collection: 'users',
    id: (user as { id: number }).id,
    data: { nutritionTracker: store as unknown as Record<string, unknown> },
    overrideAccess: true,
  })
  return NextResponse.json({ ok: true })
}
