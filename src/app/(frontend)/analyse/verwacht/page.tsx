import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildExpectedPoints } from '@/lib/expected-points'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { ScoringField } from './ScoringField'
import { VerwachtPicker } from './VerwachtPicker'
import '../../rangschikking/rangschikking.css'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

// Verwachte punten (xG-achtig): wie scoort er boven of onder verwachting?
export default async function VerwachtAnalysePage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Verwachte punten</span></h1>
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
  const { players, buckets, totals, dangerShots } = await buildExpectedPoints(payload, reeks)

  const maxAbsDiff = Math.max(1, ...players.map((p) => Math.abs(p.diff)))

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <Link href="/analyse" className="back-link">← Analyse</Link>
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Verwachte punten</span></h1>
          <VerwachtPicker reeks={reeks} options={[...COMPETITIE_REEKSEN]} />
        </div>
        <p className="an-intro">
          Het model schat per doelpoging de scoringskans op basis van worptype en afstand (geleerd uit de historiek van
          de reeks). <strong>Boven verwachting</strong> = scherper afgewerkt dan een gemiddelde speler vanuit dezelfde
          posities.
        </p>

        {players.length === 0 ? (
          <p className="empty">Nog geen doelpogingen in deze reeks.</p>
        ) : (
          <>
            <div className="rang-scroll">
              <table className="rang-table">
                <thead>
                  <tr>
                    <th className="rang-rank">#</th>
                    <th className="rang-teamh">Speler</th>
                    <th title="Doelpogingen">DP</th>
                    <th title="Doelpunten">D</th>
                    <th title="Werkelijke punten">Ptn</th>
                    <th title="Verwachte punten">xP</th>
                    <th title="Punten boven/onder verwachting">±</th>
                    <th className="xp-barh">Boven / onder verwachting</th>
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
                      <td>{p.attempts}</td>
                      <td>{p.goals}</td>
                      <td className="rang-pts">{p.points}</td>
                      <td>{p.xPoints.toFixed(1)}</td>
                      <td className={`xp-diff ${p.diff > 0 ? 'xp-pos' : p.diff < 0 ? 'xp-neg' : ''}`}>
                        {p.diff > 0 ? `+${p.diff.toFixed(1)}` : p.diff.toFixed(1)}
                      </td>
                      <td className="xp-bar-cell">
                        <span className="xp-bar">
                          <span className="xp-bar-mid" />
                          <span
                            className={`xp-bar-fill ${p.diff >= 0 ? 'xp-pos' : 'xp-neg'}`}
                            style={{
                              width: `${(Math.abs(p.diff) / maxAbsDiff) * 50}%`,
                              left: p.diff >= 0 ? '50%' : undefined,
                              right: p.diff < 0 ? '50%' : undefined,
                            }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="an-xp-totals">
              Reeks: {totals.attempts} doelpogingen · {totals.goals} doelpunten · {totals.points} punten werkelijk vs{' '}
              {totals.xPoints.toFixed(1)} verwacht.
            </p>

            <h2 className="an-sub">Scoringskans per zone</h2>
            <p className="an-intro">
              De veldhelft kleurt per zone van <strong style={{ color: '#ef476f' }}>rood</strong> (moeilijk scoren) naar{' '}
              <strong style={{ color: '#06d6a0' }}>groen</strong> (makkelijk), van waar er geworpen wordt — met onderscheid
              links/midden/rechts. Beide speelhelften zijn naar één doel (onderaan) gespiegeld.
            </p>
            {dangerShots.length > 0 && (
              <div className="xp-fieldwrap">
                <ScoringField shots={dangerShots} />
              </div>
            )}
            <div className="an-charts-grid">
              {(['nek', 'rug'] as const).map((type) => {
                const rows = buckets.filter((b) => b.type === type)
                if (rows.length === 0) return null
                return (
                  <div className="an-chart" key={type}>
                    <h3 className="an-chart-title">
                      {type === 'nek' ? 'Nekworp (+1)' : 'Rugworp (+2)'}{' '}
                      <span className="an-chart-hint">scoringskans per afstand</span>
                    </h3>
                    <div className="an-bars">
                      {rows.map((b) => (
                        <div className="an-bar-row" key={b.distLabel}>
                          <span className="an-bar-lbl">{b.distLabel}</span>
                          <span className="an-bar-track">
                            <span className="an-bar-fill xp-rate-fill" style={{ width: `${Math.round(b.rate * 100)}%` }} />
                          </span>
                          <span className="an-bar-val">{Math.round(b.rate * 100)}% <span className="an-season-sub">({b.goals}/{b.attempts})</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
