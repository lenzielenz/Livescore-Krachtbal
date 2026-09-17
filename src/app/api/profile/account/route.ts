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

  if ('followedClubIds' in body) {
    // Enkel zinvol zonder eigen club — mét een club gekozen negeren we dit gewoon (die club leidt
    // dan de weergave). Bestaan checken met één query, begrensd tegen misbruik.
    const hasOwnClub = 'clubId' in body ? Boolean(body.clubId) : Boolean((user as { club?: unknown }).club)
    if (hasOwnClub || !Array.isArray(body.followedClubIds)) {
      data.followedClubs = []
    } else {
      const raw = [...new Set((body.followedClubIds as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 20)
      if (raw.length === 0) {
        data.followedClubs = []
      } else {
        const found = await payload
          .find({ collection: 'clubs', where: { id: { in: raw } }, depth: 0, limit: raw.length, pagination: false })
          .catch(() => ({ docs: [] as { id: number }[] }))
        data.followedClubs = found.docs.map((c) => c.id)
      }
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

/**
 * Eigen account verwijderen. Verplicht voor de Play Store (apps met accountaanmaak moeten in de
 * app én via het web te verwijderen zijn), en het is gewoon correct: je moet weg kunnen.
 *
 * Wat verdwijnt: het account zelf (naam, e-mail, foto, club, positie, check-ins, badges,
 * voedings- en trainingsgegevens die op het account staan), de pushabonnementen en de MVP-stemmen.
 * Wat blijft: de wedstrijdgegevens die je registreerde. Dat is het officiële verslag van een
 * wedstrijd (score, worpen, wedstrijdblad) en dat mag niet verdwijnen omdat één aantekenaar zijn
 * account sluit — de verwijzing naar jou wordt wel losgekoppeld. Zie /account-verwijderen.
 */
export async function DELETE(req: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const userId = (user as { id: number }).id

  // Bewuste bevestiging: dit is onomkeerbaar, dus niet met één toevallige klik.
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // Lege body mag; de controle hieronder weigert dan alsnog.
  }
  if (String(body.bevestiging ?? '').trim().toUpperCase() !== 'VERWIJDER') {
    return NextResponse.json({ error: 'Typ VERWIJDER om je account definitief te verwijderen.' }, { status: 400 })
  }

  // De laatste admin mag zichzelf niet verwijderen: dan raakt niemand nog in het beheer.
  const roles = ((user as { roles?: unknown }).roles ?? []) as string[]
  if (Array.isArray(roles) && roles.includes('admin')) {
    const admins = await payload.count({ collection: 'users', where: { roles: { contains: 'admin' } }, overrideAccess: true })
    if (admins.totalDocs <= 1) {
      return NextResponse.json(
        { error: 'Je bent de laatste beheerder. Maak eerst iemand anders beheerder, anders blijft het platform onbeheerd achter.' },
        { status: 409 },
      )
    }
  }

  // Persoonlijke bijzaken die niets met het wedstrijdverslag te maken hebben: expliciet weg.
  await payload.delete({ collection: 'push-subscriptions', where: { user: { equals: userId } }, overrideAccess: true }).catch(() => {})
  await payload.delete({ collection: 'match-mvp-votes', where: { user: { equals: userId } }, overrideAccess: true }).catch(() => {})
  const photoId = (user as { photo?: unknown }).photo
  const photoRel = photoId && typeof photoId === 'object' ? (photoId as { id?: number }).id : photoId
  if (typeof photoRel === 'number') {
    await payload.delete({ collection: 'media', id: photoRel, overrideAccess: true }).catch(() => {})
  }

  await payload.delete({ collection: 'users', id: userId, overrideAccess: true })

  // Meteen uitloggen: de sessie hoort bij een account dat niet meer bestaat.
  const res = NextResponse.json({ ok: true })
  res.cookies.set('payload-token', '', { maxAge: 0, path: '/' })
  return res
}
