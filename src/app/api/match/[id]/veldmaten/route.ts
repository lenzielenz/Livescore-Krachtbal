import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { mayEditMatchVideo } from '@/lib/video-access'
import { FIELD } from '@/lib/field'
import { leesVeldmaten } from '@/lib/veldmaten-invoer'

export const dynamic = 'force-dynamic'

// De échte, opgemeten maten van het terrein waarop deze wedstrijd gespeeld wordt: breedte,
// speelveld tussen de doellijnen en de diepte van het doelgebied. Leeg = reglementair (14 × 26 m).
// Hiermee kloppen de afgeleide meters — worpafstand, landingszone, de passregels en het getekende
// veld — ook op een terrein dat niet exact volgens het reglement is uitgezet.
//
// Rechten: dezelfde kring die de video van deze wedstrijd mag beheren (federatie/admin altijd; bij
// een privé analyse-opname de eigenaar en met wie hij ze deelde). Eén bron van waarheid, zodat er
// nooit een invulveld staat dat de server daarna weigert.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
      return Response.json({ error: 'Geen rechten om deze wedstrijd aan te passen.' }, { status: 403 })
    }

    const gelezen = leesVeldmaten(body)
    if (!gelezen.ok) return Response.json({ error: gelezen.error }, { status: 400 })

    await payload.update({ collection: 'matches', id: matchId, data: gelezen.data, overrideAccess: true })
    // Teruglezen i.p.v. de update-uitkomst gebruiken: die is bij Payload een bulk-resultaat.
    const na = (await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })) as {
      veldBreedte?: number | null
      veldSpeelveld?: number | null
      goalAreaDepth?: number | null
    }
    return Response.json({
      ok: true,
      veldBreedte: na.veldBreedte ?? null,
      veldSpeelveld: na.veldSpeelveld ?? null,
      goalAreaDepth: na.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM,
    })
  } catch {
    return Response.json({ error: 'Opslaan mislukt.' }, { status: 500 })
  }
}
