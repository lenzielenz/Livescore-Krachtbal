import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse, hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { TRAINING_METRICS, type TrainingMeting } from '@/lib/training-metrics'
import { TrainingNav } from '../TrainingNav'
import { TrainingPanel, type TrainingPlayer } from '../TrainingPanel'

export const dynamic = 'force-dynamic'

// Trainingsdashboard: metingen invoeren + progressie-grafieken per speler.
// Toegang: admin/federatie (alle spelers) of club-beheerder (enkel eigen club).
export default async function TrainingProgressiePage() {
  const me = await getAuthUser()
  const fed = isFederationLevel(me)
  const isClubBeheerder = hasRole(me, 'club-beheerder')
  // Bekijken mag iedereen met analyse-toegang of een club-beheerder; invoeren enkel federatie/club.
  const canView = canAnalyse(me) || isClubBeheerder
  const canWrite = fed || isClubBeheerder

  if (!canView) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">
            Training <span className="brand">·</span> progressie
          </h1>
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
  // Training hoort bij je eigen club: heeft het account een club, dan zie je enkel die spelers.
  // Enkel een (federatie/admin-)account zónder club ziet alle spelers.
  const playerWhere: Where = myClubId != null ? { 'team.club': { equals: myClubId } } : {}

  const [playersRes, metingenRes, doelenRes] = await Promise.all([
    payload.find({ collection: 'players', where: playerWhere, depth: 2, limit: 2000, sort: 'name' }),
    payload.find({ collection: 'trainingmetingen', depth: 0, limit: 5000, sort: 'datum' }),
    payload.find({ collection: 'trainingdoelen', depth: 0, limit: 2000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const players: TrainingPlayer[] = playersRes.docs.map((p) => {
    const team = typeof p.team === 'object' && p.team ? p.team : null
    const club = team && typeof team.club === 'object' && team.club ? team.club : null
    const reeks = (team?.reeks as string | null | undefined) ?? ''
    return {
      id: p.id,
      name: p.name ?? '—',
      team: team?.name ?? '',
      club: club?.name ?? '',
      reeks,
      reeksNaam: reeks ? reeksNaam(reeks) : 'Overig',
    }
  })
  const playerIds = new Set(players.map((p) => p.id))

  const metingen: TrainingMeting[] = metingenRes.docs
    .map((m) => {
      const speler = typeof m.speler === 'object' && m.speler ? m.speler.id : (m.speler as number)
      const row = { speler, datum: m.datum } as TrainingMeting
      for (const metric of TRAINING_METRICS) {
        row[metric.key] = (m[metric.key as keyof typeof m] as number | null | undefined) ?? null
      }
      return row
    })
    .filter((m) => playerIds.has(m.speler))

  const doelen = doelenRes.docs
    .map((d) => ({
      id: (d as { id: number }).id,
      speler: typeof (d as { speler?: unknown }).speler === 'object' ? ((d as { speler: { id: number } }).speler.id) : ((d as { speler: number }).speler),
      metriek: String((d as { metriek?: unknown }).metriek ?? ''),
      doel: Number((d as { doel?: unknown }).doel ?? 0),
    }))
    .filter((d) => playerIds.has(d.speler))

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <h1 className="page-title">
          Training <span className="brand">·</span> progressie
        </h1>
        <TrainingNav active="progressie" />
        <p className="wb-intro">
          Meet sprintsnelheid over 18 m (vooruit/achteruit) en werpafstand per aanloop (4/9/18 m), en
          volg de progressie per speler op.
        </p>
        <TrainingPanel players={players} metingen={metingen} doelen={doelen} canWrite={canWrite} />
      </div>
    </>
  )
}
