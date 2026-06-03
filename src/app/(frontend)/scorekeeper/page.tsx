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
  // Status van de twee start-voorwaarden, zodat de hub toont wat er nog moet gebeuren.
  opstellingOk: boolean
  refereeOk: boolean
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
  for (const m of matches.docs) {
    // Demo-/oefenwedstrijden horen niet in de gewone lijsten — die start je via /demo.
    if ((m as { isDemo?: boolean }).isDemo) continue
    try {
      const s = await buildMatchState(payload, m.id)
      const isLive = s.match.status === 'live'
      const r = isLive ? null : await getMatchReadiness(payload, m.id)
      rows.push({
        id: m.id,
        status: s.match.status,
        date: m.date,
        home: s.teams.home.name,
        away: s.teams.away.name,
        score: s.score,
        ready: isLive ? true : (r?.ready ?? false),
        opstellingOk: isLive ? true : Boolean(r?.homeOk && r?.awayOk),
        refereeOk: isLive ? true : Boolean(r?.refereeOk),
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
        <p className="empty">
          <Link href="/demo" className="sk-demo-cta">🎓 Start de demo — 8 spelers per kant, uitleg in stappen</Link>
        </p>
      </section>

      <Section title="Live — nu aan het aantekenen" rows={live} empty="Geen lopende wedstrijden." />
      <Section title="Gepland — eerst klaarzetten, dan starten" rows={scheduled} empty="Geen geplande wedstrijden. Maak er een aan via Beheer." />
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
            <div key={m.id} className="mh-item">
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
                      {m.ready ? (
                        <strong className="mc-ready">✓ klaar — tik om te starten ▶</strong>
                      ) : (
                        <span className="mc-locked">🔒 nog niet startklaar</span>
                      )}
                    </span>
                  )}
                </span>
                <span className="away">{m.away}</span>
              </Link>
              <MatchSteps m={m} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Genummerde, statusbewuste stappenstrook onder elke wedstrijd. Maakt zichtbaar wat er vóór
// de start nog moet gebeuren (opstelling + akkoord scheidsrechter) en welke stap de start
// vrijgeeft, zodat niemand nog hoeft te raden waar hij moet zijn.
function MatchSteps({ m }: { m: Row }) {
  const live = m.status === 'live'
  return (
    <div className="mh-steps">
      <span className="mh-steps-lead">{live ? 'Stappen' : 'Vóór de start'}</span>
      <Step n={1} href={`/opstelling/${m.id}`} label="Opstelling" done={m.opstellingOk} />
      <Step n={2} href={`/scheidsrechter/${m.id}`} label="Scheidsrechter" done={m.refereeOk} />
      <Step
        n={3}
        href={`/scorekeeper/${m.id}`}
        label={live ? 'Aantekenen' : 'Starten'}
        state={live ? 'active' : m.ready ? 'ready' : 'locked'}
        isGate
      />
      <Step n={4} href={`/aftekenen/${m.id}`} label="Aftekenen" muted={!live} />
    </div>
  )
}

function Step({
  n,
  href,
  label,
  done,
  state,
  muted,
  isGate,
}: {
  n: number
  href: string
  label: string
  done?: boolean
  state?: 'active' | 'ready' | 'locked'
  muted?: boolean
  isGate?: boolean
}) {
  const cls = [
    'mh-step',
    done ? 'done' : '',
    muted ? 'muted' : '',
    isGate ? 'gate' : '',
    state ? `is-${state}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Link href={href} className={cls}>
      <span className="mh-step-num">{done ? '✓' : isGate ? '▶' : n}</span>
      <span className="mh-step-label">{label}</span>
    </Link>
  )
}
