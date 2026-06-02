import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { buildMatchState } from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

type Row = {
  id: number
  status: string
  date: string
  home: string
  away: string
  score: { home: number; away: number }
  ready: boolean
}

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
  let demoId: number | null = null
  for (const m of matches.docs) {
    // Demo-/oefenwedstrijden horen niet in de gewone lijsten — ze krijgen een eigen knop.
    if ((m as { isDemo?: boolean }).isDemo) {
      if (demoId == null) demoId = m.id
      continue
    }
    try {
      const s = await buildMatchState(payload, m.id)
      const ready = s.match.status === 'live' ? true : (await getMatchReadiness(payload, m.id)).ready
      rows.push({
        id: m.id,
        status: s.match.status,
        date: m.date,
        home: s.teams.home.name,
        away: s.teams.away.name,
        score: s.score,
        ready,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg-referentie overslaan.
    }
  }

  const live = rows.filter((r) => r.status === 'live')
  const scheduled = rows.filter((r) => r.status === 'scheduled')

  return (
    <>
      <SiteHeader active="aantekenen" />
      <div className="site">
      <h1 className="page-title">
        Aantekenen <span className="brand">·</span> Scorekeeper
      </h1>
      <p className="empty">Kies een wedstrijd om te starten of bij te werken. Open dit scherm op een tablet bij het veld.</p>

      <section>
        <h2 className="section-title">Nieuw? Probeer de demo</h2>
        {demoId != null ? (
          <p className="empty">
            <Link href={`/scorekeeper/${demoId}`} className="sk-demo-cta">🎓 Start de demo — uitleg in stappen</Link>
          </p>
        ) : (
          <p className="empty">Nog geen demo beschikbaar. Maak in Beheer een wedstrijd aan en vink &laquo;Demo / oefenwedstrijd&raquo; aan.</p>
        )}
      </section>

      <Section title="Live — nu aan het aantekenen" rows={live} empty="Geen lopende wedstrijden." />
      <Section title="Gepland — klaar om te starten" rows={scheduled} empty="Geen geplande wedstrijden. Maak er een aan via Beheer." />
      </div>
    </>
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
            <div key={m.id}>
              <Link href={`/scorekeeper/${m.id}`} className="match-card">
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
                      <br />
                      {m.ready ? '✓ klaar — ▶ starten' : '🔒 vergrendeld'}
                    </span>
                  )}
                </span>
                <span className="away">{m.away}</span>
              </Link>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  padding: '6px 0 2px',
                  fontSize: 13,
                }}
              >
                <Link href={`/opstelling/${m.id}`}>Opstelling</Link>
                <Link href={`/scheidsrechter/${m.id}`}>Scheidsrechter</Link>
                <Link href={`/aftekenen/${m.id}`}>Aftekenen</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
