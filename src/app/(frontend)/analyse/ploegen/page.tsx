import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { buildTeamRadar } from '@/lib/team-radar'
import { AnalyseNav } from '../AnalyseNav'
import { TeamRadarView } from './TeamRadarView'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

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
  const reeks =
    typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam)
      ? reeksParam
      : COMPETITIE_REEKSEN[0].value

  const payload = await getPayloadClient()
  const teams = await buildTeamRadar(payload, reeks)

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="ploegen" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Ploegvergelijking</span></h1>
        </div>
        <p className="an-intro">
          Vergelijk twee ploegen onderling en met het reeks-gemiddelde op aanval (worpvolume), doelpunten, punten,
          conversie, worpafstand en verdediging (vangsten). Elke as toont het <em>percentiel binnen de reeks</em>.
        </p>

        <TeamRadarView reeks={reeks} options={[...COMPETITIE_REEKSEN]} teams={teams} />
      </div>
    </>
  )
}
