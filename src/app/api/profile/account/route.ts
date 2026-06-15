import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload-client'
import { LOGO_OFFSET_RANGE, LOGO_ZOOM_MAX, LOGO_ZOOM_MIN } from '@/lib/logo-fit'
import { POSITION_VALUES } from '@/lib/positions'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

// Bewaar de eigen profielgegevens van de ingelogde gebruiker: naam, club, speelpositie en de
// bijsnij-instelling van de profielfoto (zoom + verschuiving). De foto zelf gaat via /api/profile/photo.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name.length > 80) return NextResponse.json({ error: 'Naam is te lang.' }, { status: 400 })
    data.name = name || null
  }

  if ('clubId' in body) {
    const raw = body.clubId
    if (raw === null || raw === '' || raw === undefined) {
      data.club = null
    } else {
      const clubId = Number(raw)
      if (!Number.isFinite(clubId) || clubId <= 0) return NextResponse.json({ error: 'Ongeldige club.' }, { status: 400 })
      const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
      if (!club) return NextResponse.json({ error: 'Club niet gevonden.' }, { status: 400 })
      data.club = clubId
    }
  }

  if ('position' in body) {
    const pos = body.position
    if (pos === null || pos === '' || pos === undefined) {
      data.position = null
    } else if (typeof pos === 'string' && POSITION_VALUES.includes(pos)) {
      data.position = pos
    } else {
      return NextResponse.json({ error: 'Ongeldige positie.' }, { status: 400 })
    }
  }

  if ('photoZoom' in body) data.photoZoom = clamp(Number(body.photoZoom) || 1, LOGO_ZOOM_MIN, LOGO_ZOOM_MAX)
  if ('photoOffsetX' in body) data.photoOffsetX = clamp(Math.round(Number(body.photoOffsetX) || 0), -LOGO_OFFSET_RANGE, LOGO_OFFSET_RANGE)
  if ('photoOffsetY' in body) data.photoOffsetY = clamp(Math.round(Number(body.photoOffsetY) || 0), -LOGO_OFFSET_RANGE, LOGO_OFFSET_RANGE)

  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Niets om op te slaan.' }, { status: 400 })

  await payload.update({ collection: 'users', id: (user as { id: number }).id, data, overrideAccess: true })
  return NextResponse.json({ ok: true })
}
