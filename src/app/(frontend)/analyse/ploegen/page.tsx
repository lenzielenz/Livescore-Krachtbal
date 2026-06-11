import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getSelectedSeason, reeksenMetData } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { resolveCompetitieReeks } from '@/lib/reeksen'
import { buildTeamRadar } from '@/lib/team-radar'
import { AnalyseNav } from '../AnalyseNav'
import { TeamRadarView } from './TeamRadarView'
import '../analyse.css'

export const dynamic = 'force-dynamic'

// Ploegvergelijking (admin/analyse-only): twee ploegen onderling en met het reeks-gemiddelde
// op een radar van aanvals- en verdedigingscijfers.
export default async function PloegenAnalysePage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Ploegvergelijking</span></h1>
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
  const { teams, results } = await buildTeamRadar(payload, reeks, await getSelectedSeason(), analyseOwnWhere(me))

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="ploegen" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Ploegvergelijking</span></h1>
        </div>

        <TeamRadarView reeks={reeks} options={reeksOptions} teams={teams} results={results} />
      </div>
    </>
  )
}
