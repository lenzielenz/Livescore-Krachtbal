import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { isFederationLevel } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { sanitizeSkills } from '@/lib/scorecard'

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? (Number((v as { id?: unknown }).id) || null) : Number(v) || null

// Bewaar de scorecard-instellingen van de ingelogde gebruiker: de koppeling naar het eigen
// spelersdossier (voor echte matchstatistiek) en de zelf-/coachbeoordeling per as.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  let body: { playerId?: unknown; skills?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if ('playerId' in body) {
    const raw = body.playerId
    if (raw === null || raw === '' || raw === undefined) {
      data.player = null
    } else {
      const playerId = Number(raw)
      if (!Number.isFinite(playerId) || playerId <= 0) return NextResponse.json({ error: 'Ongeldige speler.' }, { status: 400 })
      const player = await payload.findByID({ collection: 'players', id: playerId, depth: 1 }).catch(() => null)
      if (!player) return NextResponse.json({ error: 'Speler niet gevonden.' }, { status: 400 })
      // Privacy/multi-tenant: enkel een speler van je eigen club koppelen (federatie/admin mag alles).
      if (!isFederationLevel(user)) {
        const myClub = rel((user as { club?: unknown }).club)
        const playerClub = rel((player as { club?: unknown }).club) ?? rel(((player as { team?: { club?: unknown } }).team)?.club)
        if (!myClub) return NextResponse.json({ error: 'Stel eerst je club in op je profiel.' }, { status: 400 })
        if (playerClub !== myClub) return NextResponse.json({ error: 'Je kan enkel een speler van je eigen club koppelen.' }, { status: 403 })
      }
      data.player = playerId
    }
  }

  if ('skills' in body) data.scorecardSkills = sanitizeSkills(body.skills)

  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Niets om op te slaan.' }, { status: 400 })

  await payload.update({ collection: 'users', id: (user as { id: number }).id, data, overrideAccess: true })
  return NextResponse.json({ ok: true })
}
