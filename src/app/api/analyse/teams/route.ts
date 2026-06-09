import { ownsAnalyse, requireAnalyseUser } from '@/lib/analyse-crud'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from '@/lib/reeksen'
import type { Club, Team } from '@/payload-types'

const isReeks = (v: unknown): v is Reeks => typeof v === 'string' && REEKS_OPTIONS.some((o) => o.value === v)

// Verifieer dat de gekozen club een eigen analyse-club is (zodat een analyse-ploeg nooit aan een
// competitie-club hangt). Geeft de club-id terug, of een foutrespons.
async function ownAnalyseClubId(payload: Awaited<ReturnType<typeof getPayloadClient>>, clubId: number, user: Parameters<typeof ownsAnalyse>[1]): Promise<number | Response> {
  if (!Number.isFinite(clubId)) return Response.json({ error: 'Kies een club.' }, { status: 400 })
  const club = (await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)) as Club | null
  if (!ownsAnalyse(club, user)) return Response.json({ error: 'Onbekende analyse-club.' }, { status: 400 })
  return clubId
}

// CRUD voor analyse-eigen ploegen. De reeks komt uit de vaste KVKBF-lijst (REEKS_OPTIONS); de
// categorie leiden we daar automatisch uit af (zoals bij competitie-ploegen). analyseOnly + owner
// worden altijd gezet, en de club moet een eigen analyse-club zijn.
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
    if (!name) return Response.json({ error: 'Geef een ploegnaam in.' }, { status: 400 })
    if (!isReeks(body.reeks)) return Response.json({ error: 'Kies een geldige reeks.' }, { status: 400 })
    const clubOrErr = await ownAnalyseClubId(payload, Number(body.clubId), auth.user)
    if (clubOrErr instanceof Response) return clubOrErr

    const created = await payload.create({
      collection: 'teams',
      data: {
        name,
        reeks: body.reeks,
        category: reeksCategorie(body.reeks),
        club: clubOrErr,
        analyseOnly: true,
        analyseOwner: Number(auth.user.id),
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, id: (created as { id: number }).id, name })
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
    const doc = (await payload.findByID({ collection: 'teams', id, depth: 0 }).catch(() => null)) as Team | null
    if (!ownsAnalyse(doc, auth.user)) return Response.json({ error: 'Niet gevonden of geen rechten.' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.reeks !== undefined) {
      if (!isReeks(body.reeks)) return Response.json({ error: 'Kies een geldige reeks.' }, { status: 400 })
      data.reeks = body.reeks
      data.category = reeksCategorie(body.reeks)
    }
    if (body.clubId !== undefined) {
      const clubOrErr = await ownAnalyseClubId(payload, Number(body.clubId), auth.user)
      if (clubOrErr instanceof Response) return clubOrErr
      data.club = clubOrErr
    }
    await payload.update({ collection: 'teams', id, data, overrideAccess: true })
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
    const doc = (await payload.findByID({ collection: 'teams', id, depth: 0 }).catch(() => null)) as Team | null
    if (!ownsAnalyse(doc, auth.user)) return Response.json({ error: 'Niet gevonden of geen rechten.' }, { status: 404 })

    // De Teams-beforeDelete-hook verwijdert eerst de spelers van deze ploeg.
    await payload.delete({ collection: 'teams', id, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
