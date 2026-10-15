import { competitionWhere } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import type { PredEntry } from '@/lib/prediction-score'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { seasonFromDate } from '@/lib/seasons'
import { vatPronostiekSamen } from '@/lib/virtueel-wedkantoor'

export const dynamic = 'force-dynamic'

// De statistieken van de pronostiek voor de schermen in het wedkantoor van het virtuele stadion
// (zie lib/virtueel-wedkantoor.ts). Enkel lezen. Het rekenwerk (elke afgelopen wedstrijd scoren)
// is hetzelfde als op /pronostiek; we houden het resultaat een minuut bij, zodat niet elke bezoeker
// van het stadion het opnieuw laat uitrekenen. "Jouw plaats" rekenen we per vraag uit de cache.

type Gescoord = { actual: { home: number; away: number }; preds: PredEntry[] }
type Cache = { tot: number; seizoen: string; wedstrijden: Gescoord[]; winnaars: string[] }
let cache: Cache | null = null
let bezig: Promise<Cache> | null = null
const LOOPTIJD = 60_000

async function laad(): Promise<Cache> {
  const payload = await getPayloadClient()
  const seizoen = seasonFromDate(new Date())
  const res = await payload
    .find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'finished' } }, { seizoen: { equals: seizoen } }, competitionWhere()] },
      depth: 0,
      limit: 2000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const metVoorspelling = (res.docs as Record<string, unknown>[])
    .filter((m) => !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly)
    .map((m) => ({ id: Number(m.id), preds: Array.isArray(m.scorePredictions) ? (m.scorePredictions as PredEntry[]) : [] }))
    .filter((m) => m.preds.length > 0)
  const wedstrijden: Gescoord[] = []
  await Promise.all(
    metVoorspelling.map(async (m) => {
      const st = await buildMatchState(payload, m.id).catch(() => null)
      if (st) wedstrijden.push({ actual: { home: st.score.home, away: st.score.away }, preds: m.preds })
    }),
  )
  const rad = await loadRadState(payload).catch(() => ({ winners: [] as { name: string }[] }))
  return { tot: Date.now() + LOOPTIJD, seizoen, wedstrijden, winnaars: rad.winners.map((w) => w.name) }
}

export async function GET(req: Request) {
  let c = cache
  if (!c || c.tot < Date.now()) {
    bezig ??= laad().finally(() => (bezig = null))
    c = cache = await bezig
  }
  const payload = await getPayloadClient()
  const ik = await authUser(payload, req).catch(() => null)
  const stats = vatPronostiekSamen(c.seizoen, c.wedstrijden, { winnaars: c.winnaars }, ik ? Number(ik.id) : null)
  return Response.json(stats, { headers: { 'Cache-Control': 'no-store' } })
}
