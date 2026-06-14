import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getSelectedSeason, reeksenMetData } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { buildCoachDigest } from '@/lib/coach-digest'
import { buildExpectedPoints } from '@/lib/expected-points'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPlayerMovers } from '@/lib/player-movers'
import { resolveCompetitieReeks } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { buildTeamSeasonTrend } from '@/lib/season-trend'
import { teamEfficiency } from '@/lib/team-efficiency'
import { buildTeamReport } from '@/lib/team-report'
import { buildTrainingFocus } from '@/lib/training-focus'
import { AnalyseNav } from '../AnalyseNav'
import { PloegPicker } from '../ploeg/PloegPicker'
import { TeamForm } from '../ploeg/TeamForm'
import { TrainingFocus } from '../ploeg/TrainingFocus'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const firstName = (n: string) => n.split(/\s+/)[0]
const shortSeason = (s: string) => s.replace(/^\d{2}(\d{2})-\d{2}(\d{2})$/, "'$1-'$2")

// Coach-dashboard: één cockpit voor de eigen ploeg — digest, kerncijfers + efficiëntie (xP),
// vorm & meerjaren-groei, sleutelspelers, spelers in beweging, trainingsfocus en een snelplan.
export default async function CoachDashboardPage({ searchParams }: { searchParams: Promise<{ reeks?: string; team?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Coach-dashboard</span></h1>
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
  const teamsRes = await payload
    .find({ collection: 'teams', where: { and: [{ reeks: { equals: reeks } }, analyseOwnWhere(me)] }, sort: 'name', depth: 0, limit: 200 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const teamOptions = teamsRes.docs.map((t) => ({ value: String(t.id), label: t.name as string }))
  const teamId = teamParam && teamOptions.some((o) => o.value === teamParam) ? Number(teamParam) : null
  const seizoen = await getSelectedSeason()

  const report = teamId != null ? await buildTeamReport(payload, teamId, seizoen, analyseOwnWhere(me)) : null

  const picker = (
    <PloegPicker reeks={reeks} reeksOptions={reeksOptions} teamOptions={teamOptions} team={teamId != null ? String(teamId) : ''} basePath="/analyse/coach" />
  )

  const shell = (body: React.ReactNode) => (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="coach" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Coach-dashboard</span></h1>
          {picker}
        </div>
        <p className="cd-quick">
          <Link className="sk-demo-cta" href="/analyse/coach/voeding">🥗 Voedingsadvies op maat</Link>
        </p>
        {body}
      </div>
    </>
  )

  if (report == null) return shell(<p className="empty">Kies een ploeg om het dashboard te openen.</p>)
  if (report.matchesAnalyzed === 0) return shell(<p className="empty">Nog geen worpdata voor {report.teamName} dit seizoen.</p>)

  // Afgeleiden parallel: seizoenspelers (voor movers), xP (efficiëntie), meerjaren-groei.
  const [seasonPlayers, xp, seasonTrend] = await Promise.all([
    buildSeasonStats(payload, reeks, seizoen, analyseOwnWhere(me)).catch(() => []),
    buildExpectedPoints(payload, reeks, seizoen, analyseOwnWhere(me)).catch(() => null),
    buildTeamSeasonTrend(payload, teamId!, analyseOwnWhere(me)).catch(() => []),
  ])

  const ourPlayers = seasonPlayers.filter((p) => p.teamId === teamId)
  const movers = buildPlayerMovers(ourPlayers)
  const efficiency = xp ? teamEfficiency(xp.players, teamId!) : null
  const digest = buildCoachDigest(report, efficiency, movers)
  const focus = buildTrainingFocus(report)

  // Sleutelspelers uit het rapport (aanvallend + verdedigend).
  const players = report.players
  const topThreat = [...players].filter((p) => p.goals > 0).sort((a, b) => b.points - a.points || b.goals - a.goals)[0]
  const rugSpec = [...players].filter((p) => p.rug > 0 && (!topThreat || p.playerId !== topThreat.playerId)).sort((a, b) => b.rug - a.rug)[0]
  const keyDef = [...players].filter((p) => p.catches > 0).sort((a, b) => b.catches - a.catches)[0]
  const keyCards: { ico: string; lbl: string; who: string; val: string; sub: string }[] = []
  if (topThreat) keyCards.push({ ico: '⚡', lbl: 'Topdreiging', who: `#${topThreat.shirtNumber} ${firstName(topThreat.name)}`, val: `${topThreat.points} ptn`, sub: topThreat.tip || `${topThreat.goals} doelpunt${topThreat.goals === 1 ? '' : 'en'}` })
  if (rugSpec) keyCards.push({ ico: '💪', lbl: 'Rugworp-specialist', who: `#${rugSpec.shirtNumber} ${firstName(rugSpec.name)}`, val: `${rugSpec.rug}× rug`, sub: `+${rugSpec.rug * 2} punten dubbel` })
  if (keyDef) keyCards.push({ ico: '🧤', lbl: 'Sleutelverdediger', who: `#${keyDef.shirtNumber} ${firstName(keyDef.name)}`, val: `${keyDef.catches} vangsten`, sub: 'pakt de meeste ballen af' })

  return shell(
    <>
      {/* Hero */}
      <div className="cd-hero">
        <div className="cd-hero-id">
          <span className="cd-hero-name">{report.teamName}</span>
          <span className="cd-hero-meta">{report.reeks}{seizoen ? ` · ${seizoen}` : ''} · {report.matchesAnalyzed} wedstrijden</span>
        </div>
        {report.profile.tags.length > 0 && (
          <div className="cd-hero-tags">
            {report.profile.tags.map((t) => <span key={t} className="rep-tag">{t}</span>)}
          </div>
        )}
      </div>

      {/* Digest */}
      {digest.length > 0 && (
        <ul className="cd-digest">
          {digest.map((d, i) => (
            <li key={i} className={`cd-digest-item ${d.tone}`}>
              <span className="cd-digest-ico" aria-hidden>{d.icon}</span>
              <span>{d.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Kerncijfers + efficiëntie */}
      <div className="rep-cards">
        <div className="rep-card"><span className="rep-num">{report.totals.goals}</span><span className="rep-lbl">Doelpunten</span></div>
        <div className="rep-card"><span className="rep-num">{report.totals.points}</span><span className="rep-lbl">Punten</span></div>
        <div className="rep-card"><span className="rep-num">{Math.round(report.totals.conversion * 100)}%</span><span className="rep-lbl">Conversie</span></div>
        <div className="rep-card"><span className="rep-num">{report.totals.avgDistance}m</span><span className="rep-lbl">Gem. afstand</span></div>
        <div className="rep-card"><span className="rep-num">{report.totals.catches}</span><span className="rep-lbl">Vangsten</span></div>
        {efficiency && (
          <div className="rep-card">
            <span className={`rep-num ${efficiency.diff < 0 ? 'an-neg' : ''}`}>{efficiency.diff > 0 ? `+${efficiency.diff}` : efficiency.diff}</span>
            <span className="rep-lbl">vs verwacht (xP)</span>
          </div>
        )}
      </div>

      {/* Vorm + meerjaren */}
      <div className="cd-trends">
        {report.form && report.form.length >= 2 && <TeamForm form={report.form} />}
        {seasonTrend.length >= 2 && (
          <TeamForm
            form={seasonTrend.map((s) => ({ date: null, points: s.pointsPerMatch, conversion: s.conversion }))}
            label="Meerjaren"
            hint="punten per match & conversie per seizoen"
            labels={seasonTrend.map((s) => shortSeason(s.season))}
            note={`${seasonTrend.length} seizoenen`}
          />
        )}
      </div>

      {/* Sleutelspelers */}
      {keyCards.length > 0 && (
        <section className="kp">
          <h2 className="an-sub">🔑 Sleutelspelers <span className="an-chart-hint">de kern van je ploeg</span></h2>
          <div className="kp-grid">
            {keyCards.map((c, i) => (
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
      )}

      {/* Spelers in beweging */}
      {(movers.risers.length > 0 || movers.fallers.length > 0) && (
        <section className="cd-movers">
          <h2 className="an-sub">↕ Spelers in beweging <span className="an-chart-hint">vorm binnen het seizoen</span></h2>
          <div className="cd-movers-grid">
            <div className="cd-movers-col">
              <h3 className="cd-movers-head up">📈 In stijgende vorm</h3>
              {movers.risers.length === 0 ? <p className="cd-movers-empty">—</p> : movers.risers.map((m) => (
                <div className="cd-mover" key={m.playerId}>
                  <span className="cd-mover-who">#{m.shirtNumber} {firstName(m.name)}</span>
                  <span className="cd-mover-delta up">+{m.delta}</span>
                  <span className="cd-mover-sub">{m.early} → {m.late} ptn/match</span>
                </div>
              ))}
            </div>
            <div className="cd-movers-col">
              <h3 className="cd-movers-head down">📉 Vorm zakt</h3>
              {movers.fallers.length === 0 ? <p className="cd-movers-empty">—</p> : movers.fallers.map((m) => (
                <div className="cd-mover" key={m.playerId}>
                  <span className="cd-mover-who">#{m.shirtNumber} {firstName(m.name)}</span>
                  <span className="cd-mover-delta down">{m.delta}</span>
                  <span className="cd-mover-sub">{m.early} → {m.late} ptn/match</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trainingsfocus */}
      <TrainingFocus items={focus} />

      <div className="cd-links">
        <Link className="sk-demo-cta" href={`/analyse/ploeg?reeks=${reeks}&team=${teamId}`}>🛡️ Volledig ploegrapport</Link>
        <Link className="sk-demo-cta" href={`/analyse/spelers?reeks=${reeks}`}>🎯 Spelers vergelijken</Link>
        <Link className="sk-demo-cta" href="/analyse/coach/voeding">🥗 Voedingsadvies</Link>
        <Link className="sk-demo-cta" href="/beheer/training">🏋️ Training</Link>
      </div>
    </>,
  )
}
