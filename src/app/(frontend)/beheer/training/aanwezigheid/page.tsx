import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse, hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { AanwezigheidPanel, type AwClub, type AwPlayer, type AwSession } from './AanwezigheidPanel'
import { TrainingNav } from '../TrainingNav'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Aanwezigheidslijst per training. De club komt uit het account (je bent ingelogd), dus die hoeft
// niet gekozen te worden. Per reeks/leeftijdsgroep (U12, U14, dames, heren …) hou je apart bij wie
// kwam; "Algemeen" telt over het hele seizoen hoeveel % van de club kwam trainen.
export default async function AanwezigheidPage() {
  const me = await getAuthUser()
  const fed = isFederationLevel(me)
  const isClubBeheerder = hasRole(me, 'club-beheerder')
  const canView = canAnalyse(me) || isClubBeheerder
  const canWrite = fed || isClubBeheerder

  if (!canView) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">Training <span className="brand">·</span> aanwezigheid</h1>
          <p className="empty">
            Enkel voor admin/federatie of club-beheerders.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const rawClubId = userClubId(me)
  const myClubId: number | null = rawClubId != null && Number.isFinite(Number(rawClubId)) ? Number(rawClubId) : null
  // De club volgt uit het account. Enkel een (federatie/admin-)account zónder eigen club mag nog
  // kiezen; iedereen met een club zit er vast aan en ziet géén clubkeuze.
  const fixedClubId = myClubId
  const clubWhere: Where = fixedClubId != null ? { id: { equals: fixedClubId } } : {}
  const teamWhere: Where = fixedClubId != null ? { club: { equals: fixedClubId } } : {}
  const playerWhere: Where = fixedClubId != null ? { 'team.club': { equals: fixedClubId } } : {}

  const [clubsRes, teamsRes, playersRes, sessiesRes] = await Promise.all([
    payload.find({ collection: 'clubs', where: clubWhere, depth: 0, limit: 2000, sort: 'name' }),
    payload.find({ collection: 'teams', where: teamWhere, depth: 0, limit: 4000, sort: 'name' }),
    payload.find({ collection: 'players', where: playerWhere, depth: 2, limit: 5000, sort: 'name' }),
    payload.find({ collection: 'trainingen', depth: 1, limit: 1000, sort: '-datum' }),
  ])

  // Eerste ploeg per club (voor het toekennen van nieuwe spelers bij het snel aanvullen) en de
  // reeksen per club met een representatieve ploeg (zodat snel aanvullen in de juiste reeks belandt).
  const primaryTeam = new Map<number, number>()
  const reeksTeamsByClub = new Map<number, { reeks: string; reeksNaam: string; teamId: number }[]>()
  for (const t of teamsRes.docs) {
    const cid = relId((t as { club?: unknown }).club)
    if (cid == null) continue
    if (!primaryTeam.has(cid)) primaryTeam.set(cid, (t as { id: number }).id)
    const reeks = ((t as { reeks?: string }).reeks ?? '') as string
    if (!reeks) continue
    const list = reeksTeamsByClub.get(cid) ?? []
    if (!list.some((r) => r.reeks === reeks)) {
      list.push({ reeks, reeksNaam: reeksNaam(reeks), teamId: (t as { id: number }).id })
      reeksTeamsByClub.set(cid, list)
    }
  }

  const clubs: AwClub[] = clubsRes.docs.map((c) => ({
    id: (c as { id: number }).id,
    name: ((c as { name?: string }).name ?? '—') as string,
    primaryTeamId: primaryTeam.get((c as { id: number }).id) ?? null,
    reeksTeams: reeksTeamsByClub.get((c as { id: number }).id) ?? [],
    players: [] as AwPlayer[],
  }))
  const clubById = new Map(clubs.map((c) => [c.id, c]))

  for (const p of playersRes.docs) {
    const team = typeof p.team === 'object' && p.team ? p.team : null
    const cid = team && typeof team.club === 'object' && team.club ? team.club.id : relId(team?.club)
    if (cid == null) continue
    const reeks = (team?.reeks as string | null | undefined) ?? ''
    clubById.get(cid)?.players.push({
      id: p.id,
      name: p.name ?? '—',
      reeks,
      reeksNaam: reeks ? reeksNaam(reeks) : 'Overig',
    })
  }

  const relName = (v: unknown): { id: number; name: string } | null =>
    v && typeof v === 'object' ? { id: (v as { id: number }).id, name: ((v as { name?: string }).name ?? '—') } : null

  const sessions: AwSession[] = sessiesRes.docs
    .map((s) => {
      const club = relName(s.club)
      const aanwezigen = Array.isArray(s.aanwezigen)
        ? s.aanwezigen.map(relName).filter((x): x is { id: number; name: string } => x != null)
        : []
      return {
        id: s.id,
        datum: s.datum as string,
        clubId: club?.id ?? null,
        club: club?.name ?? null,
        reeks: (s.reeks as string | null | undefined) ?? '',
        duurMinuten: (s.duurMinuten as number | null | undefined) ?? null,
        weer: (s.weer as string | null | undefined) ?? null,
        temperatuur: (s.temperatuur as number | null | undefined) ?? null,
        aanwezigen,
        screenshot: (s.screenshot as string | null | undefined) ?? null,
        notitie: (s.notitie as string | null | undefined) ?? null,
      }
    })
    .filter((s) => fixedClubId == null || s.clubId == null || s.clubId === fixedClubId)

  const currentSeason = seasonFromDate(new Date())

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <h1 className="page-title">Training <span className="brand">·</span> aanwezigheid</h1>
        <TrainingNav active="aanwezigheid" />
        <p className="wb-intro">
          Kies je reeks (U12, U14, dames, heren …) en hou per training bij wie er was. Onder
          <strong> Algemeen</strong> zie je over het hele seizoen hoeveel % van de club kwam trainen.
        </p>
        <AanwezigheidPanel
          clubs={clubs}
          fixedClubId={fixedClubId}
          sessions={sessions}
          canWrite={canWrite}
          currentSeason={currentSeason}
        />
      </div>
    </>
  )
}
