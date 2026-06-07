import { canAnalyse } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { parseSpeelstijl } from '@/lib/speelstijl'

// Bewaart het tactisch profiel ("hoe spelen wij als ploeg") van één ploeg. Analyse-only.
// Teams.update is federatie-only, dus we slaan op met overrideAccess na de canAnalyse-check.
export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const id = Number(teamId)
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig ploeg-id' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen toegang tot de analyse.' }, { status: 403 })

    const team = await payload.findByID({ collection: 'teams', id, depth: 0 }).catch(() => null)
    if (!team) return Response.json({ error: 'Ploeg niet gevonden.' }, { status: 404 })

    const speelstijl = parseSpeelstijl(body)
    await payload.update({
      collection: 'teams',
      id,
      data: { speelstijl: speelstijl as unknown as Record<string, unknown> },
      overrideAccess: true,
    })

    return Response.json({ ok: true, speelstijl })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
