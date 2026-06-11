import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getSelectedSeason, reeksenMetData } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { buildRadarStats } from '@/lib/radar-stats'
import { resolveCompetitieReeks } from '@/lib/reeksen'
import { AnalyseNav } from '../AnalyseNav'
import { SpelerRadar } from './SpelerRadar'
import '../analyse.css'

export const dynamic = 'force-dynamic'

// Spelersradar (admin/analyse-only): vergelijk een speler met het reeks-gemiddelde
// en met een tweede speler op zes genormaliseerde assen.
export default async function SpelerAnalysePage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Spelersradar</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam } = await searchParams

  const payload = await getPayloadClient()
  const reeksOptions = await reeksenMetData(payload, analyseOwnWhere(me))
  const reeks = resolveCompetitieReeks(reeksParam, reeksOptions)
  const players = await buildRadarStats(payload, reeks, await getSelectedSeason(), analyseOwnWhere(me))

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="spelers" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Spelersradar</span></h1>
        </div>

        <SpelerRadar reeks={reeks} options={reeksOptions} players={players} />
      </div>
    </>
  )
}
