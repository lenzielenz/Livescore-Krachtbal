import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { withLock } from '@/lib/async-mutex'
import { getPayloadClient } from '@/lib/payload-client'
import {
  castVote,
  claimScorer,
  mayClaim,
  mayVote,
  releaseScorer,
  trustView,
  voteWindowOpen,
  type VoteKind,
} from '@/lib/score-trust'
import { isOfficialScore, readMatchTrust, userTrustScore, writeMatchTrust } from '@/lib/score-trust-store'

export const dynamic = 'force-dynamic'

// Vertrouwenslaag op de supporters-score (zie src/lib/score-trust.ts):
//   - claim/release : één official scorer per wedstrijd — zijn invoer gaat vóór op de crowd
//   - confirm/dispute : andere kijkers bevestigen of betwisten de stand (gewogen consensus)
// GET geeft het huidige label + wat DEZE bezoeker mag doen.

type Me = { id: number; name: string } | null

async function currentUser(payload: Awaited<ReturnType<typeof getPayloadClient>>): Promise<Me> {
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) return null
  const id = Number((user as { id?: unknown }).id)
  if (!Number.isFinite(id) || id <= 0) return null
  const name = String((user as { name?: unknown }).name ?? '').trim() || 'Supporter'
  return { id, name }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return NextResponse.json({ error: 'Ongeldig match-id' }, { status: 400 })

  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return NextResponse.json({ error: 'Wedstrijd niet gevonden' }, { status: 404 })

  const [trust, official, me] = await Promise.all([
    readMatchTrust(payload, matchId),
    isOfficialScore(payload),
    currentUser(payload),
  ])
  const now = Date.now()
  const windowOpen = voteWindowOpen(
    match.status as string,
    (match as { finishedAt?: string | null }).finishedAt ?? null,
    now,
  )
  return NextResponse.json({
    trust: trustView(trust, { official, now, live: match.status === 'live' }),
    official,
    me: me
      ? {
          isScorer: trust.scorerId === me.id,
          mayClaim: !official && match.status !== 'finished' && mayClaim(trust, me.id, now, match.status === 'live'),
          mayVote: !official && windowOpen && mayVote(trust, me.id),
          myVote: trust.confirms.some((v) => v.userId === me.id)
            ? 'confirm'
            : trust.disputes.some((v) => v.userId === me.id)
              ? 'dispute'
              : null,
        }
      : null,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return NextResponse.json({ error: 'Ongeldig match-id' }, { status: 400 })

  let body: { action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const action = String(body.action ?? '')
  if (!['claim', 'release', 'confirm', 'dispute'].includes(action)) {
    return NextResponse.json({ error: `Onbekende actie: ${action}` }, { status: 400 })
  }

  const payload = await getPayloadClient()
  const me = await currentUser(payload)
  if (!me) return NextResponse.json({ error: 'Log in om de score te bevestigen.' }, { status: 401 })

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return NextResponse.json({ error: 'Wedstrijd niet gevonden' }, { status: 404 })
  if ((match as { analyseOnly?: boolean }).analyseOnly) {
    return NextResponse.json({ error: 'Analysewedstrijden hebben geen publieke vertrouwenslaag.' }, { status: 403 })
  }
  // In de federatieflow bepaalt de scheidsrechter de uitslag — daar valt niets te claimen of te
  // bevestigen. De vertrouwenslaag dient enkel voor vrije supporters-scores.
  if (await isOfficialScore(payload)) {
    return NextResponse.json({ error: 'Deze wedstrijd loopt via de officiële wedstrijdflow.' }, { status: 409 })
  }

  // Lees-wijzig-schrijf op één json-kolom: serialiseren, anders gaat een gelijktijdige stem verloren.
  return await withLock(`trust:${matchId}`, async () => {
    const trust = await readMatchTrust(payload, matchId)
    const now = Date.now()

    if (action === 'release') {
      if (trust.scorerId !== me.id) {
        return NextResponse.json({ error: 'Je bent niet de aangeduide aantekenaar.' }, { status: 403 })
      }
      const next = releaseScorer(trust, me.id)
      await writeMatchTrust(payload, matchId, next)
      return NextResponse.json({ ok: true, trust: trustView(next, { official: false, now }) })
    }

    if (action === 'claim') {
      if (match.status === 'finished') {
        return NextResponse.json({ error: 'Deze wedstrijd is afgelopen.' }, { status: 409 })
      }
      if (!mayClaim(trust, me.id, now, match.status === 'live')) {
        return NextResponse.json(
          { error: `${trust.scorerName ?? 'Iemand anders'} tekent deze wedstrijd al aan.` },
          { status: 409 },
        )
      }
      const next = claimScorer(trust, { ...me, trust: await userTrustScore(payload, me.id) }, now)
      await writeMatchTrust(payload, matchId, next)
      return NextResponse.json({ ok: true, trust: trustView(next, { official: false, now }) })
    }

    // confirm / dispute
    if (!voteWindowOpen(match.status as string, (match as { finishedAt?: string | null }).finishedAt ?? null, now)) {
      return NextResponse.json(
        { error: 'Bevestigen kan tijdens de wedstrijd en tot een dag erna.' },
        { status: 403 },
      )
    }
    if (!mayVote(trust, me.id)) {
      return NextResponse.json({ error: 'Je tekende zelf mee aan — je eigen score bevestigen kan niet.' }, { status: 403 })
    }
    const next = castVote(trust, { ...me, trust: await userTrustScore(payload, me.id) }, action as VoteKind, now)
    await writeMatchTrust(payload, matchId, next)
    return NextResponse.json({
      ok: true,
      trust: trustView(next, { official: false, now }),
      myVote: next.confirms.some((v) => v.userId === me.id)
        ? 'confirm'
        : next.disputes.some((v) => v.userId === me.id)
          ? 'dispute'
          : null,
    })
  })
}
