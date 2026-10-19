import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId, userTeamId, userTeamIds } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { clinchStatus, openDuels, titelBoodschap, titelKansen } from '@/lib/championship'
import { degradatieBoodschap } from '@/lib/degradatie'
import { formatDateBE } from '@/lib/datetime'
import { buildScoreboards, clubColors, clubLogoFit, clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksenMetData } from '@/lib/analyse-season'
import { isAdultReeks, reeksNaam, type Reeks } from '@/lib/reeksen'
import { buildSuperstars } from '@/lib/superstars'
import { computeStandings, resolveForfait, type StandingsMatch } from '@/lib/standings'
import { RangTable, type RangRow } from './RangTable'
import { ReeksPicker } from './ReeksPicker'
import './rangschikking.css'

export const dynamic = 'force-dynamic'

type TeamInfo = { name: string; logoUrl: string | null; logoFit: ReturnType<typeof clubLogoFit>; colors: ReturnType<typeof clubColors>; clubId: number | null }

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

const clubIdOf = (team: unknown): number | null => rel((team as { club?: unknown })?.club)

export default async function RangschikkingPage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const { reeks: reeksParam } = await searchParams
  const payload = await getPayloadClient()

  // Enkel reeksen waarin effectief een ploeg speelt. De federatie-indeling telt 27 reeksen; wie
  // door een keuzelijst vol lege reeksen moet, vindt zijn eigen reeks niet. Zonder ploegen valt
  // de lijst terug op de volledige indeling, zodat de keuze nooit leeg staat.
  const reeksen = await reeksenMetData(payload, competitionWhere())
  const bekend = (x: unknown): x is string => typeof x === 'string' && reeksen.some((o) => o.value === x)

  // Ingelogd? Onthoud de eigen club + ploeg (voor de standaardreeks + de highlight).
  const me = await getAuthUser()
  const myClub = userClubId(me)
  const myClubNum = myClub == null ? null : Number(myClub)
  const myTeamId = userTeamId(me)
  const myTeamIdsCoach = userTeamIds(me)

  // Standaardreeks: gevraagde reeks → anders de reeks van je eigen ploeg ("Mijn ploeg"/"Mijn
  // profiel") → anders (coach) een van je gekozen ploegen → anders eender welke ploeg van je
  // club → anders de reeks van de recentste afgelopen wedstrijd → anders de hoogste reeks.
  let reeks: string | null = bekend(reeksParam) ? reeksParam : null
  if (!reeks && myTeamId != null) {
    const myTeamDoc = await payload.findByID({ collection: 'teams', id: Number(myTeamId), depth: 0 }).catch(() => null)
    if (myTeamDoc && bekend(myTeamDoc.reeks)) reeks = myTeamDoc.reeks as string
  }
  if (!reeks && myTeamIdsCoach.length > 0) {
    const coachTeams = await payload
      .find({ collection: 'teams', where: { id: { in: myTeamIdsCoach } }, depth: 0, limit: myTeamIdsCoach.length })
      .catch(() => ({ docs: [] as { reeks?: unknown }[] }))
    const r = coachTeams.docs.map((t) => t.reeks).find(bekend)
    if (typeof r === 'string') reeks = r
  }
  if (!reeks && myClubNum != null) {
    const myTeam = await payload
      .find({ collection: 'teams', where: { and: [{ club: { equals: myClubNum } }, competitionWhere()] }, depth: 0, limit: 50 })
      .catch(() => ({ docs: [] as { reeks?: unknown }[] }))
    const r = myTeam.docs.map((t) => t.reeks).find(bekend)
    if (typeof r === 'string') reeks = r
  }
  if (!reeks) {
    const latest = await payload
      .find({ collection: 'matches', where: { and: [{ status: { equals: 'finished' } }, competitionWhere()] }, sort: '-date', depth: 0, limit: 1 })
      .catch(() => ({ docs: [] as { reeks?: unknown }[] }))
    const r = latest.docs[0]?.reeks
    reeks = bekend(r) ? r : reeksen[0].value
  }

  // Ploegen van de reeks: namen/logo's + zorgt dat ploegen zonder wedstrijden ook in de tabel staan.
  const teamsRes = await payload
    .find({ collection: 'teams', where: { and: [{ reeks: { equals: reeks } }, competitionWhere()] }, depth: 2, limit: 200 })
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
    standingsMatches.push({ homeId, awayId, homeGoals: c.score.home, awayGoals: c.score.away, forfait: resolveForfait(ffByMatch.get(id), c.score.home, c.score.away), date })
  }

  const teamIds = [...teamInfo.keys()]
  const table = computeStandings(standingsMatches, teamIds)

  // Titelstrijd: hoeveel wedstrijden heeft elke ploeg nog te spelen? Daarmee weet je of de leider
  // al wiskundig kampioen is, of hoeveel zeges ze nog nodig heeft (src/lib/championship.ts).
  const openRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ reeks: { equals: reeks } }, { status: { not_equals: 'finished' } }, { analyseOnly: { not_equals: true } }] },
      depth: 0,
      limit: 1000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const remaining = new Map<number, number>()
  const fixtures: { homeId: number; awayId: number; date: string | null }[] = []
  for (const m of openRes.docs) {
    const homeId = rel((m as Record<string, unknown>).homeTeam)
    const awayId = rel((m as Record<string, unknown>).awayTeam)
    for (const id of [homeId, awayId]) {
      if (id != null) remaining.set(id, (remaining.get(id) ?? 0) + 1)
    }
    const date = (m as Record<string, unknown>).date
    if (homeId != null && awayId != null) fixtures.push({ homeId, awayId, date: typeof date === 'string' ? date : null })
  }
  const leaderId = table[0]?.teamId ?? null
  const titelCtx = { fixtures, results: standingsMatches }
  // Enkel om de leider in goud te zetten zodra die wiskundig kampioen is.
  const titel = leaderId != null ? clinchStatus(table, remaining, leaderId, titelCtx) : null

  // De titeltekst gaat over je eigen ploeg, en staat er enkel als die in deze reeks speelt: je
  // eigen ploeg → anders (coach) een van je gekozen ploegen → anders een ploeg van je club.
  const inTabel = (id: unknown) => {
    const n = Number(id)
    return id != null && table.some((r) => r.teamId === n) ? n : null
  }
  const eigenId =
    inTabel(myTeamId) ??
    myTeamIdsCoach.map(inTabel).find((id) => id != null) ??
    (myClubNum != null ? (table.find((r) => teamInfo.get(r.teamId)?.clubId === myClubNum)?.teamId ?? null) : null)
  const eigen = eigenId != null ? clinchStatus(table, remaining, eigenId, titelCtx) : null
  // Titelkans: de rest van de kalender duizenden keren nagespeeld met de vorm van tot nu, ook de
  // duels van de rivalen onderling (zie titelKansen). Pas zinvol na een paar speeldagen.
  const naam = (id: number) => teamInfo.get(id)?.name ?? '—'
  const eigenRij = eigenId != null ? table.find((r) => r.teamId === eigenId) : undefined
  const kansen =
    eigenId != null && eigen && !eigen.clinched && (eigenRij?.played ?? 0) >= 3 ? titelKansen(table, titelCtx) : null
  const kansInfo = (() => {
    if (!kansen || eigenId == null || !eigen) return null
    const anderen = table.filter((r) => r.teamId !== eigenId).sort((x, y) => (kansen.get(y.teamId) ?? 0) - (kansen.get(x.teamId) ?? 0))
    const fav = anderen[0]
    const naaste = eigen.leading ? table.find((r) => r.teamId !== eigenId) : undefined
    // Titelrivalen: wie minstens 3% kans maakt (of in de top vier staat), zonder de eigen ploeg.
    const rivalen = new Set(table.filter((r, i) => r.teamId !== eigenId && ((kansen.get(r.teamId) ?? 0) >= 0.03 || i < 4)).map((r) => r.teamId))
    const duels = openDuels(titelCtx, eigenId, rivalen)
      .slice(0, 4)
      .map((d) => (d.date ? `${naam(d.tegenstanderId)} (${formatDateBE(d.date, { weekday: 'short', day: 'numeric', month: 'long' })})` : naam(d.tegenstanderId)))
    return {
      eigen: kansen.get(eigenId) ?? 0,
      favoriet: fav ? { naam: naam(fav.teamId), kans: kansen.get(fav.teamId) ?? 0 } : null,
      naaste: naaste ? { naam: naam(naaste.teamId), punten: naaste.points } : null,
      duels,
    }
  })()
  const titelMsg = titelBoodschap({
    kansen: kansInfo,
    status: eigen,
    ploegNaam: eigenId != null ? (teamInfo.get(eigenId)?.name ?? null) : null,
    reeksLabel: reeksNaam(reeks),
    teamsInTable: table.length,
    achterstand: eigen ? (table[0]?.points ?? 0) - eigen.points : 0,
  })

  // Degradatie-/gevarenzone: enkel bij volwassen reeksen (jeugd kan niet stijgen/dalen). Bij
  // krachtbal zakt enkel de allerlaatste van de reeks — de zone is dus altijd één ploeg groot.
  const RELEGATION = 1
  const adult = isAdultReeks(reeks as Reeks)
  const dangerFrom = adult && table.length >= 6 ? table.length - RELEGATION : -1
  // Staat je eigen ploeg in de gevarenzone, dan krijgt ze — net als bij de titel — een eigen regel.
  const gevaarMsg =
    dangerFrom >= 0 && eigenId != null
      ? degradatieBoodschap({ table, remaining, teamId: eigenId, naam: (id) => teamInfo.get(id)?.name ?? '—' })
      : null

  // Positie t.o.v. een week geleden: rangschikking uit de wedstrijden van vóór 7 dagen.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const prevMatches = standingsMatches.filter((m) => m.date && new Date(m.date).getTime() < weekAgo)
  const prevTable = computeStandings(prevMatches, teamIds)
  const prevRank = new Map(prevTable.map((r, i) => [r.teamId, i]))

  // Rijen voor de (client) tabel: serialiseerbaar, met positieverloop t.o.v. vorige week.
  const rows: RangRow[] = table.map((r, i) => {
    const info = teamInfo.get(r.teamId)
    const mine = myClubNum != null && info?.clubId === myClubNum
    const prev = prevRank.get(r.teamId)
    const delta = prev == null ? 0 : prev - i
    const moveCls: RangRow['moveCls'] = prevMatches.length === 0 ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
    return {
      teamId: r.teamId,
      rank: i + 1,
      name: info?.name ?? '—',
      logoUrl: info?.logoUrl ?? null,
      logoFit: info?.logoFit ?? null,
      ringColor: info?.colors?.primary ?? null,
      mine,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      forfaits: r.forfaits,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      points: r.points,
      moveCls,
      delta,
      danger: dangerFrom >= 0 && i >= dangerFrom,
      champion: i === 0 && Boolean(titel?.clinched),
    }
  })

  // Topscorers van dezelfde reeks: je kijkt hier tóch al naar deze reeks, dus dat hoort hier —
  // geen extra pagina of klik voor. Telt zowel worp-events als snelscore-doelpunten mee.
  const topscorers = (await buildSuperstars(payload, reeks).catch(() => [])).slice(0, 5)

  // Snel bladeren door de reeksen-rangschikkingen (prev/next).
  const idx = reeksen.findIndex((o) => o.value === reeks)
  const prevReeks = idx > 0 ? reeksen[idx - 1].value : null
  const nextReeks = idx >= 0 && idx < reeksen.length - 1 ? reeksen[idx + 1].value : null

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site">
        <h1 className="page-title rang-title"><span className="brand">Rangschikking</span></h1>
        <div className="rang-nav">
          {prevReeks ? (
            <Link href={`/rangschikking?reeks=${prevReeks}`} className="rang-arrow" aria-label="Vorige reeks">‹</Link>
          ) : (
            <span className="rang-arrow disabled" aria-hidden>‹</span>
          )}
          <ReeksPicker reeks={reeks} options={reeksen} />
          {nextReeks ? (
            <Link href={`/rangschikking?reeks=${nextReeks}`} className="rang-arrow" aria-label="Volgende reeks">›</Link>
          ) : (
            <span className="rang-arrow disabled" aria-hidden>›</span>
          )}
        </div>

        {titelMsg && (
          <p className={`rang-titel${titelMsg.clinched ? ' clinched' : ''}`}>
            <span aria-hidden>{titelMsg.clinched ? '🏆' : '🎯'}</span> {titelMsg.text}
          </p>
        )}

        {gevaarMsg && (
          <p className={`rang-titel rang-gevaar${gevaarMsg.zeker ? ' zeker' : ''}`}>
            <span aria-hidden>{gevaarMsg.zeker ? '⬇️' : '⚠️'}</span> {gevaarMsg.text}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="empty">Nog geen ploegen of wedstrijden in deze reeks.</p>
        ) : (
          <RangTable rows={rows} showMove={adult} />
        )}

        {topscorers.length > 0 && (
          <section className="rang-top">
            <h2 className="rang-top-title">Topscorers</h2>
            <ol className="rang-top-list">
              {topscorers.map((p, i) => (
                <li key={p.playerId} className="rang-top-row">
                  <span className="rang-top-rank">{i + 1}</span>
                  <Link href={`/spelers/${p.playerId}`} className="rang-top-naam">
                    {p.shirtNumber != null && <span className="rang-top-num">{p.shirtNumber}</span>}
                    {p.name}
                    <span className="rang-top-team">{p.teamName}</span>
                  </Link>
                  <span className="rang-top-cijfers">
                    <b>{p.points}</b> ptn
                    <span className="rang-top-sub">{p.goals} {p.goals === 1 ? 'doelpunt' : 'doelpunten'}{p.rug > 0 ? ` · ${p.rug} rugworp${p.rug === 1 ? '' : 'en'}` : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  )
}
