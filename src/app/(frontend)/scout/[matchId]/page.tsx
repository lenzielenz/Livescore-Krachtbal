import Link from 'next/link'

import { MatchDayNav } from '@/components/MatchDayNav'
import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse, userClubId } from '@/lib/access'
import { getSelectedSeason } from '@/lib/analyse-season'
import { buildAttackPatterns } from '@/lib/attack-patterns'
import { getAuthUser } from '@/lib/auth-user'
import { buildGamePlan } from '@/lib/gameplan'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { buildTeamReport } from '@/lib/team-report'
import { AanvalsPatronen } from '../../analyse/ploeg/AanvalsPatronen'
import { MatchPlan } from '../../analyse/ploeg/MatchPlan'
import '../../analyse/analyse.css'

export const dynamic = 'force-dynamic'

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Pre-match briefing: scout je tegenstander vóór de wedstrijd, binnen de wedstrijddag-flow.
// Bouwt het matchplan + de aanvalspatronen van de tegenpartij uit hun afgelopen competitie-
// wedstrijden (niet de privé-analysedatabase). Eerste stap in de stappenbalk.
export default async function ScoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>
  searchParams: Promise<{ side?: string }>
}) {
  const { matchId } = await params
  const { side: sideParam } = await searchParams
  const me = await getAuthUser()

  const shell = (body: React.ReactNode) => (
    <>
      <SiteHeader active="clubs" />
      <div className="site">{body}</div>
    </>
  )

  // Analyse is privé voor de eigen club: enkel accounts met analyse-toegang scouten hier.
  if (!canAnalyse(me)) {
    return shell(
      <p className="empty">
        De scouting-analyse is privé voor je eigen club. Vraag een beheerder om analyse-toegang.{' '}
        {!me && <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>}
      </p>,
    )
  }

  const payload = await getPayloadClient()
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match || (match as { analyseOnly?: boolean }).analyseOnly) {
    return shell(
      <>
        <p className="empty">Wedstrijd niet gevonden.</p>
        <Link href="/">← Terug</Link>
      </>,
    )
  }

  const homeId = rel((match as { homeTeam?: unknown }).homeTeam)
  const awayId = rel((match as { awayTeam?: unknown }).awayTeam)
  const reeks = (match as { reeks?: string }).reeks ?? null

  if (homeId == null || awayId == null) {
    return shell(<p className="empty">Deze wedstrijd heeft nog geen twee ploegen.</p>)
  }

  const [homeTeam, awayTeam] = await Promise.all([
    payload.findByID({ collection: 'teams', id: homeId, depth: 0 }).catch(() => null),
    payload.findByID({ collection: 'teams', id: awayId, depth: 0 }).catch(() => null),
  ])
  const homeName = (homeTeam as { name?: string } | null)?.name ?? 'Thuis'
  const awayName = (awayTeam as { name?: string } | null)?.name ?? 'Uit'
  const homeClub = rel((homeTeam as { club?: unknown } | null)?.club)
  const awayClub = rel((awayTeam as { club?: unknown } | null)?.club)

  // Standaard scouten we de TEGENSTANDER van de eigen club; een ?side overschrijft dat.
  const myClubRaw = userClubId(me)
  const myClub = myClubRaw != null && Number.isFinite(Number(myClubRaw)) ? Number(myClubRaw) : null
  let side: 'home' | 'away'
  if (sideParam === 'home' || sideParam === 'away') side = sideParam
  else if (myClub != null && homeClub === myClub) side = 'away'
  else if (myClub != null && awayClub === myClub) side = 'home'
  else side = 'away'

  const opponentId = side === 'home' ? homeId : awayId
  const opponentName = side === 'home' ? homeName : awayName
  const ourName = side === 'home' ? awayName : homeName

  const seizoen = await getSelectedSeason()
  // Enkel echte competitiewedstrijden (geen privé-analysematches).
  const compFilter = { analyseOnly: { not_equals: true } } as const
  const [report, patterns] = await Promise.all([
    buildTeamReport(payload, opponentId, seizoen, compFilter),
    buildAttackPatterns(payload, opponentId, seizoen, compFilter),
  ])

  const SideToggle = (
    <div className="scout-toggle" role="tablist" aria-label="Welke ploeg scouten">
      <Link href={`/scout/${matchId}?side=home`} role="tab" aria-selected={side === 'home'} className={`scout-tab ${side === 'home' ? 'on' : ''}`}>
        {homeName}
      </Link>
      <Link href={`/scout/${matchId}?side=away`} role="tab" aria-selected={side === 'away'} className={`scout-tab ${side === 'away' ? 'on' : ''}`}>
        {awayName}
      </Link>
    </div>
  )

  return shell(
    <>
      <h1 className="page-title">
        Scout <span className="brand">·</span> {homeName} – {awayName}
      </h1>
      <MatchDayNav matchId={matchId} current="scout" canScout />
      <p className="wb-intro">
        Ken je tegenstander vóór de aftrap. Hieronder het <strong>matchplan</strong> en de{' '}
        <strong>aanvalspatronen</strong> van {opponentName}, opgebouwd uit hun afgelopen wedstrijden
        {reeks ? ` in ${reeksNaam(reeks)}` : ''}. Jij speelt met {ourName}.
      </p>

      {SideToggle}

      {report == null || report.matchesAnalyzed === 0 ? (
        <p className="empty">Nog geen wedstrijddata van {opponentName} om te scouten.</p>
      ) : (
        <>
          <MatchPlan plan={buildGamePlan(report, patterns)} />
          <AanvalsPatronen data={patterns} teamName={opponentName} />
        </>
      )}
    </>,
  )
}
