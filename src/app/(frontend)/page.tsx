import Link from 'next/link'

import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

type Summary = {
  id: number
  status: string
  date: string
  home: string
  away: string
  score: { home: number; away: number }
}

export default async function HomePage() {
  const payload = await getPayloadClient()
  const matches = await payload.find({ collection: 'matches', sort: '-date', depth: 0, limit: 50 })

  const settled = await Promise.all(
    matches.docs.map(async (m): Promise<Summary | null> => {
      try {
        const s = await buildMatchState(payload, m.id)
        return {
          id: m.id,
          status: s.match.status,
          date: m.date,
          home: s.teams.home.name,
          away: s.teams.away.name,
          score: s.score,
        }
      } catch {
        // Wedstrijd met ontbrekende ploeg-referentie: overslaan i.p.v. de pagina laten crashen.
        return null
      }
    }),
  )
  const summaries: Summary[] = settled.filter((s): s is Summary => s !== null)

  const live = summaries.filter((s) => s.status === 'live')
  const scheduled = summaries.filter((s) => s.status === 'scheduled')
  const finished = summaries.filter((s) => s.status === 'finished')

  return (
    <div className="site">
      <header className="site-header">
        <h1>
          <span className="brand">Krachtbal</span> Live
        </h1>
        <nav className="site-nav">
          <Link href="/live">Live</Link>
          <Link href="/scorekeeper">Aantekenen</Link>
          <Link href="/admin">Beheer</Link>
        </nav>
      </header>

      <Section title="Live" matches={live} emptyText="Geen wedstrijden live." />
      <Section title="Gepland" matches={scheduled} emptyText="Geen geplande wedstrijden." />
      <Section title="Afgelopen" matches={finished} emptyText="Geen afgelopen wedstrijden." />
    </div>
  )
}

function Section({ title, matches, emptyText }: { title: string; matches: Summary[]; emptyText: string }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      {matches.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <div className="match-list">
          {matches.map((m) => (
            <Link href={`/match/${m.id}`} key={m.id} className="match-card">
              <span className="home">{m.home}</span>
              <span className="mid">
                {m.status === 'scheduled' ? (
                  <span className="mc-meta">{new Date(m.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                ) : (
                  <>
                    <div className="mc-score">{m.score.home} – {m.score.away}</div>
                    {m.status === 'live' && <span className="badge-live">LIVE</span>}
                  </>
                )}
              </span>
              <span className="away">{m.away}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
