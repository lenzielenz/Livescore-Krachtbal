import { headers } from 'next/headers'
import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, scoreMatchPredictions, type PredEntry } from '@/lib/prediction-score'
import { reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { PredictForm } from './PredictForm'
import { ScopePicker } from './ScopePicker'
import './voorspel.css'

export const dynamic = 'force-dynamic'

const nameOf = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
const first = (n: string) => n.split(/\s+/)[0]

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Voorspelcompetitie</span></h1>
        {children}
      </div>
    </>
  )
}

export default async function VoorspelPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: scopeParam } = await searchParams
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  if (!user) {
    return <Shell><p className="empty">Log in om mee te voorspellen. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p></Shell>
  }
  const rawClub = userClubId(user)
  const clubId = rawClub != null && Number.isFinite(Number(rawClub)) ? Number(rawClub) : null
  if (clubId == null) {
    return <Shell><p className="empty">Je account is nog niet aan een club gekoppeld — vraag de beheerder om je te koppelen.</p></Shell>
  }
  const myUserId = Number((user as { id: number }).id)

  const teamsRes = await payload.find({ collection: 'teams', where: { and: [{ club: { equals: clubId } }, competitionWhere()] }, depth: 0, limit: 200 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const clubTeams = teamsRes.docs.map((t) => ({ id: Number(t.id), name: String((t as { name?: unknown }).name ?? '—'), reeks: String((t as { reeks?: unknown }).reeks ?? '') }))
  const teamIds = clubTeams.map((t) => t.id)
  if (teamIds.length === 0) {
    return <Shell><p className="empty">Nog geen ploegen voor je club.</p></Shell>
  }

  // Keuze waarover je voorspelt: hele club, één ploeg, of een hele reeks (waar de club in speelt).
  const reeksen = [...new Set(clubTeams.map((t) => t.reeks).filter(Boolean))]
  const scopeOptions = [
    { value: 'club', label: '🏠 Hele club' },
    ...clubTeams.map((t) => ({ value: `team:${t.id}`, label: `👥 ${t.name}${t.reeks ? ` · ${reeksNaam(t.reeks)}` : ''}` })),
    ...reeksen.map((r) => ({ value: `reeks:${r}`, label: `📋 Hele reeks · ${reeksNaam(r)}` })),
  ]
  const scope = scopeParam && scopeOptions.some((o) => o.value === scopeParam) ? scopeParam : 'club'

  // Where-fragment voor de gekozen scope.
  let scopeWhere: Where
  if (scope.startsWith('team:')) {
    const tid = Number(scope.slice(5))
    scopeWhere = { or: [{ homeTeam: { equals: tid } }, { awayTeam: { equals: tid } }] }
  } else if (scope.startsWith('reeks:')) {
    scopeWhere = { reeks: { equals: scope.slice(6) } }
  } else {
    scopeWhere = { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }
  }

  const seizoen = seasonFromDate(new Date())
  const matchesRes = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { status: { in: ['scheduled', 'finished'] } },
        { seizoen: { equals: seizoen } },
        scopeWhere,
        competitionWhere(),
      ],
    },
    sort: 'date',
    depth: 2,
    limit: 500,
  }).catch(() => ({ docs: [] as Record<string, unknown>[] }))

  type M = { id: number; reeks: string; date: string; status: string; home: string; away: string; preds: PredEntry[] }
  const all: M[] = matchesRes.docs
    .filter((m) => !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly)
    .map((m) => ({
      id: m.id as number,
      reeks: reeksNaam((m as { reeks?: string }).reeks ?? ''),
      date: m.date as string,
      status: String((m as { status?: string }).status ?? 'scheduled'),
      home: nameOf((m as { homeTeam?: unknown }).homeTeam),
      away: nameOf((m as { awayTeam?: unknown }).awayTeam),
      preds: (Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) ? (m as { scorePredictions: PredEntry[] }).scorePredictions : []).filter((p) => p && p.clubId === clubId),
    }))

  const upcoming = all.filter((m) => m.status === 'scheduled')
  const finishedWithPreds = all.filter((m) => m.status === 'finished' && m.preds.length > 0)

  // Eindstanden van de afgehandelde wedstrijden (event-sourced → buildMatchState).
  const finals = await Promise.all(
    finishedWithPreds.map(async (m) => {
      const st = await buildMatchState(payload, m.id).catch(() => null)
      return st ? { ...m, actual: { home: st.score.home, away: st.score.away } } : null
    }),
  )
  const scored = finals.filter((x): x is M & { actual: { home: number; away: number } } => x != null)

  const leaderboard = buildPredictionLeaderboard(scored.map((m) => ({ actual: m.actual, preds: m.preds })), clubId)
  const myEntryOf = (m: M) => m.preds.find((p) => Number(p.userId) === myUserId) ?? null

  const dt = (d: string) => new Date(d).toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <Shell>
      <p className="vs-intro">
        Voorspel de <strong>exacte eindstand</strong> van wedstrijden en bouw met je clubgenoten een klassement op
        over het seizoen ({seizoen}). Kies waarover je speelt: de hele club, één ploeg, of een volledige reeks.
      </p>
      <ScopePicker scope={scope} options={scopeOptions} />
      <details className="vs-rules">
        <summary>Hoe verdien je punten?</summary>
        <ul>
          <li><strong>Exacte uitslag</strong>: 10 punten.</li>
          <li><strong>Juiste winnaar + juist doelsaldo</strong>: 6 punten.</li>
          <li><strong>Juiste winnaar</strong>: 4 punten.</li>
          <li><strong>Nabijheid</strong>: tot 4 extra (hoe kleiner je afwijking, hoe meer).</li>
          <li><strong>Dichtst bij</strong> van de club: +3 bonus per wedstrijd.</li>
        </ul>
      </details>

      {/* Klassement */}
      <h2 className="vs-h2">🏆 Klassement</h2>
      {leaderboard.length === 0 ? (
        <p className="empty">Nog geen punten — voorspel de komende wedstrijden en kom later terug.</p>
      ) : (
        <div className="vs-board">
          {leaderboard.map((r, i) => (
            <div key={r.userId} className={`vs-row${r.userId === myUserId ? ' me' : ''}`}>
              <span className="vs-rank">{i + 1}</span>
              <span className="vs-who">{r.name}{r.userId === myUserId ? ' (jij)' : ''}</span>
              <span className="vs-stat" title="Exacte uitslagen">🎯 {r.exact}</span>
              <span className="vs-stat" title="Wedstrijden voorspeld">{r.predictions}×</span>
              <span className="vs-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Te voorspellen */}
      <h2 className="vs-h2">🔮 Te voorspellen</h2>
      {upcoming.length === 0 ? (
        <p className="empty">Geen geplande wedstrijden om te voorspellen.</p>
      ) : (
        <div className="vs-list">
          {upcoming.map((m) => {
            const mine = myEntryOf(m)
            return (
              <div key={m.id} className="vs-match">
                <div className="vs-match-head">
                  <span className="vs-match-reeks">{m.reeks}</span>
                  <span className="vs-match-date">{dt(m.date)}</span>
                  <span className="vs-match-count">{m.preds.length} {m.preds.length === 1 ? 'voorspelling' : 'voorspellingen'}</span>
                </div>
                <div className="vs-match-teams">{m.home} <span className="vs-vs">–</span> {m.away}</div>
                <PredictForm matchId={m.id} homeName={m.home} awayName={m.away} initialHome={mine?.home ?? null} initialAway={mine?.away ?? null} />
              </div>
            )
          })}
        </div>
      )}

      {/* Uitslagen */}
      {scored.length > 0 && (
        <>
          <h2 className="vs-h2">✅ Afgehandeld</h2>
          <div className="vs-list">
            {scored.slice().reverse().map((m) => {
              const ranked = scoreMatchPredictions(m.actual, m.preds).sort((a, b) => b.points - a.points)
              const top = ranked[0]
              const mine = ranked.find((p) => Number(p.userId) === myUserId)
              return (
                <div key={m.id} className="vs-match done">
                  <div className="vs-match-head">
                    <span className="vs-match-reeks">{m.reeks}</span>
                    <span className="vs-match-date">{dt(m.date)}</span>
                  </div>
                  <div className="vs-match-teams">{m.home} <strong>{m.actual.home}–{m.actual.away}</strong> {m.away}</div>
                  <div className="vs-result">
                    {top && <span className="vs-closest">🥇 Dichtst: {first(top.name)} (+{top.points})</span>}
                    {mine && <span className="vs-mine">Jij: {mine.home}–{mine.away} · <strong>+{mine.points}</strong></span>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Shell>
  )
}
