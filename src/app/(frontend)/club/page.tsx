import { headers } from 'next/headers'
import Link from 'next/link'

import { ProfileTools } from '@/components/ProfileTools'
import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { clinchStatus } from '@/lib/championship'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'
import { getProfile } from '@/lib/profiles'
import { buildReeksStandings } from '@/lib/reeks-standings'
import { reeksNaam, REEKS_OPTIONS } from '@/lib/reeksen'
import { ClaimButton } from './ClaimButton'

export const dynamic = 'force-dynamic'

const nameOf = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')

// Ploeg-groepering: 1NAH+1NAHB samen, 2NAH+2NAHB samen, alle jeugd samen, de rest apart.
const HEREN_1 = new Set(['1NAH', '1NAHB'])
const HEREN_2 = new Set(['2NAH', '2NAHB'])
const JEUGD = new Set(['U18J', 'U18M', 'U16J', 'U16M', 'U14J', 'U14M', 'U12'])
const REEKS_ORDER = new Map<string, number>(REEKS_OPTIONS.map((o, i) => [o.value, i]))
function groupOf(code: string): { key: string; label: string; order: number } {
  if (HEREN_1.has(code)) return { key: '1nh', label: '1ste Nationale Heren', order: REEKS_ORDER.get('1NAH') ?? 0 }
  if (HEREN_2.has(code)) return { key: '2nh', label: '2de Nationale Heren', order: REEKS_ORDER.get('2NAH') ?? 0 }
  if (JEUGD.has(code)) return { key: 'jeugd', label: 'Jeugd', order: 100 }
  return { key: code, label: reeksNaam(code), order: REEKS_ORDER.get(code) ?? 50 }
}

type Row = {
  id: number
  reeks: string
  reeksCode: string
  date: string
  status: string
  side: 'home' | 'away'
  home: string
  away: string
  ownReady: boolean
  location: string
  coachName: string | null
  coachMine: boolean
  // Overname-aanvraag: wie vraagt om over te nemen, en of dat ik ben.
  takeoverName: string | null
  takeoverMine: boolean
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
        <p className="empty">Log in als club-beheerder om je komende wedstrijden en opstellingen te beheren. <Link href="/inloggen" className="hub-pill">Inloggen →</Link></p>
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
      const takeover = (side === 'home' ? m.homeTakeover : m.awayTakeover) as { id?: number; name?: string; email?: string } | null
      rows.push({
        id: m.id,
        reeks: reeksNaam(m.reeks),
        reeksCode: String(m.reeks ?? ''),
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
        takeoverName: takeover ? (takeover.name || takeover.email || 'Iemand') : null,
        takeoverMine: takeover?.id != null && Number(takeover.id) === myUserId,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  // Groepeer per ploeg(groep).
  const groups = new Map<string, { label: string; order: number; rows: Row[] }>()
  for (const r of rows) {
    const g = groupOf(r.reeksCode)
    let entry = groups.get(g.key)
    if (!entry) {
      entry = { label: g.label, order: g.order, rows: [] }
      groups.set(g.key, entry)
    }
    entry.rows.push(r)
  }
  const groupList = [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))

  // Kampioenschap: per ploeg (in een competitiereeks) berekenen of ze (bijna) kampioen is.
  const COMPETITIE = new Set<string>(REEKS_OPTIONS.map((o) => o.value).filter((v) => !['beker', 'recreatief', 'andere'].includes(v)))
  const clubTeams = teams.docs
    .map((t) => ({ id: Number(t.id), name: String((t as { name?: unknown }).name ?? '—'), reeks: String((t as { reeks?: unknown }).reeks ?? '') }))
    .filter((t) => COMPETITIE.has(t.reeks))
  const reeksSet = [...new Set(clubTeams.map((t) => t.reeks))]
  type Champ = { teamName: string; reeks: string; clinched: boolean; leading: boolean; pointsToClinch: number | null; winsToClinch: number | null }
  const champs: Champ[] = []
  for (const reeks of reeksSet) {
    const sb = await buildReeksStandings(payload, reeks).catch(() => null)
    if (!sb || sb.standings.length < 2) continue
    for (const t of clubTeams.filter((ct) => ct.reeks === reeks)) {
      const st = clinchStatus(sb.standings, sb.remaining, t.id)
      if (!st || !(st.clinched || st.leading)) continue
      champs.push({ teamName: t.name, reeks: reeksNaam(reeks as Parameters<typeof reeksNaam>[0]), clinched: st.clinched, leading: st.leading, pointsToClinch: st.pointsToClinch, winsToClinch: st.winsToClinch })
    }
  }
  champs.sort((a, b) => Number(b.clinched) - Number(a.clinched))

  return (
    <Shell>
      <p className="wb-intro">
        {club?.name ? <><strong>{club.name}</strong> — </> : null}je komende wedstrijden (thuis én uit), per ploeg. Bereid
        je eigen kant voor (opstelling), claim de wedstrijden die jij doet, en — als thuisploeg — start de wedstrijd voor
        het wedstrijdblad.
      </p>

      {champs.length > 0 && (
        <div className="club-champ-wrap">
          {champs.map((c, i) => {
            const almost = c.winsToClinch != null && c.winsToClinch <= 2
            const cls = c.clinched ? 'champion' : almost ? 'almost' : 'leading'
            return (
              <div key={i} className={`club-champ ${cls}`}>
                <span className="club-champ-ico" aria-hidden>{c.clinched ? '🏆' : almost ? '🔥' : '📈'}</span>
                <span className="club-champ-text">
                  {c.clinched ? (
                    <><strong>{c.teamName}</strong> is wiskundig <strong>KAMPIOEN</strong> in {c.reeks}! 🎉</>
                  ) : c.pointsToClinch != null ? (
                    <>
                      <strong>{c.teamName}</strong> leidt in {c.reeks} — nog <strong>{c.pointsToClinch} {c.pointsToClinch === 1 ? 'punt' : 'punten'}</strong>
                      {c.winsToClinch != null && <> ({c.winsToClinch} {c.winsToClinch === 1 ? 'overwinning' : 'overwinningen'})</>} voor de titel.{almost ? ' Bijna zover!' : ''}
                    </>
                  ) : (
                    <><strong>{c.teamName}</strong> staat aan de leiding in {c.reeks}.</>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty">Geen geplande wedstrijden voor je ploegen.</p>
      ) : (
        groupList.map((g) => (
        <section key={g.label} className="club-group">
          <h2 className="club-group-h">{g.label} <span className="club-group-n">{g.rows.length}</span></h2>
          <div className="club-list">
          {g.rows.map((m) => (
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
                  <ClaimButton matchId={m.id} coachName={m.coachName} mine={m.coachMine} takeoverName={m.takeoverName} takeoverMine={m.takeoverMine} />
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
        </section>
        ))
      )}
    </Shell>
  )
}
