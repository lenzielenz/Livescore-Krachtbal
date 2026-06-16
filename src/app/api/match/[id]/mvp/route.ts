import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload-client'
import { setMvpTotals } from '@/lib/match-channel'
import { isTribuneOpen } from '@/lib/tribune'

export const dynamic = 'force-dynamic'

const idOf = (v: unknown): number => {
  if (v && typeof v === 'object') return Number((v as { id?: unknown }).id)
  return Number(v)
}

// Tel alle stemmen voor een wedstrijd op tot een teller per speler-id.
async function loadTotals(payload: Awaited<ReturnType<typeof getPayloadClient>>, matchId: number): Promise<Record<number, number>> {
  const res = await payload
    .find({ collection: 'match-mvp-votes', where: { match: { equals: matchId } }, depth: 0, limit: 100000, pagination: false })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const totals: Record<number, number> = {}
  for (const d of res.docs) {
    const pid = idOf((d as { player?: unknown }).player)
    if (Number.isFinite(pid) && pid > 0) totals[pid] = (totals[pid] ?? 0) + 1
  }
  return totals
}

// GET: huidige stand (teller per speler) + de eigen stem indien ingelogd.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return NextResponse.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))

  const totals = await loadTotals(payload, matchId)
  let myVote: number | null = null
  if (user) {
    const mine = await payload
      .find({ collection: 'match-mvp-votes', where: { and: [{ match: { equals: matchId } }, { user: { equals: (user as { id: number }).id } }] }, depth: 0, limit: 1 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    if (mine.docs[0]) myVote = idOf((mine.docs[0] as { player?: unknown }).player)
  }
  return NextResponse.json({ totals, myVote })
}

// POST: stem (of wijzig je stem) op één speler. Eén stem per supporter per wedstrijd.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return NextResponse.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Log in om te stemmen voor de held van de match.' }, { status: 401 })

  let body: { playerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const playerId = Number(body.playerId)
  if (!Number.isFinite(playerId) || playerId <= 0) return NextResponse.json({ error: 'Ongeldige speler' }, { status: 400 })

  // Wedstrijd + stemvenster (open tijdens de match en tot 1u erna) + geldige speler controleren.
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return NextResponse.json({ error: 'Wedstrijd niet gevonden' }, { status: 404 })
  if (!isTribuneOpen(match.status as string, (match as { finishedAt?: string | null }).finishedAt ?? null)) {
    return NextResponse.json({ error: 'Stemmen kan enkel tijdens de wedstrijd en tot een uur erna.' }, { status: 403 })
  }
  const homeId = idOf((match as { homeTeam?: unknown }).homeTeam)
  const awayId = idOf((match as { awayTeam?: unknown }).awayTeam)
  const player = await payload.findByID({ collection: 'players', id: playerId, depth: 0 }).catch(() => null)
  if (!player) return NextResponse.json({ error: 'Speler niet gevonden' }, { status: 404 })
  const playerTeam = idOf((player as { team?: unknown }).team)
  if (playerTeam !== homeId && playerTeam !== awayId) {
    return NextResponse.json({ error: 'Die speler speelt niet in deze wedstrijd.' }, { status: 400 })
  }
  const side: 'home' | 'away' = playerTeam === homeId ? 'home' : 'away'
  const data = {
    match: matchId,
    user: (user as { id: number }).id,
    player: playerId,
    playerName: String((player as { name?: unknown }).name ?? ''),
    shirtNumber: Number((player as { shirtNumber?: unknown }).shirtNumber) || undefined,
    side,
  }

  // Eén stem per supporter per wedstrijd: bestaande stem updaten, anders aanmaken.
  const existing = await payload
    .find({ collection: 'match-mvp-votes', where: { and: [{ match: { equals: matchId } }, { user: { equals: (user as { id: number }).id } }] }, depth: 0, limit: 1 })
    .catch(() => ({ docs: [] as { id: number }[] }))
  if (existing.docs[0]) {
    await payload.update({ collection: 'match-mvp-votes', id: (existing.docs[0] as { id: number }).id, data, overrideAccess: true })
  } else {
    await payload.create({ collection: 'match-mvp-votes', data, overrideAccess: true })
  }

  const totals = await loadTotals(payload, matchId)
  // Live: duw de nieuwe stand naar alle kijkers van dit kanaal (best-effort).
  setMvpTotals(matchId, totals)
  return NextResponse.json({ ok: true, myVote: playerId, totals })
}
