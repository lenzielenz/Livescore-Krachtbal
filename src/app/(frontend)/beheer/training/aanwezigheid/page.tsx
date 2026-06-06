import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse, hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { AanwezigheidPanel, type AwPlayer, type AwSession, type AwTeam } from './AanwezigheidPanel'
import { TrainingNav } from '../TrainingNav'

export const dynamic = 'force-dynamic'

// Aanwezigheidslijst per training: wie kwam (+ aantal), het weer en de duur.
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
  const clubId = userClubId(me)
  const canSeeAll = fed || !isClubBeheerder
  const teamWhere: Where = canSeeAll ? {} : { club: { equals: clubId } }
  const playerWhere: Where = canSeeAll ? {} : { 'team.club': { equals: clubId } }

  const [teamsRes, playersRes, sessiesRes] = await Promise.all([
    payload.find({ collection: 'teams', where: teamWhere, depth: 0, limit: 1000, sort: 'name' }),
    payload.find({ collection: 'players', where: playerWhere, depth: 2, limit: 2000, sort: 'name' }),
    payload.find({ collection: 'trainingen', depth: 1, limit: 500, sort: '-datum' }),
  ])

  const teams: AwTeam[] = teamsRes.docs.map((t) => ({ id: t.id, name: (t.name as string) ?? '—' }))
  const players: AwPlayer[] = playersRes.docs.map((p) => {
    const team = typeof p.team === 'object' && p.team ? p.team : null
    return { id: p.id, name: p.name ?? '—', teamId: team?.id ?? null, teamName: team?.name ?? '' }
  })

  // Club-beheerder ziet enkel z'n eigen trainingen (die met een ploeg van de eigen club).
  const ownTeamIds = new Set(teams.map((t) => t.id))
  const relName = (v: unknown): { id: number; name: string } | null => {
    if (v && typeof v === 'object') return { id: (v as { id: number }).id, name: ((v as { name?: string }).name ?? '—') }
    return null
  }
  const sessions: AwSession[] = sessiesRes.docs
    .map((s) => {
      const team = relName(s.team)
      const aanwezigen = Array.isArray(s.aanwezigen)
        ? s.aanwezigen.map(relName).filter((x): x is { id: number; name: string } => x != null)
        : []
      return {
        id: s.id,
        datum: s.datum as string,
        teamId: team?.id ?? null,
        team: team?.name ?? null,
        duurMinuten: (s.duurMinuten as number | null | undefined) ?? null,
        weer: (s.weer as string | null | undefined) ?? null,
        temperatuur: (s.temperatuur as number | null | undefined) ?? null,
        aanwezigen,
        screenshot: (s.screenshot as string | null | undefined) ?? null,
        notitie: (s.notitie as string | null | undefined) ?? null,
      }
    })
    .filter((s) => canSeeAll || s.teamId == null || ownTeamIds.has(s.teamId))

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <h1 className="page-title">Training <span className="brand">·</span> aanwezigheid</h1>
        <TrainingNav active="aanwezigheid" />
        <p className="wb-intro">
          Hou per training bij wie er was (en dus hoeveel), hoe lang jullie trainden en hoe het weer was.
        </p>
        <AanwezigheidPanel teams={teams} players={players} sessions={sessions} canWrite={canWrite} />
      </div>
    </>
  )
}
