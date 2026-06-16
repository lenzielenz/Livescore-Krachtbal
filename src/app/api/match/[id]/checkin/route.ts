import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { sanitizeCheckins, toggleCheckin, isCheckedIn } from '@/lib/checkins'
import { getPayloadClient } from '@/lib/payload-client'

// "Ik ben erbij": zet de check-in voor deze wedstrijd aan/uit voor de ingelogde supporter.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return NextResponse.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return NextResponse.json({ error: 'Log in om aan te geven dat je erbij bent.' }, { status: 401 })

  const list = sanitizeCheckins((user as { checkins?: unknown }).checkins)
  const next = toggleCheckin(list, matchId)
  await payload.update({ collection: 'users', id: (user as { id: number }).id, data: { checkins: next }, overrideAccess: true })
  return NextResponse.json({ ok: true, checkedIn: isCheckedIn(next, matchId) })
}
