import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getSelectedSeason, reeksenMetData } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPlayerDanger } from '@/lib/player-danger'
import { resolveCompetitieReeks } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { BandChart } from '@/components/analytics/BandChart'
import { AnalyseNav } from '../AnalyseNav'
import { GevaarMap } from './GevaarMap'
import { GevaarPicker } from './GevaarPicker'
import '../analyse.css'

export const dynamic = 'force-dynamic'

// Gevaarzone-kaart per speler: van waar op het veld scoort hij het best?
export default async function GevaarPage({ searchParams }: { searchParams: Promise<{ reeks?: string; speler?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Gevaarzone</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam, speler: spelerParam } = await searchParams

  const payload = await getPayloadClient()
  const reeksOptions = await reeksenMetData(payload, analyseOwnWhere(me))
  const reeks = resolveCompetitieReeks(reeksParam, reeksOptions)
  const seizoen = await getSelectedSeason()
  const seasonPlayers = await buildSeasonStats(payload, reeks, seizoen, analyseOwnWhere(me))
  const playerOptions = seasonPlayers.map((p) => ({ value: String(p.playerId), label: `#${p.shirtNumber} ${p.name} · ${p.teamName}` }))

  const playerId = spelerParam && playerOptions.some((o) => o.value === spelerParam) ? Number(spelerParam) : null
  const danger = playerId != null ? await buildPlayerDanger(payload, playerId, reeks, seizoen, analyseOwnWhere(me)) : null

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="spelers" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Gevaarzone</span></h1>
          <GevaarPicker
            reeks={reeks}
            reeksOptions={reeksOptions}
            playerOptions={playerOptions}
            player={playerId != null ? String(playerId) : ''}
          />
        </div>

        {danger == null ? (
          <p className="empty">Kies een speler om zijn gevaarzone te bekijken.</p>
        ) : danger.attempts === 0 ? (
          <p className="empty">Nog geen doelpogingen van {danger.name} in deze reeks.</p>
        ) : (
          <div className="gev-grid">
            <GevaarMap shots={danger.shots} />
            <div className="gev-side">
              <div className="rep-cards">
                <div className="rep-card"><span className="rep-num">{danger.attempts}</span><span className="rep-lbl">Pogingen</span></div>
                <div className="rep-card"><span className="rep-num">{danger.goals}</span><span className="rep-lbl">Doelpunten</span></div>
                <div className="rep-card"><span className="rep-num">{Math.round(danger.conversion * 100)}%</span><span className="rep-lbl">Conversie</span></div>
                <div className="rep-card"><span className="rep-num">{danger.avgDistance}m</span><span className="rep-lbl">Gem. afstand</span></div>
              </div>
              <BandChart title="Diepte" bands={danger.depthBands} />
              <BandChart title="Breedte" bands={danger.zoneBands} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
