import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { AnalyseNav } from '../AnalyseNav'
import { SeizoenPicker } from './SeizoenPicker'
import '../../rangschikking/rangschikking.css'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

// Compacte SVG-vormcurve (punten per gespeelde wedstrijd).
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="an-spark-empty">—</span>
  const w = 80
  const h = 22
  const max = Math.max(1, ...values)
  const step = w / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(' ')
  return (
    <svg className="an-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
  const players = await buildSeasonStats(payload, reeks)

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="seizoen" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Seizoensanalyse</span></h1>
          <SeizoenPicker reeks={reeks} options={[...COMPETITIE_REEKSEN]} />
        </div>

        {players.length === 0 ? (
          <p className="empty">Nog geen worpdata in deze reeks.</p>
        ) : (
          <div className="rang-scroll">
            <table className="rang-table an-season-table">
              <thead>
                <tr>
                  <th className="rang-rank">#</th>
                  <th className="rang-teamh">Speler</th>
                  <th title="Gespeelde wedstrijden">M</th>
                  <th title="Worpen">W</th>
                  <th title="Doelpunten">D</th>
                  <th title="Punten">Ptn</th>
                  <th title="Conversie">Conv</th>
                  <th className="rang-dv" title="Score (punten − geforceerd)">Sco</th>
                  <th className="rang-dv" title="Gem. worpafstand">Afst</th>
                  <th title="Vorm (punten per wedstrijd)">Vorm</th>
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
                    <td>{p.throws}</td>
                    <td>{p.goals} <span className="an-season-sub">({p.nek}/{p.rug})</span></td>
                    <td className="rang-pts">{p.points}</td>
                    <td>{Math.round(p.conversion * 100)}%</td>
                    <td className={`rang-dv ${p.score < 0 ? 'an-neg' : ''}`}>{p.score > 0 ? `+${p.score}` : p.score}</td>
                    <td className="rang-dv">{p.avgDistance.toFixed(1)}m</td>
                    <td className="an-spark-cell"><Sparkline values={p.trend.map((t) => t.points)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
