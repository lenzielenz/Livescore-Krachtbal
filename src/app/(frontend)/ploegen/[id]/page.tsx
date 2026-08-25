import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { formatDateTimeBE } from '@/lib/datetime'
import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { buildTeamSeasonTrend } from '@/lib/season-trend'
import { buildTeamReport } from '@/lib/team-report'
import type { Match } from '@/payload-types'
import { TeamForm } from '../../analyse/ploeg/TeamForm'
import { TeamProfile } from '../../analyse/ploeg/TeamProfile'
import '../../analyse/analyse.css'
import '../../publieke-stats.css'

// Publiek ploeg-profiel: toont het ploegrapport (DNA-radar, sterktes/zwaktes, vorm, spelers) dat we
// al berekenen — voorheen enkel achter de coach/analyse-login.
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

type TeamDoc = { name?: string; reeks?: string | null; analyseOnly?: boolean; club?: unknown }

async function loadTeam(id: number): Promise<TeamDoc | null> {
  if (!Number.isFinite(id)) return null
  const payload = await getPayloadClient()
  return (await payload.findByID({ collection: 'teams', id, depth: 1 }).catch(() => null)) as TeamDoc | null
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const team = await loadTeam(Number(id))
  return { title: team?.name ? `${team.name} — Krachtbal Live` : 'Ploeg — Krachtbal Live' }
}

