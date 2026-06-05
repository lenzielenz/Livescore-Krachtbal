import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildScoreboards, clubColors, clubLogoFit, clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { computeStandings, forfaitFromUitslag, type StandingsMatch } from '@/lib/standings'
import { ReeksPicker } from './ReeksPicker'
import './rangschikking.css'

export const dynamic = 'force-dynamic'

// Enkel echte competitiereeksen tonen (geen beker/recreatief/andere). Label zonder
// code-afkorting (bv. "1ste Nationale Heren" i.p.v. "1NAH — …").
const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

type TeamInfo = { name: string; logoUrl: string | null; logoFit: ReturnType<typeof clubLogoFit>; colors: ReturnType<typeof clubColors>; clubId: number | null }

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

const clubIdOf = (team: unknown): number | null => rel((team as { club?: unknown })?.club)

export default async function RangschikkingPage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const { reeks: reeksParam } = await searchParams
  const payload = await getPayloadClient()

  // Ingelogd? Onthoud de eigen club (voor de standaardreeks + de highlight).
  const myClub = userClubId(await getAuthUser())
  const myClubNum = myClub == null ? null : Number(myClub)

  // Standaardreeks: gevraagde reeks → anders de reeks van je eigen club → anders de
  // reeks van de recentste afgelopen wedstrijd → anders de hoogste reeks.
  let reeks = typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam) ? reeksParam : null
  if (!reeks && myClubNum != null) {
    const myTeam = await payload
      .find({ collection: 'teams', where: { club: { equals: myClubNum } }, depth: 0, limit: 50 })
      .catch(() => ({ docs: [] as { reeks?: unknown }[] }))
    const r = myTeam.docs.map((t) => t.reeks).find((x) => COMPETITIE_REEKSEN.some((o) => o.value === x))
    if (typeof r === 'string') reeks = r
  }
  if (!reeks) {
    const latest = await payload
      .find({ collection: 'matches', where: { status: { equals: 'finished' } }, sort: '-date', depth: 0, limit: 1 })
      .catch(() => ({ docs: [] as { reeks?: unknown }[] }))
    const r = latest.docs[0]?.reeks
    reeks = typeof r === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === r) ? r : COMPETITIE_REEKSEN[0].value
  }

  // Ploegen van de reeks: namen/logo's + zorgt dat ploegen zonder wedstrijden ook in de tabel staan.
  const teamsRes = await payload
    .find({ collection: 'teams', where: { reeks: { equals: reeks } }, depth: 2, limit: 200 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamInfo = new Map<number, TeamInfo>()
  for (const t of teamsRes.docs) {
    teamInfo.set(t.id, { name: t.name, logoUrl: clubLogoUrl(t), logoFit: clubLogoFit(t), colors: clubColors(t), clubId: clubIdOf(t) })
  }

  // Afgelopen wedstrijden van de reeks → stand (gebatcht) + forfait van het wedstrijdblad.
  const matchRes = await payload
    .find({ collection: 'matches', where: { and: [{ reeks: { equals: reeks } }, { status: { equals: 'finished' } }, { analyseOnly: { not_equals: true } }] }, depth: 0, limit: 1000 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const finished = matchRes.docs
  const cards = await buildScoreboards(payload, finished as Parameters<typeof buildScoreboards>[1])

  const matchIds = finished.map((m) => (m as { id: number }).id)
  const sheetsRes = matchIds.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: matchIds } }, depth: 0, pagination: false }).catch(() => ({ docs: [] }))
    : { docs: [] }
  const ffByMatch = new Map<number, string>()
  for (const s of sheetsRes.docs) {
    const mid = rel((s as { match?: unknown }).match)
    const u = (s as { forfait?: { uitslag?: string } }).forfait?.uitslag
    if (mid != null && u) ffByMatch.set(mid, u)
  }

  const standingsMatches: StandingsMatch[] = []
  for (const mtch of finished) {
    const id = (mtch as { id: number }).id
    const c = cards.get(id)
    if (!c) continue
    const homeId = rel((mtch as { homeTeam?: unknown }).homeTeam)
    const awayId = rel((mtch as { awayTeam?: unknown }).awayTeam)
    if (homeId == null || awayId == null) continue
    if (!teamInfo.has(homeId)) teamInfo.set(homeId, { name: c.teams.home.name, logoUrl: c.teams.home.logoUrl, logoFit: c.teams.home.logoFit, colors: c.teams.home.colors, clubId: c.teams.home.clubId })
    if (!teamInfo.has(awayId)) teamInfo.set(awayId, { name: c.teams.away.name, logoUrl: c.teams.away.logoUrl, logoFit: c.teams.away.logoFit, colors: c.teams.away.colors, clubId: c.teams.away.clubId })
    const date = String((mtch as { date?: unknown }).date ?? '')
    standingsMatches.push({ homeId, awayId, homeGoals: c.score.home, awayGoals: c.score.away, forfait: forfaitFromUitslag(ffByMatch.get(id)), date })
  }

  const teamIds = [...teamInfo.keys()]
  const table = computeStandings(standingsMatches, teamIds)

  // Positie t.o.v. een week geleden: rangschikking uit de wedstrijden van vóór 7 dagen.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const prevMatches = standingsMatches.filter((m) => m.date && new Date(m.date).getTime() < weekAgo)
  const prevTable = computeStandings(prevMatches, teamIds)
  const prevRank = new Map(prevTable.map((r, i) => [r.teamId, i]))

  // Snel bladeren door de reeksen-rangschikkingen (prev/next).
  const idx = COMPETITIE_REEKSEN.findIndex((o) => o.value === reeks)
  const prevReeks = idx > 0 ? COMPETITIE_REEKSEN[idx - 1].value : null
  const nextReeks = idx >= 0 && idx < COMPETITIE_REEKSEN.length - 1 ? COMPETITIE_REEKSEN[idx + 1].value : null

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Rangschikking</span></h1>
        <div className="rang-nav">
          {prevReeks ? (
            <Link href={`/rangschikking?reeks=${prevReeks}`} className="rang-arrow" aria-label="Vorige reeks">‹</Link>
          ) : (
            <span className="rang-arrow disabled" aria-hidden>‹</span>
          )}
          <ReeksPicker reeks={reeks} options={[...COMPETITIE_REEKSEN]} />
          {nextReeks ? (
            <Link href={`/rangschikking?reeks=${nextReeks}`} className="rang-arrow" aria-label="Volgende reeks">›</Link>
          ) : (
            <span className="rang-arrow disabled" aria-hidden>›</span>
          )}
        </div>

        {table.length === 0 ? (
          <p className="empty">Nog geen ploegen of wedstrijden in deze reeks.</p>
        ) : (
          <div className="rang-scroll">
            <table className="rang-table">
              <thead>
                <tr>
                  <th className="rang-rank">#</th>
                  <th className="rang-teamh">Ploeg</th>
                  <th title="Gespeeld">Sp</th>
                  <th title="Winst">W</th>
                  <th title="Gelijk">G</th>
                  <th title="Verlies">V</th>
                  <th title="Forfait">FF</th>
                  <th className="rang-dv" title="Doelpunten voor–tegen">DV–DT</th>
                  <th title="Punten">Ptn</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => {
                  const info = teamInfo.get(r.teamId)
                  const mine = myClubNum != null && info?.clubId === myClubNum
                  // Positie t.o.v. vorige week: positief = gestegen.
                  const prev = prevRank.get(r.teamId)
                  const delta = prev == null ? 0 : prev - i
                  const moveCls = prevMatches.length === 0 ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
                  const moveArrow = moveCls === 'up' ? '▲' : moveCls === 'down' ? '▼' : '–'
                  return (
                    <tr key={r.teamId} className={mine ? 'rang-mine' : undefined}>
                      <td className="rang-rank">
                        <span className="rang-pos">{i + 1}</span>
                        <span className={`rang-move ${moveCls}`} title="T.o.v. vorige week">
                          {moveArrow}{delta !== 0 ? Math.abs(delta) : ''}
                        </span>
                      </td>
                      <td className="rang-team">
                        <span className="rang-logo">
                          <TeamLogo name={info?.name ?? '?'} logoUrl={info?.logoUrl ?? null} logoFit={info?.logoFit} side="home" size="sm" ringColor={info?.colors?.primary} />
                        </span>
                        <span className="rang-name">{info?.name ?? '—'}{mine && <span className="rang-mybadge" title="Jouw club">★</span>}</span>
                      </td>
                      <td>{r.played}</td>
                      <td>{r.won}</td>
                      <td>{r.drawn}</td>
                      <td>{r.lost}</td>
                      <td>{r.forfaits}</td>
                      <td className="rang-dv rang-goals">{r.goalsFor}–{r.goalsAgainst}</td>
                      <td className="rang-pts">{r.points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
