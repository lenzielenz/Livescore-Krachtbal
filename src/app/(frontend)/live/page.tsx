import Link from 'next/link'

import { Scoreboard } from '@/components/Scoreboard'
import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

export default async function LivePage() {
  const payload = await getPayloadClient()
  const liveMatches = await payload.find({
    collection: 'matches',
    where: { status: { equals: 'live' } },
    sort: '-date',
    depth: 0,
    limit: 20,
  })

  if (liveMatches.docs.length === 0) {
    return (
      <div className="site">
        <Link href="/" className="back-link">
          ← Home
        </Link>
        <h2 className="section-title">Live</h2>
        <p className="empty">Er is momenteel geen wedstrijd live.</p>
      </div>
    )
  }

  const featured = liveMatches.docs[0]
  const [state, timeline] = await Promise.all([
    buildMatchState(payload, featured.id),
    buildTimeline(payload, featured.id),
  ])

  const others = await Promise.all(
    liveMatches.docs.slice(1).map(async (m) => {
      const s = await buildMatchState(payload, m.id)
      return { id: m.id, home: s.teams.home.name, away: s.teams.away.name, score: s.score }
    }),
  )

  return (
    <div className="site">
      <Link href="/" className="back-link">
        ← Home
      </Link>
      <Scoreboard matchId={featured.id} initial={{ state, timeline }} />

      {others.length > 0 && (
        <>
          <h2 className="section-title">Andere live wedstrijden</h2>
          <div className="match-list">
            {others.map((m) => (
              <Link href={`/match/${m.id}`} key={m.id} className="match-card">
                <span className="home">{m.home}</span>
                <span className="mid">
                  <div className="mc-score">{m.score.home} – {m.score.away}</div>
                  <span className="badge-live">LIVE</span>
                </span>
                <span className="away">{m.away}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
