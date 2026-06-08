import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseMatchWhere } from '@/lib/analyse-access'
import { getSelectedSeason } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { clubColors, clubLogoUrl } from '@/lib/match-engine'
import { buildTeamDanger } from '@/lib/player-danger'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { buildTeamReport } from '@/lib/team-report'
import { BandChart } from '@/components/analytics/BandChart'
import { AnalyseNav } from '../AnalyseNav'
import { PloegPicker } from './PloegPicker'
import { SpeelstijlPanel } from './SpeelstijlPanel'
import { TeamFlowMap } from './TeamFlowMap'
import { TeamProfile } from './TeamProfile'
import { TeamShareCard } from './TeamShareCard'
import '../../rangschikking/rangschikking.css'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}

// Tegenstander-/ploegrapport (scouting) met CSV/PDF-export. Admin/analyse-only.
export default async function PloegRapportPage({ searchParams }: { searchParams: Promise<{ reeks?: string; team?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Ploegrapport</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam, team: teamParam } = await searchParams
  const reeks =
    typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam)
      ? reeksParam
      : COMPETITIE_REEKSEN[0].value

  const payload = await getPayloadClient()
  const teamsRes = await payload
    .find({ collection: 'teams', where: { reeks: { equals: reeks } }, sort: 'name', depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamOptions = teamsRes.docs.map((t) => ({ value: String(t.id), label: t.name as string }))

  const teamId = teamParam && teamOptions.some((o) => o.value === teamParam) ? Number(teamParam) : null
  const seizoen = await getSelectedSeason()
  const report = teamId != null ? await buildTeamReport(payload, teamId, seizoen, analyseMatchWhere(me)) : null
  const danger = teamId != null && report && report.matchesAnalyzed > 0 ? await buildTeamDanger(payload, teamId, reeks, seizoen, analyseMatchWhere(me)) : null
  const zTot = report ? report.zones.links + report.zones.midden + report.zones.rechts : 0

  // Clubgegevens (logo + kleuren) voor de deelbare team-DNA-kaart — zelfde bron als de rest van de app.
  const teamClub =
    report && report.matchesAnalyzed > 0
      ? await payload.findByID({ collection: 'teams', id: report.teamId, depth: 2 }).catch(() => null)
      : null
  const teamColors = teamClub ? clubColors(teamClub) : null
  const teamLogo = teamClub ? clubLogoUrl(teamClub) : null

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="ploegen" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Ploegrapport</span></h1>
          <PloegPicker reeks={reeks} reeksOptions={[...COMPETITIE_REEKSEN]} teamOptions={teamOptions} team={teamId != null ? String(teamId) : ''} />
        </div>

        {report != null && (
          <SpeelstijlPanel teamId={report.teamId} teamName={report.teamName} initial={report.speelstijl} />
        )}

        {report == null ? (
          <p className="empty">Kies een ploeg om het rapport te bekijken.</p>
        ) : report.matchesAnalyzed === 0 ? (
          <p className="empty">Nog geen worpdata voor {report.teamName} in afgelopen wedstrijden.</p>
        ) : (
          <>
            <div className="rep-exports">
              <a className="sk-demo-cta" href={`/api/analyse/team/${report.teamId}/pdf`}>📄 Download PDF</a>
              <a className="sk-demo-cta" href={`/api/analyse/team/${report.teamId}/csv`}>📑 Download CSV</a>
            </div>

            {/* Deelbaar team-DNA: editoriale SVG-kaart, delen/downloaden. */}
            <section className="match-share" style={{ marginTop: 4 }}>
              <h2 className="an-sub">📲 Deel het team-DNA</h2>
              <TeamShareCard
                teamName={report.teamName}
                clubLogoUrl={teamLogo}
                colors={teamColors ?? { primary: '#06d6a0', secondary: '#06d6a0' }}
                reeksLabel={reeksNaam(reeks)}
                season="25/26"
                tags={report.profile.tags}
                radar={report.profile.radar.map((a) => ({ label: a.label, frac: a.value / 100 }))}
                chips={[
                  { label: 'Doelpunten', val: `${report.totals.goals}` },
                  { label: 'Punten', val: `${report.totals.points}` },
                  { label: 'Conversie', val: `${Math.round(report.totals.conversion * 100)}%` },
                  { label: 'Gem. afstand', val: `${report.totals.avgDistance}m` },
                  { label: 'Vangsten', val: `${report.totals.catches}` },
                  { label: 'Wedstrijden', val: `${report.matchesAnalyzed}` },
                ]}
                headline={report.profile.strengths[0]?.title ?? null}
              />
            </section>

            <TeamProfile profile={report.profile} />

            {report.strategy.length > 0 && (
              <section className="rep-advies rep-strategie">
                <h2 className="an-sub">🎯 Strategie <span className="an-chart-hint">jullie speelstijl naast de data</span></h2>
                <ul className="rep-advies-list">
                  {report.strategy.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}

            {report.insights.length > 0 && (
              <section className="rep-advies">
                <h2 className="an-sub">💡 Aanbevelingen <span className="an-chart-hint">automatisch uit de data</span></h2>
                <ul className="rep-advies-list">
                  {report.insights.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="rep-cards">
              <div className="rep-card"><span className="rep-num">{report.matchesAnalyzed}</span><span className="rep-lbl">Wedstrijden</span></div>
              <div className="rep-card"><span className="rep-num">{report.totals.throws}</span><span className="rep-lbl">Worpen</span></div>
              <div className="rep-card"><span className="rep-num">{report.totals.goals}</span><span className="rep-lbl">Doelpunten</span></div>
              <div className="rep-card"><span className="rep-num">{report.totals.points}</span><span className="rep-lbl">Punten</span></div>
              <div className="rep-card"><span className="rep-num">{Math.round(report.totals.conversion * 100)}%</span><span className="rep-lbl">Conversie</span></div>
              <div className="rep-card"><span className="rep-num">{report.totals.avgDistance}m</span><span className="rep-lbl">Gem. afstand</span></div>
              <div className="rep-card"><span className="rep-num">{report.totals.catches}</span><span className="rep-lbl">Vangsten</span></div>
              <div className="rep-card"><span className="rep-num">{report.totals.caughtAgainst}</span><span className="rep-lbl">Balverlies (gevangen)</span></div>
            </div>

            <div className="an-charts-grid" style={{ marginTop: 16 }}>
              <div className="an-chart">
                <h3 className="an-chart-title">Zoneverdeling <span className="an-chart-hint">waar de worpen landen</span></h3>
                <div className="an-bars">
                  {([['Links', report.zones.links], ['Midden', report.zones.midden], ['Rechts', report.zones.rechts]] as const).map(([lbl, v]) => (
                    <div className="an-bar-row" key={lbl}>
                      <span className="an-bar-lbl">{lbl}</span>
                      <span className="an-bar-track"><span className="an-bar-fill xp-rate-fill" style={{ width: `${pct(v, zTot)}%` }} /></span>
                      <span className="an-bar-val">{pct(v, zTot)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="an-chart">
                <h3 className="an-chart-title">Worptype <span className="an-chart-hint">doelpunten naar type</span></h3>
                <div className="an-bars">
                  {([['Nekworp (+1)', report.totals.nek], ['Rugworp (+2)', report.totals.rug]] as const).map(([lbl, v]) => (
                    <div className="an-bar-row" key={lbl}>
                      <span className="an-bar-lbl">{lbl}</span>
                      <span className="an-bar-track"><span className="an-bar-fill xp-rate-fill" style={{ width: `${pct(v, report.totals.goals)}%` }} /></span>
                      <span className="an-bar-val">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <h2 className="an-sub">Per speler</h2>
            <div className="rang-scroll">
              <table className="rang-table">
                <thead>
                  <tr>
                    <th className="rang-rank">#</th>
                    <th className="rang-teamh">Speler</th>
                    <th title="Wedstrijden">M</th>
                    <th title="Worpen">W</th>
                    <th title="Doelpunten">D</th>
                    <th title="Punten">Ptn</th>
                    <th title="Conversie">Conv</th>
                    <th className="rang-dv" title="Gem. afstand">Afst</th>
                    <th className="rang-dv" title="Balverlies door vangst">Verl</th>
                    <th title="Vangsten (verdedigend)">Vang</th>
                  </tr>
                </thead>
                <tbody>
                  {report.players.map((p, i) => (
                    <tr key={p.playerId}>
                      <td className="rang-rank">{i + 1}</td>
                      <td className="rang-team">
                        <span className="rang-name">#{p.shirtNumber} {p.name}</span>
                        {p.tip && <span className="rep-tip">{p.tip}</span>}
                      </td>
                      <td>{p.matches}</td>
                      <td>{p.throws}</td>
                      <td>{p.goals} <span className="an-season-sub">({p.nek}/{p.rug})</span></td>
                      <td className="rang-pts">{p.points}</td>
                      <td>{Math.round(p.conversion * 100)}%</td>
                      <td className="rang-dv">{p.avgDistance.toFixed(1)}m</td>
                      <td className="rang-dv">{p.caughtLost}</td>
                      <td className="rep-catch">{p.catches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {danger && danger.attempts > 0 && (
              <>
                <h2 className="an-sub">🔥 Worp- &amp; scoreflow <span className="an-chart-hint">van waar ze smijten → waar ze scoren</span></h2>
                <div className="gev-grid">
                  <TeamFlowMap shots={danger.shots} />
                  <div className="gev-side">
                    <div className="rep-cards">
                      <div className="rep-card"><span className="rep-num">{danger.attempts}</span><span className="rep-lbl">Doelpogingen</span></div>
                      <div className="rep-card"><span className="rep-num">{danger.goals}</span><span className="rep-lbl">Doelpunten</span></div>
                      <div className="rep-card"><span className="rep-num">{Math.round(danger.conversion * 100)}%</span><span className="rep-lbl">Conversie</span></div>
                      <div className="rep-card"><span className="rep-num">{danger.avgDistance}m</span><span className="rep-lbl">Gem. afstand</span></div>
                    </div>
                    <BandChart title="Diepte" bands={danger.depthBands} />
                    <BandChart title="Breedte" bands={danger.zoneBands} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
