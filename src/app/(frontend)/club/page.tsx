import { headers } from 'next/headers'
import Link from 'next/link'

import { ProfileTools } from '@/components/ProfileTools'
import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { getProfile } from '@/lib/profiles'
import { reeksNaam } from '@/lib/reeksen'
import { ClaimButton } from './ClaimButton'

export const dynamic = 'force-dynamic'

const nameOf = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')

type Row = {
  id: number
  reeks: string
  date: string
  status: string
  side: 'home' | 'away'
  home: string
  away: string
  ownReady: boolean
  location: string
  coachName: string | null
  coachMine: boolean
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Mijn club</span></h1>
        <ProfileTools profile={getProfile('clubs')} currentHref="/club" />
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

  const teamIdSet = new Set(teamIds.map(Number))
  const myUserId = Number((user as { id?: number }).id)
  const matches = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { status: { in: ['scheduled', 'live'] } },
        { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] },
      ],
    },
    sort: 'date',
    depth: 2,
    limit: 200,
  })

  const rows: Row[] = []
  for (const m of matches.docs) {
    if ((m as { isDemo?: boolean }).isDemo || (m as { analyseOnly?: boolean }).analyseOnly) continue
    const homeTeam = m.homeTeam as { id?: number; name?: string; club?: unknown } | null
    const awayTeam = m.awayTeam as { id?: number; name?: string; club?: unknown } | null
    const side: 'home' | 'away' = homeTeam?.id != null && teamIdSet.has(Number(homeTeam.id)) ? 'home' : 'away'
    try {
      const r = await getMatchReadiness(payload, m.id)
      const homeClub = homeTeam?.club as { name?: string; accommodatie?: string } | null
      const coach = (side === 'home' ? m.homeCoach : m.awayCoach) as { id?: number; name?: string; email?: string } | null
      rows.push({
        id: m.id,
        reeks: reeksNaam(m.reeks),
        date: m.date,
        status: String(m.status ?? 'scheduled'),
        side,
        home: nameOf(homeTeam),
        away: nameOf(awayTeam),
        ownReady: side === 'home' ? r.homeOk : r.awayOk,
        // Locatie = terrein van de thuisclub (waar je moet zijn).
        location: (homeClub?.accommodatie || homeClub?.name || nameOf(homeTeam)).trim(),
        coachName: coach ? (coach.name || coach.email || 'Geclaimd') : null,
        coachMine: coach?.id != null && Number(coach.id) === myUserId,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  return (
    <Shell>
      <p className="wb-intro">
        {club?.name ? <><strong>{club.name}</strong> — </> : null}je komende wedstrijden (thuis én uit). Bereid je eigen
        kant voor (opstelling), claim de wedstrijden die jij doet, en — als thuisploeg — start de wedstrijd voor het
        wedstrijdblad.
      </p>
      {rows.length === 0 ? (
        <p className="empty">Geen geplande wedstrijden voor je ploegen.</p>
      ) : (
        <div className="club-list">
          {rows.map((m) => (
            <div key={m.id} className="club-match">
              <div className="club-match-info">
                <span className="club-match-toprow">
                  <span className={`club-role ${m.side}`}>{m.side === 'home' ? 'THUIS' : 'UIT'}</span>
                  <span className="club-match-reeks">{m.reeks}</span>
                  {m.status === 'live' ? (
                    <span className="club-badge live">● LIVE</span>
                  ) : m.ownReady ? (
                    <span className="club-badge ready">✓ Klaar</span>
                  ) : (
                    <span className="club-badge todo">○ Voor te bereiden</span>
                  )}
                </span>
                <span className="club-match-teams">{m.home} <span className="club-vs">–</span> {m.away}</span>
                <span className="club-match-meta">
                  {new Date(m.date).toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {m.location ? <> · 📍 {m.location}</> : null}
                </span>
                <span className="club-match-coach">
                  <ClaimButton matchId={m.id} coachName={m.coachName} mine={m.coachMine} />
                </span>
              </div>
              <div className="club-match-actions">
                <Link href={`/opstelling/${m.id}`} className="btn btn-primary">Opstelling</Link>
                {m.side === 'home' ? (
                  <Link href={`/scorekeeper/${m.id}`} className="btn btn-ghost">{m.status === 'live' ? 'Aantekenen' : 'Start ▶'}</Link>
                ) : (
                  <Link href={`/match/${m.id}`} className="btn btn-ghost">Bekijk</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
