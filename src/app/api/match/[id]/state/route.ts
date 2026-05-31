import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) {
    return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })
  }
  try {
    const payload = await getPayloadClient()
    const state = await buildMatchState(payload, matchId)
    return Response.json(state)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 })
  }
}
