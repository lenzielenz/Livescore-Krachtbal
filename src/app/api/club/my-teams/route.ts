import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { userClubId } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'

// Bewaar de "Mijn ploegen"-voorkeur van de ingelogde gebruiker (trainer/coach). Enkel ploegen van
// de eigen club worden aanvaard, zodat niemand een vreemde ploeg aan zijn account hangt.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const clubId = userClubId(user)
  if (clubId == null) return NextResponse.json({ error: 'Geen club gekoppeld.' }, { status: 400 })

  let body: { teamIds?: unknown }
  try {
    body = (await req.json()) as { teamIds?: unknown }
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const requested = Array.isArray(body.teamIds) ? body.teamIds.map(Number).filter((n) => Number.isFinite(n)) : []

  // Enkel ploegen van de eigen club toelaten.
  const clubTeams = await payload
    .find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as { id: number }[] }))
  const allowed = new Set(clubTeams.docs.map((t) => Number(t.id)))
  const myTeams = [...new Set(requested.filter((id) => allowed.has(id)))]

  await payload.update({ collection: 'users', id: (user as { id: number }).id, data: { myTeams }, overrideAccess: true })
  return NextResponse.json({ ok: true, myTeams })
}
