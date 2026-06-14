import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { sanitizeNutritionProfile } from '@/lib/nutrition-plan'
import { getPayloadClient } from '@/lib/payload-client'

// Bewaar het persoonlijke voedingsprofiel van de ingelogde gebruiker, zodat de planner het
// niet telkens opnieuw hoeft te vragen. De waarden worden gesaneerd voor ze opgeslagen worden.
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

  const profile = sanitizeNutritionProfile(body)
  if (!profile) return NextResponse.json({ error: 'Ongeldig profiel.' }, { status: 400 })

  await payload.update({ collection: 'users', id: (user as { id: number }).id, data: { nutritionProfile: { ...profile } }, overrideAccess: true })
  return NextResponse.json({ ok: true, nutritionProfile: profile })
}
