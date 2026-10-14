import { kantineIds } from '@/lib/kantine-channel'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// De supportersfoto's van een handvol wedstrijden, voor het dagverloop op het kantinescherm (zie
// kantine-dagverloop.ts). De live-stream stuurt enkel de foto's die NET binnenkwamen; na de laatste
// wedstrijd wil de kantine de hele dag opnieuw zien, dus haalt het scherm ze hier in één keer op.
//
// Openbaar leesbaar, net als de stream en de wedstrijdpagina zelf: dezelfde foto's staan daar al
// voor iedereen. Privé-analyses en demo's vallen eruit — die horen op geen enkel publiek scherm.

/** Meer dan dit tonen we niet in één dagverloop: een kantine-tv is geen fotoalbum. */
const MAX_FOTOS = 120

export async function GET(req: Request) {
  const ids = kantineIds(new URL(req.url).searchParams.get('ids'))
  if (ids.length === 0) return Response.json({ fotos: [] })
  try {
    const payload = await getPayloadClient()
    const publiek = await payload.find({
      collection: 'matches',
      where: { and: [{ id: { in: ids } }, { analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }] },
      depth: 0,
      limit: ids.length,
    })
    const matchIds = publiek.docs.map((m) => m.id)
    if (matchIds.length === 0) return Response.json({ fotos: [] })

    const res = await payload.find({
      collection: 'match-instants',
      where: { and: [{ match: { in: matchIds } }, { kind: { equals: 'photo' } }] },
      sort: 'createdAt',
      depth: 0,
      limit: MAX_FOTOS,
    })
    const fotos = res.docs
      .map((d) => {
        const filename = (d as { filename?: string | null }).filename
        const url = filename ? `/api/match-instants/file/${encodeURIComponent(filename)}` : ((d as { url?: string | null }).url ?? '')
        const match = (d as { match?: unknown }).match
        const matchId = typeof match === 'object' && match ? Number((match as { id?: unknown }).id) : Number(match)
        return { id: Number(d.id), matchId, url, authorName: (d as { authorName?: string | null }).authorName || 'Supporter' }
      })
      .filter((f) => f.url && Number.isFinite(f.matchId))
    return Response.json({ fotos }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
