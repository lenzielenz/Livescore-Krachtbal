import Link from 'next/link'

import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

type Row = { id: number; status: string; date: string; home: string; away: string; score: { home: number; away: number } }

export default async function ScorekeeperHub() {
  const payload = await getPayloadClient()
  const matches = await payload.find({
    collection: 'matches',
    where: { status: { in: ['scheduled', 'live'] } },
    sort: 'date',
    depth: 0,
    limit: 100,
  })

  const rows: Row[] = []
  for (const m of matches.docs) {
    try {
      const s = await buildMatchState(payload, m.id)
      rows.push({ id: m.id, status: s.match.status, date: m.date, home: s.teams.home.name, away: s.teams.away.name, score: s.score })
    } catch {
      // Wedstrijd met ontbrekende ploeg-referentie overslaan.
    }
  }

  const live = rows.filter((r) => r.status === 'live')
  const scheduled = rows.filter((r) => r.status === 'scheduled')

  return (
    <div className="site">
      <header className="site-header">
        <h1>
          Aantekenen <span className="brand">·</span> Scorekeeper
        </h1>
        <nav className="site-nav">
          <Link href="/">Live-site</Link>
          <Link href="/admin">Beheer</Link>
        </nav>
      </header>
      <p className="empty">Kies een wedstrijd om te starten of bij te werken. Open dit scherm op een tablet bij het veld.</p>

      <Section title="Live — nu aan het aantekenen" rows={live} empty="Geen lopende wedstrijden." />
      <Section title="Gepland — klaar om te starten" rows={scheduled} empty="Geen geplande wedstrijden. Maak er een aan via Beheer." />
    </div>
  )
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="match-list">
          {rows.map((m) => (
            <Link href={`/scorekeeper/${m.id}`} key={m.id} className="match-card">
              <span className="home">{m.home}</span>
              <span className="mid">
                {m.status === 'live' ? (
                  <>
                    <div className="mc-score">{m.score.home} – {m.score.away}</div>
                    <span className="badge-live">LIVE · aantekenen</span>
                  </>
                ) : (
                  <span className="mc-meta">
                    {new Date(m.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    <br />▶ starten
                  </span>
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
