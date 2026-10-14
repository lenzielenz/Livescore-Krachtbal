import type { Payload } from 'payload'

import type { TeamSide } from '@/lib/krachtbal-rules'
import { bouwKantineBorden, type KantineBordBron } from '@/lib/kantine-borden'
import { kantineIds } from '@/lib/kantine-channel'
import { bouwVerhaal, dagSamenvatting, type DagSamenvatting, type WedstrijdVerhaal } from '@/lib/kantine-dagverhaal'
import { buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksHalfDurationSeconds, type Reeks } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'

// Alles wat het dagverloop op het kantinescherm nodig heeft voor een handvol (afgelopen)
// wedstrijden: het verhaal van elke wedstrijd (verloop, topschutter, held van de match, berichten
// en reacties uit de tribune), de supportersfoto's, en de dag samengevat in cijfers. Zie
// kantine-dagverhaal.ts en kantine-dagverloop.ts.
//
// Openbaar leesbaar, net als de live-stream en de wedstrijdpagina: dezelfde berichten, foto's en
// reacties staan daar al voor iedereen. Privé-analyses en demo's vallen eruit.
//
// Elke tv pollt dit om de minuut, en bij een tornooidag hangen er vaak meerdere in dezelfde
// kantine. Het antwoord blijft daarom even in het geheugen: per lijst wedstrijden één keer
// opbouwen per minuut, hoeveel schermen er ook kijken.

/** Meer dan dit tonen we niet in één dagverloop: een kantine-tv is geen fotoalbum. */
const MAX_FOTOS = 120
const CACHE_MS = 60_000

type Foto = { id: number; matchId: number; url: string; authorName: string }
type Antwoord = { fotos: Foto[]; verhalen: WedstrijdVerhaal[]; samenvatting: DagSamenvatting }

const cache = new Map<string, { op: number; antwoord: Antwoord }>()

const relId = (v: unknown): number | null => {
  const raw = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

async function bouw(payload: Payload, ids: number[]): Promise<Antwoord> {
  const res = await payload.find({
    collection: 'matches',
    where: { and: [{ id: { in: ids } }, { analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }] },
    depth: 0,
    limit: ids.length,
  })
  const docs = res.docs
  if (docs.length === 0) return { fotos: [], verhalen: [], samenvatting: dagSamenvatting([], [], 0) }
  const matchIds = docs.map((d) => d.id)

  const [borden, fotoRes, mvpRes, tijdlijnen] = await Promise.all([
    // Namen en de officiële eindstand, gebatcht — dezelfde bron als de borden op het scherm.
    bouwKantineBorden(payload, docs as unknown as KantineBordBron[]),
    payload.find({
      collection: 'match-instants',
      where: { and: [{ match: { in: matchIds } }, { kind: { equals: 'photo' } }] },
      sort: 'createdAt',
      depth: 0,
      limit: MAX_FOTOS,
    }),
    payload.find({ collection: 'match-mvp-votes', where: { match: { in: matchIds } }, depth: 0, pagination: false }).catch(() => ({ docs: [] })),
    Promise.all(matchIds.map((id) => buildTimeline(payload, id).catch(() => []))),
  ])

  // Held van de match: de speler met de meeste stemmen, per wedstrijd.
  const stemmen = new Map<number, Map<string, { naam: string; side: TeamSide; stemmen: number }>>()
  for (const v of mvpRes.docs as Record<string, unknown>[]) {
    const matchId = relId(v.match)
    const naam = typeof v.playerName === 'string' ? v.playerName.trim() : ''
    const side = v.side === 'home' || v.side === 'away' ? v.side : null
    if (matchId == null || !naam || !side) continue
    const perMatch = stemmen.get(matchId) ?? new Map()
    const sleutel = `${side}:${relId(v.player) ?? naam}`
    const rij = perMatch.get(sleutel) ?? { naam, side, stemmen: 0 }
    rij.stemmen += 1
    perMatch.set(sleutel, rij)
    stemmen.set(matchId, perMatch)
  }
  const mvpVan = (matchId: number) => [...(stemmen.get(matchId)?.values() ?? [])].sort((a, b) => b.stemmen - a.stemmen)[0] ?? null

  const bordVan = new Map(borden.map((b) => [b.id, b]))
  const verhalen: WedstrijdVerhaal[] = []
  docs.forEach((d, i) => {
    const bord = bordVan.get(d.id)
    if (!bord) return
    const reeksCode = (d as { reeks?: unknown }).reeks
    verhalen.push(
      bouwVerhaal({
        matchId: d.id,
        home: bord.home.name,
        away: bord.away.name,
        reeks: bord.reeks,
        score: bord.score,
        tijdlijn: tijdlijnen[i] ?? [],
        halfSeconds: typeof reeksCode === 'string' ? reeksHalfDurationSeconds(reeksCode as Reeks) : 1500,
        berichten: (d as { liveShoutouts?: unknown }).liveShoutouts,
        kudos: (d as { liveReactions?: unknown }).liveReactions,
        kijkers: (d as { peakViewers?: unknown }).peakViewers,
        mvp: mvpVan(d.id),
      }),
    )
  })

  const fotos: Foto[] = fotoRes.docs
    .map((d) => {
      const filename = (d as { filename?: string | null }).filename
      const url = filename ? `/api/match-instants/file/${encodeURIComponent(filename)}` : ((d as { url?: string | null }).url ?? '')
      return { id: Number(d.id), matchId: relId((d as { match?: unknown }).match) ?? NaN, url, authorName: (d as { authorName?: string | null }).authorName || 'Supporter' }
    })
    .filter((f) => f.url && Number.isFinite(f.matchId))

  const samenvatting = dagSamenvatting(
    borden.map((b) => ({ matchId: b.id, score: b.score })),
    verhalen,
    fotos.length,
  )
  return { fotos, verhalen, samenvatting }
}

export async function GET(req: Request) {
  const ids = kantineIds(new URL(req.url).searchParams.get('ids'))
  if (ids.length === 0) return Response.json({ fotos: [], verhalen: [], samenvatting: dagSamenvatting([], [], 0) })
  const sleutel = ids.join(',')
  const vers = cache.get(sleutel)
  if (vers && Date.now() - vers.op < CACHE_MS) return Response.json(vers.antwoord, { headers: { 'Cache-Control': 'no-store' } })
  try {
    const payload = await getPayloadClient()
    const antwoord = await bouw(payload, ids)
    cache.set(sleutel, { op: Date.now(), antwoord })
    // Oude sleutels opruimen: een dag later kijkt niemand nog naar dezelfde lijst.
    for (const [k, v] of cache) if (Date.now() - v.op > 10 * CACHE_MS) cache.delete(k)
    return Response.json(antwoord, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