export default async function PloegProfiel({ params }: Params) {
  const { id } = await params
  const teamId = Number(id)
  const team = await loadTeam(teamId)
  // Analyse-ploegen zijn privé (eigenaar-only); enkel echte competitieploegen zijn publiek.
  if (!team || team.analyseOnly) notFound()

  const payload = await getPayloadClient()
  const [report, trend, matchesRes] = await Promise.all([
    buildTeamReport(payload, teamId, null, competitionWhere()).catch(() => null),
    buildTeamSeasonTrend(payload, teamId, competitionWhere()).catch(() => []),
    // Volledige seizoensagenda (verleden + toekomst) — ongelimiteerd, i.t.t. de club-pagina die
    // maar 6 wedstrijden vooruit/terug toont. Dit ís de "hele agenda" die vanaf het live-bord
    // met één tik (op ploegnaam/logo) bereikbaar moet zijn.
    payload
      .find({
        collection: 'matches',
        where: { and: [{ or: [{ homeTeam: { equals: teamId } }, { awayTeam: { equals: teamId } }] }, competitionWhere()] },
        sort: 'date',
        depth: 1,
        limit: 300,
      })
      .catch(() => ({ docs: [] as Match[] })),
  ])

  const scoreboards = await buildScoreboards(payload, matchesRes.docs)
  const opponentName = (v: Match['homeTeam']): string => (v && typeof v === 'object' ? (v.name ?? '—') : '—')
  const relId = (v: Match['homeTeam']): number | null => (v && typeof v === 'object' ? v.id : (v ?? null))
  const fixtures = matchesRes.docs.map((m) => {
    const thuis = relId(m.homeTeam) === teamId
    const sb = scoreboards.get(m.id)
    return {
      id: m.id,
      date: m.date ?? null,
      reeks: m.reeks ?? null,
      thuis,
      opponent: opponentName(thuis ? m.awayTeam : m.homeTeam),
      status: sb?.status ?? m.status ?? 'scheduled',
      score: sb?.score ?? null,
    }
  })

  const club = (team.club && typeof team.club === 'object' ? team.club : null) as
    | { id: number; name?: string }
    | null

  return (
    <>
      <SiteHeader />
      <main className="an-wrap">
        <div className="ps-hero">
          <div className="ps-hero-num" aria-hidden>
            ⚑
          </div>
          <div>
            <h1 className="ps-name">{team.name ?? 'Ploeg'}</h1>
            <p className="ps-meta">
              {team.reeks ? <span className="ps-tag">{reeksNaam(team.reeks)}</span> : null}
              {club ? <Link href={`/clubs/${club.id}`}>{club.name ?? 'Club'}</Link> : null}
            </p>
          </div>
        </div>

        {fixtures.length > 0 && (
          <section className="an-card ps-fixtures">
            <div className="ps-fixtures-head">
              <h2 className="an-h2">Seizoensagenda</h2>
              <a
                className="ps-ics"
                href={`/api/agenda/ics?teams=${teamId}&name=${encodeURIComponent(team.name ?? 'Ploeg')}`}
                title="Hele seizoensagenda downloaden (Google/Apple/Outlook)"
              >
                📅 In agenda
              </a>
            </div>
            <ul className="ps-matches">
              {fixtures.map((f) => (
                <Link key={f.id} href={`/match/${f.id}`} className="ps-match">
                  <span className="ps-match-date">{f.date ? formatDateTimeBE(f.date) : 'Datum n.t.b.'}</span>
                  <span className="ps-match-opp">
                    {f.thuis ? 'vs' : '@'} {f.opponent}
                    {f.reeks && f.reeks !== team.reeks ? <i className="ps-match-reeks"> · {reeksNaam(f.reeks)}</i> : null}
                  </span>
                  {f.status === 'live' ? (
                    <span className="ps-match-live">LIVE</span>
                  ) : f.status === 'finished' && f.score ? (
                    <span className="ps-match-score">{f.score.home}–{f.score.away}</span>
                  ) : (
                    <span className="ps-match-vs">nog te spelen</span>
                  )}
                </Link>
              ))}
            </ul>
          </section>
        )}

        {/* Vóór de eerste gespeelde wedstrijd is er niets af te leiden: dan een korte zin i.p.v.
            een rij nullen, die eruitziet als een fout in plaats van als een leeg seizoen. */}
        {!report || report.matchesAnalyzed === 0 ? (
          <p className="an-empty">
            Nog geen wedstrijdstatistieken voor deze ploeg — ze verschijnen zodra er een wedstrijd
            gespeeld en aangetekend is.
          </p>
        ) : (
          <>
            <section className="ps-kpis">
              <Kpi label="Wedstrijden" value={report.matchesAnalyzed} />
              <Kpi label="Doelpunten" value={report.totals.goals} />
              <Kpi label="Punten" value={report.totals.points} />
              <Kpi label="Conversie" value={`${Math.round(report.totals.conversion * 100)}%`} />
              <Kpi label="Gem. afstand" value={`${report.totals.avgDistance.toFixed(1)} m`} />
              <Kpi label="Vangsten" value={report.totals.catches} />
            </section>

            <section className="an-card">
              <TeamProfile profile={report.profile} />
            </section>

            {report.form && report.form.length > 1 ? (
              <section className="an-card">
                <TeamForm
                  form={report.form.map((f) => ({ date: f.date, points: f.points, conversion: f.conversion }))}
                  label="Vorm"
                  hint="punten & conversie per wedstrijd"
                />
              </section>
            ) : null}

            {report.players.length > 0 ? (
              <section className="an-card">
                <h2 className="an-h2">Spelers</h2>
                <div className="ps-players">
                  {report.players.map((p) => (
                    <Link key={p.playerId} href={`/spelers/${p.playerId}`} className="ps-prow">
                      <span className="ps-prow-num">{p.shirtNumber}</span>
                      <span className="ps-prow-name">{p.name}</span>
                      <span className="ps-prow-stat">
                        <b>{p.goals}</b> goals
                      </span>
                      <span className="ps-prow-stat">
                        <b>{p.points}</b> ptn
                      </span>
                      <span className="ps-prow-stat">{Math.round(p.conversion * 100)}%</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {trend.length > 1 ? (
              <section className="an-card">
                <h2 className="an-h2">Over de seizoenen</h2>
                <div className="ps-trend">
                  {trend.map((s) => (
                    <div className="ps-kpi" key={s.season}>
                      <span className="ps-kpi-val">{s.pointsPerMatch.toFixed(1)}</span>
                      <span className="ps-kpi-lbl">{s.season} · ptn/match</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  )
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ps-kpi">
      <span className="ps-kpi-val">{value}</span>
      <span className="ps-kpi-lbl">{label}</span>
    </div>
  )
}
