import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getSelectedSeason } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { Sparkline } from '@/components/analytics/Sparkline'
import { AnalyseNav } from '../AnalyseNav'
import { SeizoenPicker } from './SeizoenPicker'
import '../../rangschikking/rangschikking.css'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

export default async function SeizoenAnalysePage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Seizoensanalyse</span></h1>
          <p className="empty">Je hebt geen toegang tot de analyse.{' '}<Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam } = await searchParams
  const reeks = typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam) ? reeksParam : COMPETITIE_REEKSEN[0].value

  const payload = await getPayloadClient()
  const players = await buildSeasonStats(payload, reeks, await getSelectedSeason(), analyseOwnWhere(me))

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="ploegen" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Seizoensanalyse</span></h1>
          <SeizoenPicker reeks={reeks} options={[...COMPETITIE_REEKSEN]} />
        </div>

        {players.length === 0 ? (
          <p className="empty">Nog geen worpdata in deze reeks.</p>
        ) : (
          <>
          <div className="an-podium">
            {players.slice(0, 3).map((p, i) => (
              <div key={p.playerId} className={`an-pod r${i + 1}`}>
                <span className="an-pod-medal" aria-hidden>{['🥇', '🥈', '🥉'][i]}</span>
                <span className="an-pod-name">#{p.shirtNumber} {p.name}</span>
                <span className="an-pod-team">{p.teamName}</span>
                <div className="an-pod-stats">
                  <span><b>{p.points}</b>punten</span>
                  <span><b>{p.goals}</b>doelp.</span>
                  <span><b>{Math.round(p.conversion * 100)}%</b>conv.</span>
                </div>
              </div>
            ))}
          </div>
          <div className="rang-scroll an-season-scroll">
            <table className="rang-table an-season-table">
              <thead>
                <tr>
                  <th className="rang-rank">#</th>
                  <th className="rang-teamh">Speler</th>
                  <th title="Gespeelde wedstrijden">M</th>
                  <th className="an-col-sec" title="Worpen">W</th>
                  <th title="Doelpunten">D</th>
                  <th title="Punten">Ptn</th>
                  <th title="Conversie">Conv</th>
                  <th className="rang-dv" title="Score (punten − geforceerd)">Sco</th>
                  <th className="rang-dv" title="Gem. worpafstand">Afst</th>
                  <th className="an-col-sec" title="Vorm (punten per wedstrijd)">Vorm</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.playerId}>
                    <td className="rang-rank">{i + 1}</td>
                    <td className="rang-team">
                      <span className="rang-name">#{p.shirtNumber} {p.name}</span>
                      <span className="an-season-team">{p.teamName}</span>
                    </td>
                    <td>{p.matches}</td>
                    <td className="an-col-sec">{p.throws}</td>
                    <td>{p.goals} <span className="an-season-sub">({p.nek}/{p.rug})</span></td>
                    <td className="rang-pts">{p.points}</td>
                    <td>{Math.round(p.conversion * 100)}%</td>
                    <td className={`rang-dv ${p.score < 0 ? 'an-neg' : ''}`}>{p.score > 0 ? `+${p.score}` : p.score}</td>
                    <td className="rang-dv">{p.avgDistance.toFixed(1)}m</td>
                    <td className="an-col-sec an-spark-cell"><Sparkline values={p.trend.map((t) => t.points)} width={104} height={28} showAverage={false} ariaLabel={`Vorm ${p.name}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </>
  )
}
