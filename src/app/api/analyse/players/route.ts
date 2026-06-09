import { ownsAnalyse, requireAnalyseUser } from '@/lib/analyse-crud'
import { getPayloadClient } from '@/lib/payload-client'
import { POSITION_OPTIONS } from '@/collections/Players'
import type { Player, Team } from '@/payload-types'

type Position = (typeof POSITION_OPTIONS)[number]['value']
const isPosition = (v: unknown): v is Position => typeof v === 'string' && POSITION_OPTIONS.some((o) => o.value === v)

// CRUD voor analyse-eigen spelers. Een speler hoort bij een eigen analyse-ploeg en krijgt een
// positie (verplicht — die voedt de analyse); leeftijd/geboortedatum is niet nodig. analyseOnly +
// owner worden altijd gezet; de Players-beforeValidate-hook synct de (analyse-)club van de ploeg.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const auth = await requireAnalyseUser(payload, req)
    if ('error' in auth) return auth.error

    const name = String(body.name ?? '').trim()
    const shirtNumber = Number(body.shirtNumber)
    const teamId = Number(body.teamId)
    if (!name) return Response.json({ error: 'Naam is verplicht.' }, { status: 400 })
    if (!Number.isFinite(shirtNumber) || shirtNumber < 0) return Response.json({ error: 'Geef een geldig rugnummer.' }, { status: 400 })
    if (!isPosition(body.position)) return Response.json({ error: 'Kies een positie.' }, { status: 400 })

    const team = (await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)) as Team | null
    if (!ownsAnalyse(team, auth.user)) return Response.json({ error: 'Onbekende analyse-ploeg.' }, { status: 400 })

    // Dubbel rugnummer binnen dezelfde ploeg vermijden.
    const dup = await payload.find({
      collection: 'players',
      where: { and: [{ team: { equals: teamId } }, { shirtNumber: { equals: shirtNumber } }] },
      limit: 1,
    })
    if (dup.totalDocs > 0) return Response.json({ error: `Rugnummer ${shirtNumber} bestaat al in deze ploeg.` }, { status: 409 })

    const created = await payload.create({
      collection: 'players',
      data: {
        name,
        shirtNumber,
        position: body.position,
        team: teamId,
        analyseOnly: true,
        analyseOwner: Number(auth.user.id),
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, player: { id: (created as { id: number }).id, name, shirtNumber, position: body.position } })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const auth = await requireAnalyseUser(payload, req)
    if ('error' in auth) return auth.error

    const id = Number(body.id)
    if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig id.' }, { status: 400 })
    const doc = (await payload.findByID({ collection: 'players', id, depth: 0 }).catch(() => null)) as Player | null
    if (!ownsAnalyse(doc, auth.user)) return Response.json({ error: 'Niet gevonden of geen rechten.' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.shirtNumber !== undefined) {
      const n = Number(body.shirtNumber)
      if (!Number.isFinite(n) || n < 0) return Response.json({ error: 'Geef een geldig rugnummer.' }, { status: 400 })
      data.shirtNumber = n
    }
    if (body.position !== undefined) {
      if (!isPosition(body.position)) return Response.json({ error: 'Kies een geldige positie.' }, { status: 400 })
      data.position = body.position
    }
    await payload.update({ collection: 'players', id, data, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const auth = await requireAnalyseUser(payload, req)
    if ('error' in auth) return auth.error

    const id = Number(body.id)
    if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig id.' }, { status: 400 })
    const doc = (await payload.findByID({ collection: 'players', id, depth: 0 }).catch(() => null)) as Player | null
    if (!ownsAnalyse(doc, auth.user)) return Response.json({ error: 'Niet gevonden of geen rechten.' }, { status: 404 })

    await payload.delete({ collection: 'players', id, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
