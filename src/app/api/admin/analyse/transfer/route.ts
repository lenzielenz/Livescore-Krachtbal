import { hasRole } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Admin-only: breng analyse-opnames van de ene gebruiker bij een andere. Handig om de data van
// verschillende analisten samen te brengen onder één persoon (bv. een centraal analyse-account).
// Verzet de eigenaar (analyseOwner) van alle analyse-wedstrijden van `fromUserId` naar `toUserId`.
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!hasRole(user, 'admin')) {
    return Response.json({ error: 'Enkel een admin kan dit.' }, { status: user ? 403 : 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const fromUserId = Number(body.fromUserId)
  const toUserId = Number(body.toUserId)
  if (!Number.isFinite(fromUserId) || !Number.isFinite(toUserId)) {
    return Response.json({ error: 'Kies een geldige van- en naar-gebruiker.' }, { status: 400 })
  }
  if (fromUserId === toUserId) {
    return Response.json({ error: 'Van en naar mogen niet dezelfde gebruiker zijn.' }, { status: 400 })
  }

  // De doelgebruiker moet bestaan.
  const toUser = await payload.findByID({ collection: 'users', id: toUserId, depth: 0 }).catch(() => null)
  if (!toUser) return Response.json({ error: 'Doelgebruiker niet gevonden.' }, { status: 404 })

  try {
    const matches = await payload.find({
      collection: 'matches',
      where: { and: [{ analyseOnly: { equals: true } }, { analyseOwner: { equals: fromUserId } }] },
      depth: 0,
      limit: 5000,
      pagination: false,
    })
    let moved = 0
    for (const m of matches.docs) {
      await payload
        .update({ collection: 'matches', id: (m as { id: number }).id, data: { analyseOwner: toUserId }, overrideAccess: true })
        .then(() => { moved += 1 })
        .catch(() => undefined)
    }
    return Response.json({ ok: true, moved })
  } catch {
    return Response.json({ error: 'Overdragen mislukt.' }, { status: 500 })
  }
}
