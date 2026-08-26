import Link from 'next/link'

import { ProfileTools } from '@/components/ProfileTools'
import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { clinchStatus } from '@/lib/championship'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { sheetOpenForScoring } from '@/lib/matchsheet-workflow'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { getProfile } from '@/lib/profiles'
import { buildReeksStandings } from '@/lib/reeks-standings'
import { reeksNaam, REEKS_OPTIONS } from '@/lib/reeksen'
import { ClaimButton } from './ClaimButton'
import { MyTeamsPicker } from './MyTeamsPicker'

export const dynamic = 'force-dynamic'

const nameOf = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')

// Ploeg-groepering: 1NAH+1NAHB samen, 2NAH+2NAHB samen, alle jeugd samen, de rest apart.
const HEREN_1 = new Set(['1NAH', '1NAHB'])
const HEREN_2 = new Set(['2NAH', '2NAHB'])
const JEUGD = new Set([
  'U18J', 'U18M',
  'U16J', 'U16M', 'U16MA', 'U16MB',
  'U14J', 'U14JA', 'U14JB', 'U14M',
  'U12', 'U12A', 'U12B',
])
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
  /** Id van de eigen (club-)ploeg in deze wedstrijd, voor de "Mijn ploegen"-focus. */
  myTeamId: number
  home: string
  away: string
  ownReady: boolean
  location: string
  coachName: string | null
  coachMine: boolean
  // Overname-aanvraag: wie vraagt om over te nemen, en of dat ik ben.
  takeoverName: string | null
  takeoverMine: boolean
  // Toegewezen scheidsrechter (uit het wedstrijdblad), indien gekoppeld.
  refereeName: string | null
  // Status van het wedstrijdblad: bepaalt of de scheidsrechter het aantekenen al heeft opengezet.
  sheetStatus: string | null
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
export default async function ClubPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams
  const showAll = alle === '1'
  const payload = await getPayloadClient()
  const user = await getAuthUser()
  if (!user) {
    return (
      <Shell>
        <p className="empty">Log in als club-beheerder om je komende wedstrijden en opstellingen te beheren. <Link href="/inloggen" className="hub-pill">Inloggen →</Link></p>
      </Shell>
    )
  }
  const clubId = userClubId(user)
  const isBeheerder = hasRole(user, 'club-beheerder')
  if (clubId == null) {
    return (
      <Shell>
        <p className="empty">Je account is nog niet aan een club gekoppeld. Vraag de federatie om je gebruiker aan je club te koppelen.</p>
      </Shell>
    )
  }

  const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
  const teams = await payload.find({ collection: 'teams', where: { and: [{ club: { equals: clubId } }, competitionWhere()] }, depth: 0, limit: 200 })
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
        competitionWhere(),
      ],
    },
    sort: 'date',
    depth: 2,
    limit: 200,
  })

  // Toegewezen scheidsrechter per wedstrijd (uit het wedstrijdblad) — zodat het in de planning zichtbaar is.
  const planMatchIds = matches.docs.map((m) => m.id)
  const planSheets = planMatchIds.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: planMatchIds } }, depth: 1, pagination: false }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const refByMatch = new Map<number, string>()
  const sheetStatusByMatch = new Map<number, string>()
  for (const s of planSheets.docs) {
    const mid = (s as { match?: unknown }).match
    const midId = mid && typeof mid === 'object' ? Number((mid as { id?: number }).id) : Number(mid)
    const ar = (s as { assignedReferee?: unknown }).assignedReferee
    const name = ar && typeof ar === 'object' ? String((ar as { name?: unknown }).name ?? '') : ''
    if (Number.isFinite(midId) && name) refByMatch.set(midId, name)
    const st = (s as { status?: unknown }).status
    if (Number.isFinite(midId) && typeof st === 'string') sheetStatusByMatch.set(midId, st)
  }

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
        myTeamId: Number((side === 'home' ? homeTeam?.id : awayTeam?.id) ?? 0),
        home: nameOf(homeTeam),
        away: nameOf(awayTeam),
        ownReady: side === 'home' ? r.homeOk : r.awayOk,
        // Locatie = terrein van de thuisclub (waar je moet zijn).
        location: (homeClub?.accommodatie || homeClub?.name || nameOf(homeTeam)).trim(),
        coachName: coach ? (coach.name || coach.email || 'Geclaimd') : null,
        coachMine: coach?.id != null && Number(coach.id) === myUserId,
        takeoverName: takeover ? (takeover.name || takeover.email || 'Iemand') : null,
        takeoverMine: takeover?.id != null && Number(takeover.id) === myUserId,
        refereeName: refByMatch.get(m.id) ?? null,
        sheetStatus: sheetStatusByMatch.get(m.id) ?? null,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }

  // "Mijn ploegen": de eigen voorkeur van de trainer/coach (team-ids). Enkel ploegen die nog
  // bestaan in de club tellen mee. We tonen ook de reeks (of categorie) zodat gelijknamige
  // ploegen — bv. meerdere "KBC St. Michiels" — uit elkaar te houden zijn.
  const allTeams = teams.docs.map((t) => {
    const code = String((t as { reeks?: unknown }).reeks ?? '')
    const cat = String((t as { category?: unknown }).category ?? '')
    return {
      id: Number(t.id),
      name: String((t as { name?: unknown }).name ?? '—'),
      sub: code ? reeksNaam(code as Parameters<typeof reeksNaam>[0]) : cat,
    }
  })
  const rawMine = (user as { myTeams?: unknown }).myTeams
  const myTeams = (Array.isArray(rawMine) ? rawMine.map(Number).filter((n) => Number.isFinite(n)) : []).filter((id) => teamIdSet.has(id))
  const mySet = new Set(myTeams)
  const focusing = mySet.size > 0 && !showAll
  // Bij een actieve focus tonen we enkel de wedstrijden van de eigen ploeg(en).
  const visibleRows = focusing ? rows.filter((r) => mySet.has(r.myTeamId)) : rows

  // Groepeer per ploeg(groep).
  const groups = new Map<string, { label: string; order: number; rows: Row[] }>()
  for (const r of visibleRows) {
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
    .filter((t) => !focusing || mySet.has(t.id))
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
      <MyTeamsPicker teams={allTeams} initial={myTeams} />

      {isBeheerder && (
        <p className="myteams-focusbar">
          <Link href="/beheer/club-team" className="myteams-link">👥 Clubteam beheren — leden een rol geven →</Link>
        </p>
      )}

      {mySet.size > 0 && (
        <p className="myteams-focusbar">
          {focusing ? (
            <>Gefocust op jouw ploeg(en). <Link href="/club?alle=1" className="myteams-link">Toon alle ploegen van de club →</Link></>
          ) : (
            <>Je ziet alle ploegen van de club. <Link href="/club" className="myteams-link">← Focus op mijn ploeg(en)</Link></>
          )}
        </p>
      )}

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

      {visibleRows.length === 0 ? (
        <p className="empty">{focusing ? 'Geen geplande wedstrijden voor je gekozen ploeg(en).' : 'Geen geplande wedstrijden voor je ploegen.'}</p>
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
                  {m.refereeName ? <> · 🟡 SR: {m.refereeName}</> : null}
                </span>
                <span className="club-match-coach">
                  <ClaimButton matchId={m.id} coachName={m.coachName} mine={m.coachMine} takeoverName={m.takeoverName} takeoverMine={m.takeoverMine} />
                </span>
              </div>
              <div className="club-match-actions">
                <Link href={`/opstelling/${m.id}`} className="btn btn-primary">Opstelling</Link>
                {(() => {
                  // Aantekenen kan zodra de scheidsrechter het blad opende (wedstrijdklaar/bezig).
                  // Een wedstrijd die al LOOPT is altijd open: de aantekentafel moet er terug in
                  // kunnen (na een refresh of vanaf een ander toestel) — thuis én uit.
                  const open = m.status === 'live' || sheetOpenForScoring(m.sheetStatus)
                  if (m.side === 'home') {
                    return open ? (
                      <Link href={`/scorekeeper/${m.id}`} className="btn btn-ghost">Aantekenen</Link>
                    ) : (
                      <span className="btn btn-ghost is-disabled" title="De scheidsrechter heeft het wedstrijdblad nog niet opengezet om aan te tekenen.">
                        ⏳ Wacht op scheidsrechter
                      </span>
                    )
                  }
                  return (
                    <>
                      {open && <Link href={`/scorekeeper/${m.id}`} className="btn btn-ghost">Aantekenen</Link>}
                      <Link href={`/match/${m.id}`} className="btn btn-ghost">Bekijk</Link>
                    </>
                  )
                })()}
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
