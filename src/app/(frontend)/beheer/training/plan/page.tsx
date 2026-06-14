import Link from 'next/link'
import type { Where } from 'payload'

import { PrintButton } from '@/components/PrintButton'
import { SiteHeader } from '@/components/SiteHeader'
import { canTraining, hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getSelectedSeason } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { TRAINING_METRICS, type TrainingMeting } from '@/lib/training-metrics'
import {
  buildPlayerTrainingPlan,
  buildTeamTrainingPlan,
  type MatchHints,
  type MetricAssessment,
  type PlanSession,
  type PlayerTrainingPlan,
  type TeamTrainingPlan,
} from '@/lib/training-plan'
import { TrainingHero } from '../TrainingHero'
import { PlanPicker } from './PlanPicker'
import { PlanWeek } from './PlanWeek'
import { SavePlanGoals } from './SavePlanGoals'
import '../training.css'

export const dynamic = 'force-dynamic'

type PlayerRow = { id: number; name: string; reeks: string; reeksNaam: string }

const STATUS_LABEL: Record<MetricAssessment['status'], string> = {
  sterk: 'Sterk',
  ok: 'Op koers',
  werkpunt: 'Werkpunt',
  'geen-data': 'Geen data',
}

function Sessions({ week }: { week: PlanSession[] }) {
  return (
    <div className="tp-week">
      {week.map((s) => (
        <div className="tp-session" key={s.day}>
          <div className="tp-session-head">
            <span className="tp-session-day">{s.day}</span>
            <span className="tp-session-title">{s.title}</span>
          </div>
          <ul className="tp-drills">
            {s.drills.map((d) => (
              <li key={d.name} className="tp-drill">
                <span className="tp-drill-name">{d.name}</span>
                <span className="tp-drill-how">{d.how}</span>
                <span className="tp-drill-prog">↗ {d.progressie}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function FocusChips({ focus }: { focus: PlayerTrainingPlan['focus'] }) {
  if (focus.length === 0) return null
  return (
    <div className="tp-focus">
      {focus.map((f) => (
        <div className="tp-focus-card" key={f.domain}>
          <span className="tp-focus-lbl">{f.label}</span>
          <span className="tp-focus-why">{f.why}</span>
        </div>
      ))}
    </div>
  )
}

function PhaseBanner({ phase }: { phase: PlayerTrainingPlan['phase'] }) {
  return (
    <div className="tp-phase">
      <span className="tp-phase-lbl">📆 Fase: {phase.label}</span>
      <span className="tp-phase-note">{phase.note}</span>
    </div>
  )
}

function PlayerPlanView({ plan }: { plan: PlayerTrainingPlan }) {
  return (
    <>
      <PhaseBanner phase={plan.phase} />

      <h2 className="tp-h2">Meting & doel</h2>
      <div className="tp-assess">
        {plan.assessment.map((a) => (
          <div className={`tp-metric st-${a.status}`} key={a.key}>
            <span className="tp-metric-lbl">{a.label}</span>
            <span className="tp-metric-now">{a.best != null ? `${a.best}` : '—'}<small> {a.unit} best</small></span>
            <span className="tp-metric-sub">
              {a.latest != null ? `nu ${a.latest}` : 'nog niet gemeten'}{a.goal != null ? ` · doel ${a.goal}` : ''}
            </span>
            <span className={`tp-metric-st st-${a.status}`}>{STATUS_LABEL[a.status]}</span>
          </div>
        ))}
      </div>

      <h2 className="tp-h2">🎯 Focus op maat</h2>
      <FocusChips focus={plan.focus} />

      {plan.targets.length > 0 && (
        <>
          <h2 className="tp-h2">Doelen voor 6 weken</h2>
          <div className="tp-targets">
            {plan.targets.map((t) => (
              <div className="tp-target" key={t.key}>
                <span className="tp-target-lbl">{t.label}</span>
                <span className="tp-target-val">{t.from ?? '—'} → <strong>{t.target}</strong> {t.unit}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="tp-h2">🗓️ Trainingsweek</h2>
      <p className="tp-weeknote">Drie sessies + minstens één rustdag. Bouw de last week na week op (progressieve overload).</p>
      <Sessions week={plan.week} />
    </>
  )
}

function TeamPlanView({ plan }: { plan: TeamTrainingPlan }) {
  const maxCount = Math.max(1, ...plan.spread.map((s) => s.count))
  return (
    <>
      <PhaseBanner phase={plan.phase} />

      <h2 className="tp-h2">Ploegfocus <span className="tp-sub">werkpunten over {plan.players} spelers</span></h2>
      <div className="tp-spread">
        {plan.spread.map((s) => (
          <div className="tp-spread-row" key={s.domain}>
            <span className="tp-spread-lbl">{s.label}</span>
            <span className="tp-spread-track"><span className="tp-spread-fill" style={{ width: `${Math.round((s.count / maxCount) * 100)}%` }} /></span>
            <span className="tp-spread-n">{s.count}</span>
          </div>
        ))}
      </div>

      <FocusChips focus={plan.focus} />

      <h2 className="tp-h2">🗓️ Ploegtrainingsweek</h2>
      <p className="tp-weeknote">Gedeelde sessies rond de grootste werkpunten van de groep — individualiseer waar nodig.</p>
      <Sessions week={plan.week} />
    </>
  )
}

export default async function TrainingPlanPage({ searchParams }: { searchParams: Promise<{ reeks?: string; speler?: string }> }) {
  const me = await getAuthUser()
  if (!canTraining(me)) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">Trainingsplan</h1>
          <p className="empty">Enkel voor admin/federatie of club-beheerders. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam, speler: spelerParam } = await searchParams
  const payload = await getPayloadClient()
  const rawClubId = userClubId(me)
  const myClubId: number | null = rawClubId != null && Number.isFinite(Number(rawClubId)) ? Number(rawClubId) : null
  const playerWhere: Where = myClubId != null ? { 'team.club': { equals: myClubId } } : {}

  const [playersRes, metingenRes, doelenRes] = await Promise.all([
    payload.find({ collection: 'players', where: playerWhere, depth: 2, limit: 2000, sort: 'name' }),
    payload.find({ collection: 'trainingmetingen', depth: 0, limit: 5000, sort: 'datum' }),
    payload.find({ collection: 'trainingdoelen', depth: 0, limit: 2000 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const players: PlayerRow[] = playersRes.docs.map((p) => {
    const team = typeof p.team === 'object' && p.team ? p.team : null
    const reeks = (team?.reeks as string | null | undefined) ?? ''
    return { id: p.id as number, name: (p.name as string) ?? '—', reeks, reeksNaam: reeks ? reeksNaam(reeks) : 'Overig' }
  })
  const playerIds = new Set(players.map((p) => p.id))

  const metingen: TrainingMeting[] = metingenRes.docs
    .map((m) => {
      const speler = typeof m.speler === 'object' && m.speler ? (m.speler as { id: number }).id : (m.speler as number)
      const row = { speler, datum: m.datum as string } as TrainingMeting
      for (const metric of TRAINING_METRICS) row[metric.key] = (m[metric.key as keyof typeof m] as number | null | undefined) ?? null
      return row
    })
    .filter((m) => playerIds.has(m.speler))

  const doelen = doelenRes.docs
    .map((d) => ({
      speler: typeof (d as { speler?: unknown }).speler === 'object' ? (d as { speler: { id: number } }).speler.id : (d as { speler: number }).speler,
      metriek: String((d as { metriek?: unknown }).metriek ?? ''),
      doel: Number((d as { doel?: unknown }).doel ?? 0),
    }))
    .filter((d) => playerIds.has(d.speler))

  // Reeks-opties (op basis van de spelers van de club).
  const reeksOptions = [...new Map(players.map((p) => [p.reeks || 'overig', p.reeksNaam])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nl'))
  const reeks = reeksParam && reeksOptions.some((o) => o.value === reeksParam) ? reeksParam : reeksOptions[0]?.value ?? ''
  const inReeks = players.filter((p) => (p.reeks || 'overig') === reeks)
  const spelerOptions = inReeks.map((p) => ({ value: String(p.id), label: p.name }))
  const speler = spelerParam && spelerOptions.some((o) => o.value === spelerParam) ? spelerParam : 'team'

  const metingenOf = (pid: number) => metingen.filter((m) => m.speler === pid)
  const doelenOf = (pid: number) => doelen.filter((d) => d.speler === pid)

  // Matchdata-hints per speler (echte competitiestats van de reeks) — voedt de focuskeuze.
  const seizoen = await getSelectedSeason()
  const seasonPlayers = reeks && reeks !== 'overig' ? await buildSeasonStats(payload, reeks, seizoen, competitionWhere()).catch(() => []) : []
  const hintsBy = new Map<number, MatchHints>()
  for (const sp of seasonPlayers) {
    hintsBy.set(sp.playerId, {
      conversion: sp.conversion,
      avgDistance: sp.avgDistance,
      rugShare: sp.goals ? sp.rug / sp.goals : null,
      lossRate: sp.throws ? sp.lost / sp.throws : null,
    })
  }

  // Wie mag doelen wegschrijven (federatie/club-beheerder)?
  const canWrite = isFederationLevel(me) || hasRole(me, 'club-beheerder')
  // Inplannen kan enkel met een gekende club (sessies horen bij een club).
  const canPlan = canWrite && myClubId != null
  const planReeks = reeks === 'overig' ? '' : reeks

  let body: React.ReactNode = null
  let actions: React.ReactNode = null
  if (players.length === 0) {
    body = <p className="empty">Nog geen spelers gekoppeld. Voeg eerst leden toe.</p>
  } else if (speler !== 'team') {
    const p = inReeks.find((x) => String(x.id) === speler)
    if (p) {
      const plan = buildPlayerTrainingPlan({ name: p.name, metingen: metingenOf(p.id), goals: doelenOf(p.id), hints: hintsBy.get(p.id) })
      body = <PlayerPlanView plan={plan} />
      actions = (
        <>
          {canWrite && <SavePlanGoals speler={p.id} targets={plan.targets} />}
          {canPlan && <PlanWeek club={myClubId!} reeks={planReeks} sessions={plan.week} />}
          <PrintButton mode="trainingplan" label="🖨️ Print plan" />
        </>
      )
    } else {
      body = <p className="empty">Speler niet gevonden.</p>
    }
  } else {
    const squad = inReeks.map((p) => ({ name: p.name, metingen: metingenOf(p.id), goals: doelenOf(p.id), hints: hintsBy.get(p.id) }))
    if (squad.length) {
      const teamPlan = buildTeamTrainingPlan({ squad })
      body = <TeamPlanView plan={teamPlan} />
      actions = (
        <>
          {canPlan && <PlanWeek club={myClubId!} reeks={planReeks} sessions={teamPlan.week} />}
          <PrintButton mode="trainingplan" label="🖨️ Print plan" />
        </>
      )
    } else {
      body = <p className="empty">Nog geen spelers in deze reeks.</p>
    }
  }

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="plan" />
        <div className="an-head-bar">
          <p className="wb-intro" style={{ margin: 0 }}>
            Een trainingsplan <strong>op maat</strong> uit de metingen, doelen en wedstrijddata — per ploeg of per speler.
          </p>
          <PlanPicker reeks={reeks} reeksOptions={reeksOptions} speler={speler} spelerOptions={spelerOptions} />
        </div>
        {actions && <div className="tp-actions">{actions}</div>}
        <div id="training-plan">{body}</div>
      </div>
    </>
  )
}
