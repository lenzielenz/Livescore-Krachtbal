import { canViewAnalyseMatch } from '@/lib/analyse-access'
import { authUser, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { parseVideoSource } from '@/lib/video-sync'

export const dynamic = 'force-dynamic'

// De video van een wedstrijd koppelen en ijken (video-analyse). De ijkpunten zeggen op welke
// seconde in de video elke helft afgetrapt wordt; daarmee springt de analysepagina van elk
// doelpunt naar het juiste beeld (zie src/lib/video-sync.ts).
//
// Rechten: de federatie/admin voor élke wedstrijd, en voor een privé analyse-opname de eigenaar
// (of iemand met wie hij ze deelde) — exact dezelfde kring die de analyse al mag bekijken.
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

    const analyse = match as { analyseOnly?: boolean | null; analyseOwner?: unknown }
    const mayEdit = isFederationLevel(user) || (Boolean(analyse.analyseOnly) && canViewAnalyseMatch(user, analyse))
    if (!mayEdit) return Response.json({ error: 'Geen rechten voor de video van deze wedstrijd.' }, { status: 403 })

    // URL: leeg = video loskoppelen. Anders moet ze herkenbaar zijn (bestand, YouTube of uitlink).
    const data: Record<string, unknown> = {}
    if (body.videoUrl !== undefined) {
      const raw = String(body.videoUrl ?? '').trim()
      if (raw && !parseVideoSource(raw)) {
        return Response.json({ error: 'Onbruikbare video-URL. Gebruik een YouTube-link of een .mp4/.webm-bestand.' }, { status: 400 })
      }
      data.videoUrl = raw || null
    }

    // IJkpunten (seconden). null = wissen; een getal moet eindig en niet-negatief zijn.
    for (const key of ['videoOffsetH1', 'videoOffsetH2'] as const) {
      if (body[key] === undefined) continue
      if (body[key] === null) {
        data[key] = null
        continue
      }
      const n = Number(body[key])
      if (!Number.isFinite(n) || n < 0) return Response.json({ error: 'IJkpunt moet een positief aantal seconden zijn.' }, { status: 400 })
      data[key] = Math.round(n)
    }

    if (Object.keys(data).length === 0) return Response.json({ error: 'Niets om te bewaren.' }, { status: 400 })

    const saved = await payload.update({ collection: 'matches', id: matchId, data, overrideAccess: true })
    return Response.json({
      ok: true,
      videoUrl: (saved as { videoUrl?: string | null }).videoUrl ?? null,
      videoOffsetH1: (saved as { videoOffsetH1?: number | null }).videoOffsetH1 ?? null,
      videoOffsetH2: (saved as { videoOffsetH2?: number | null }).videoOffsetH2 ?? null,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
