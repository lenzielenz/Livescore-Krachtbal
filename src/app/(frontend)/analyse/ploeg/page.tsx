import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { buildAttackPatterns } from '@/lib/attack-patterns'
import { getSelectedSeason, reeksenMetData } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { buildTeamDanger, buildTeamDefense } from '@/lib/player-danger'
import { resolveCompetitieReeks } from '@/lib/reeksen'
import { buildTeamReport } from '@/lib/team-report'
import { BandChart } from '@/components/analytics/BandChart'
import { AnalyseNav } from '../AnalyseNav'
import { AanvalsPatronen } from './AanvalsPatronen'
import { PloegPicker } from './PloegPicker'
import { SpeelstijlPanel } from './SpeelstijlPanel'
import { DangerPlayers } from './DangerPlayers'
import { TeamFlowMap } from './TeamFlowMap'
import { TeamProfile } from './TeamProfile'
import '../../rangschikking/rangschikking.css'
import '../analyse.css'

export const dynamic = 'force-dynamic'

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

  const payload = await getPayloadClient()
  const reeksOptions = await reeksenMetData(payload, analyseOwnWhere(me))
  const reeks = resolveCompetitieReeks(reeksParam, reeksOptions)
  // Enkel je eigen analyse-ploegen zijn selecteerbaar — competitie-ploegen verschijnen hier nooit.
  const teamsRes = await payload
    .find({ collection: 'teams', where: { and: [{ reeks: { equals: reeks } }, analyseOwnWhere(me)] }, sort: 'name', depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamOptions = teamsRes.docs.map((t) => ({ value: String(t.id), label: t.name as string }))

  const teamId = teamParam && teamOptions.some((o) => o.value === teamParam) ? Number(teamParam) : null
  const seizoen = await getSelectedSeason()
  const report = teamId != null ? await buildTeamReport(payload, teamId, seizoen, analyseOwnWhere(me)) : null
  // De drie afgeleiden (aanvallend gevaar, verdedigend "waar geven ze openingen", sterkste verdedigers)
  // hangen enkel van `report` af, niet van elkaar → parallel ophalen i.p.v. sequentieel.
  let danger: Awaited<ReturnType<typeof buildTeamDanger>> | null = null
  let dangerConceded: Awaited<ReturnType<typeof buildTeamDanger>> | null = null
  let defenders: Awaited<ReturnType<typeof buildTeamDefense>> = []
  let patterns: Awaited<ReturnType<typeof buildAttackPatterns>> | null = null
  if (teamId != null && report && report.matchesAnalyzed > 0) {
    ;[danger, dangerConceded, defenders, patterns] = await Promise.all([
      buildTeamDanger(payload, teamId, reeks, seizoen, analyseOwnWhere(me)),
      buildTeamDanger(payload, teamId, reeks, seizoen, analyseOwnWhere(me), { conceded: true }),
      buildTeamDefense(payload, teamId, reeks, seizoen, analyseOwnWhere(me)),
      buildAttackPatterns(payload, teamId, seizoen, analyseOwnWhere(me)),
    ])
  }
  const zTot = report ? report.zones.links + report.zones.midden + report.zones.rechts : 0

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="ploegen" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Ploegrapport</span></h1>
          <PloegPicker reeks={reeks} reeksOptions={reeksOptions} teamOptions={teamOptions} team={teamId != null ? String(teamId) : ''} />
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

            {/* Sleutelspelers — scout-TL;DR: wie in de gaten houden (aanvallend + verdedigend). */}
            {(() => {
              const first = (n: string) => n.split(/\s+/)[0]
              const players = report.players
              const topThreat = [...players].filter((p) => p.goals > 0).sort((a, b) => b.points - a.points || b.goals - a.goals)[0]
              const rugSpec = [...players].filter((p) => p.rug > 0).sort((a, b) => b.rug - a.rug)[0]
              const keyDef = defenders[0]
              const cards: { ico: string; lbl: string; who: string; val: string; sub: string }[] = []
              if (topThreat)
                cards.push({
                  ico: '⚡',
                  lbl: 'Topdreiging',
                  who: `#${topThreat.shirtNumber} ${first(topThreat.name)}`,
                  val: `${topThreat.points} ptn`,
                  sub: topThreat.tip || `${topThreat.goals} doelpunt${topThreat.goals === 1 ? '' : 'en'} · ${Math.round(topThreat.conversion * 100)}% conversie`,
                })
              if (rugSpec && (!topThreat || rugSpec.playerId !== topThreat.playerId))
                cards.push({
                  ico: '💪',
                  lbl: 'Rugworp-specialist',
                  who: `#${rugSpec.shirtNumber} ${first(rugSpec.name)}`,
                  val: `${rugSpec.rug}× rug`,
                  sub: `+${rugSpec.rug * 2} punten uit rugworpen`,
                })
              if (keyDef)
                cards.push({
                  ico: '🧤',
                  lbl: 'Sleutelverdediger',
                  who: `#${keyDef.shirtNumber} ${first(keyDef.name)}`,
                  val: `${keyDef.total} acties`,
                  sub: `${keyDef.catches} vangsten${keyDef.taps ? ` · ${keyDef.taps} tikken` : ''}`,
                })
              if (cards.length === 0) return null
              return (
                <section className="kp">
                  <h2 className="an-sub">🔑 Sleutelspelers <span className="an-chart-hint">wie in de gaten houden</span></h2>
                  <div className="kp-grid">
                    {cards.map((c, i) => (
                      <div className="kp-card" key={i}>
                        <span className="kp-ico" aria-hidden>{c.ico}</span>
                        <span className="kp-lbl">{c.lbl}</span>
                        <span className="kp-who">{c.who}</span>
                        <span className="kp-val">{c.val}</span>
                        <span className="kp-sub">{c.sub}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })()}

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

            {patterns && <AanvalsPatronen data={patterns} teamName={report.teamName} />}

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
                <h2 className="an-sub">🎯 Gevaarspelers <span className="an-chart-hint">wie stoppen — en van waar ze scoren</span></h2>
                <DangerPlayers flowShots={danger.flowShots} players={report.players} />

                {defenders.length > 0 && (
                  <>
                    <h2 className="an-sub">🧤 Sterkste verdedigers <span className="an-chart-hint">wie pakt de ballen af</span></h2>
                    <div className="an-recap-cards">
                      {defenders.slice(0, 4).map((d) => (
                        <div className="an-recap-card" key={d.playerId}>
                          <span className="an-recap-ico" aria-hidden>🧤</span>
                          <span className="an-recap-body">
                            <span className="an-recap-lbl">#{d.shirtNumber} {d.name.split(/\s+/)[0]}</span>
                            <span className="an-recap-val">{d.total} {d.total === 1 ? 'actie' : 'acties'}</span>
                            <span className="an-recap-who">
                              {d.catches} {d.catches === 1 ? 'vangst' : 'vangsten'}{d.taps ? ` · ${d.taps} ${d.taps === 1 ? 'tik' : 'tikken'}` : ''}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <h2 className="an-sub">🔥 Worp- &amp; scoreflow <span className="an-chart-hint">van waar ze smijten → waar ze scoren</span></h2>
                <div className="gev-grid">
                  <TeamFlowMap shots={danger.shots} flowShots={danger.flowShots} />
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

            {dangerConceded && dangerConceded.attempts > 0 && (
              <>
                <h2 className="an-sub">🔓 Waar ze openingen geven <span className="an-chart-hint">van waar tegenstanders tégen hen scoren</span></h2>
                <p className="an-intro">
                  De doelpogingen die tegenstanders <strong>tégen</strong> deze ploeg maakten. Hun zwakke zones zijn jouw
                  kansen — speel naar waar zij het meest tegengoals slikken.
                </p>
                <div className="gev-grid">
                  <TeamFlowMap shots={dangerConceded.shots} flowShots={dangerConceded.flowShots} />
                  <div className="gev-side">
                    <div className="rep-cards">
                      <div className="rep-card"><span className="rep-num">{dangerConceded.attempts}</span><span className="rep-lbl">Tegen-pogingen</span></div>
                      <div className="rep-card"><span className="rep-num">{dangerConceded.goals}</span><span className="rep-lbl">Tegengoals</span></div>
                      <div className="rep-card"><span className="rep-num">{Math.round(dangerConceded.conversion * 100)}%</span><span className="rep-lbl">Conversie tegen</span></div>
                      <div className="rep-card"><span className="rep-num">{dangerConceded.avgDistance}m</span><span className="rep-lbl">Gem. afstand</span></div>
                    </div>
                    <BandChart title="Diepte (openingen)" bands={dangerConceded.depthBands} />
                    <BandChart title="Breedte (openingen)" bands={dangerConceded.zoneBands} />
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
