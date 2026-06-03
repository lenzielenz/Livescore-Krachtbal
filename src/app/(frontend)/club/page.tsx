import { headers } from 'next/headers'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { buildMatchState } from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'

const reeksLabel = (v: unknown) => REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : 'Overig')

type Row = { id: number; reeks: string; date: string; status: string; home: string; away: string; ready: boolean }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="meer" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Mijn club</span></h1>
        {children}
      </div>
    </>
  )
}

// Club-dashboard: een club-beheerder ziet zijn komende wedstrijden en vult vlot de opstelling in.
export default async function ClubPage() {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) {
    return (
      <Shell>
        <p className="empty">Log in als club-beheerder om je komende wedstrijden en opstellingen te beheren. <Link href="/admin" className="hub-pill">Inloggen →</Link></p>
      </Shell>
    )
  }
  const clubId = userClubId(user)
  if (clubId == null) {
    return (
      <Shell>
        <p className="empty">Je account is nog niet aan een club gekoppeld. Vraag de federatie om je gebruiker aan je club te koppelen.</p>
      </Shell>
    )
  }

  const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
  const teams = await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 200 })
  const teamIds = teams.docs.map((t) => t.id)
  if (teamIds.length === 0) {
    return (
      <Shell>
        <p className="empty">{club?.name ? `${club.name}: ` : ''}nog geen ploegen geregistreerd.</p>
      </Shell>
    )
  }

  const matches = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { status: { in: ['scheduled', 'live'] } },
        { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] },
      ],
    },
    sort: 'date',
    depth: 0,
    limit: 100,
  })

  const rows: Row[] = []
  for (const m of matches.docs) {
    if ((m as { isDemo?: boolean }).isDemo) continue
    try {
      const s = await buildMatchState(payload, m.id)
      rows.push({
        id: m.id,
        reeks: reeksLabel(m.reeks),
        date: m.date,
        status: s.match.status,
        home: s.teams.home.name,
        away: s.teams.away.name,
        ready: (await getMatchReadiness(payload, m.id)).ready,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  return (
    <Shell>
      <p className="wb-intro">
        {club?.name ? <><strong>{club.name}</strong> — </> : null}je komende wedstrijden. Vul tijdig de opstelling in;
        de vaste opstelling wordt automatisch voorgesteld.
      </p>
      {rows.length === 0 ? (
        <p className="empty">Geen geplande wedstrijden voor je ploegen.</p>
      ) : (
        <div className="club-list">
          {rows.map((m) => (
            <div key={m.id} className="club-match">
              <div className="club-match-info">
                <span className="club-match-reeks">{m.reeks}</span>
                <span className="club-match-teams">{m.home} <span className="club-vs">–</span> {m.away}</span>
                <span className="club-match-meta">
                  {new Date(m.date).toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {m.status === 'live' ? ' · LIVE' : m.ready ? ' · ✓ klaar' : ' · 🔒 nog in te vullen'}
                </span>
              </div>
              <div className="club-match-actions">
                <Link href={`/opstelling/${m.id}`} className="btn btn-primary">Opstelling</Link>
                <Link href={`/match/${m.id}`} className="btn btn-ghost">Bekijk</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
