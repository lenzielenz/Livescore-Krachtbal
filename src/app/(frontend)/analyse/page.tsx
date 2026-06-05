import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import './analyse.css'

export const dynamic = 'force-dynamic'

// Analyse-hub (admin-only): kies een afgelopen wedstrijd om alle data te bekijken.
export default async function AnalysePage() {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse. Vraag een admin om je toegang te geven.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const matchRes = await payload
    .find({ collection: 'matches', where: { status: { equals: 'finished' } }, sort: '-date', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const docs = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)
  const cards = await buildScoreboards(payload, docs as Parameters<typeof buildScoreboards>[1])

  const rows = docs
    .map((m) => {
      const id = (m as { id: number }).id
      const c = cards.get(id)
      if (!c) return null
      return {
        id,
        reeks: reeksNaam((m as { reeks?: unknown }).reeks),
        date: (m as { date?: string }).date ?? '',
        home: c.teams.home,
        away: c.teams.away,
        score: c.score,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r != null)

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Analyse</span></h1>
        <p className="an-intro">Kies een afgelopen wedstrijd om alle data per speler en ploeg te bekijken.</p>
        <p className="an-hub-links">
          <Link href="/analyse/seizoen" className="sk-demo-cta">📊 Seizoensanalyse per reeks →</Link>
          <Link href="/analyse/spelers" className="sk-demo-cta">🎯 Spelersradar &amp; vergelijken →</Link>
        </p>

        {rows.length === 0 ? (
          <p className="empty">Nog geen afgelopen wedstrijden om te analyseren.</p>
        ) : (
          <div className="an-list">
            {rows.map((r) => (
              <Link key={r.id} href={`/analyse/${r.id}`} className="an-card">
                <span className="an-card-reeks">{r.reeks}</span>
                <span className="an-card-row">
                  <span className="an-team">
                    <TeamLogo name={r.home.name} logoUrl={r.home.logoUrl} logoFit={r.home.logoFit} side="home" size="sm" ringColor={r.home.colors?.primary} />
                    <span className="an-team-nm">{r.home.name}</span>
                  </span>
                  <span className="an-score">{r.score.home}<span className="an-dash">–</span>{r.score.away}</span>
                  <span className="an-team away">
                    <span className="an-team-nm">{r.away.name}</span>
                    <TeamLogo name={r.away.name} logoUrl={r.away.logoUrl} logoFit={r.away.logoFit} side="away" size="sm" ringColor={r.away.colors?.primary} />
                  </span>
                </span>
                <span className="an-card-date">
                  {r.date ? new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
