import { headers } from 'next/headers'
import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPredictionLeaderboard, scoreMatchPredictions, type PredEntry } from '@/lib/prediction-score'
import { loadAllPools } from '@/lib/pronostiek-pools'
import { reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { PredictForm } from './PredictForm'
import { InviteCopy, PoolCreate, PoolJoin, PoolLeave } from './PoolManager'
import { ScopePicker } from './ScopePicker'
import './voorspel.css'

export const dynamic = 'force-dynamic'

const nameOf = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
const idOf = (v: unknown): number | null => (v && typeof v === 'object' ? (((v as { id?: number }).id) ?? null) : typeof v === 'number' ? v : null)
const first = (n: string) => n.split(/\s+/)[0]

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Pronostiek</span></h1>
        {children}
      </div>
    </>
  )
}

type MatchRow = { id: number; reeks: string; reeksCode: string; date: string; status: string; homeId: number | null; awayId: number | null; home: string; away: string; preds: PredEntry[] }

export default async function VoorspelPage({ searchParams }: { searchParams: Promise<{ scope?: string; pool?: string; join?: string }> }) {
  const { scope: scopeParam, pool: poolParam, join: joinParam } = await searchParams
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
  const teamIdSet = new Set(teamIds)
  const reeksen = [...new Set(clubTeams.map((t) => t.reeks).filter(Boolean))]
  const myTeamName = (id: number) => clubTeams.find((t) => t.id === id)?.name ?? null

  const scopeOptions = [
    { value: 'club', label: '🏠 Hele club' },
    ...clubTeams.map((t) => ({ value: `team:${t.id}`, label: `👥 ${t.name}${t.reeks ? ` · ${reeksNaam(t.reeks)}` : ''}` })),
    ...reeksen.map((r) => ({ value: `reeks:${r}`, label: `📋 Hele reeks · ${reeksNaam(r)}` })),
  ]

  // Pools over alle clubs heen (een uitgenodigd lid kan van een andere ploeg/club zijn).
  const allPools = await loadAllPools(payload)
  const myHosted = allPools.filter((h) => h.pool.members.includes(myUserId))
  const activeHosted = poolParam ? myHosted.find((h) => h.pool.id === poolParam) ?? null : null
  const activePool = activeHosted?.pool ?? null

  const seizoen = seasonFromDate(new Date())
  const scope = activePool ? activePool.scope : scopeParam && scopeOptions.some((o) => o.value === scopeParam) ? scopeParam : 'club'

  // Matchquery: voor een pool exact op z'n scope (kan een andere club zijn); anders alle reeksen
  // van mijn club (de scope-balk filtert dan verder).
  let matchWhere: Where
  let usePostFilter = false
  if (activePool) {
    if (scope.startsWith('team:')) {
      const tid = Number(scope.slice(5))
      matchWhere = { or: [{ homeTeam: { equals: tid } }, { awayTeam: { equals: tid } }] }
    } else if (scope.startsWith('reeks:')) {
      matchWhere = { reeks: { equals: scope.slice(6) } }
    } else {
      const htRes = await payload.find({ collection: 'teams', where: { club: { equals: activeHosted!.hostClubId } }, depth: 0, limit: 200 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
      const htIds = htRes.docs.map((t) => Number(t.id))
      matchWhere = htIds.length ? { or: [{ homeTeam: { in: htIds } }, { awayTeam: { in: htIds } }] } : { id: { equals: -1 } }
    }
  } else if (reeksen.length === 0) {
    return <Shell><p className="empty">Nog geen ploegen voor je club.</p></Shell>
  } else {
    matchWhere = { reeks: { in: reeksen } }
    usePostFilter = true
  }

  const matchesRes = await payload.find({
    collection: 'matches',
    where: { and: [{ status: { in: ['scheduled', 'finished'] } }, { seizoen: { equals: seizoen } }, matchWhere, competitionWhere()] },
    sort: 'date',
    depth: 2,
    limit: 1000,
  }).catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const allMatches: MatchRow[] = matchesRes.docs
    .filter((m) => !(m as { isDemo?: boolean }).isDemo && !(m as { analyseOnly?: boolean }).analyseOnly)
    .map((m) => ({
      id: m.id as number,
      reeks: reeksNaam((m as { reeks?: string }).reeks ?? ''),
      reeksCode: String((m as { reeks?: string }).reeks ?? ''),
      date: m.date as string,
      status: String((m as { status?: string }).status ?? 'scheduled'),
      homeId: idOf((m as { homeTeam?: unknown }).homeTeam),
      awayId: idOf((m as { awayTeam?: unknown }).awayTeam),
      home: nameOf((m as { homeTeam?: unknown }).homeTeam),
      away: nameOf((m as { awayTeam?: unknown }).awayTeam),
      preds: Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) ? (m as { scorePredictions: PredEntry[] }).scorePredictions : [],
    }))

  // Clubweergave: de superset-query nog filteren op de gekozen scope-balk.
  const inScope = (m: MatchRow): boolean => {
    if (!usePostFilter) return true
    if (scope.startsWith('team:')) { const tid = Number(scope.slice(5)); return m.homeId === tid || m.awayId === tid }
    if (scope.startsWith('reeks:')) return m.reeksCode === scope.slice(6)
    return (m.homeId != null && teamIdSet.has(m.homeId)) || (m.awayId != null && teamIdSet.has(m.awayId))
  }
  const scopedMatches = allMatches.filter(inScope)

  const memberSet = activePool ? new Set(activePool.members) : null
  const keep = (p: PredEntry) => (memberSet ? memberSet.has(Number(p.userId)) : p.clubId === clubId)
  const myEntryOf = (m: MatchRow) => m.preds.find((p) => Number(p.userId) === myUserId) ?? null

  // Eindstanden van afgehandelde wedstrijden met (relevante) voorspellingen.
  const finished = scopedMatches.filter((m) => m.status === 'finished' && m.preds.some(keep))
  const finals = new Map<number, { home: number; away: number }>()
  await Promise.all(finished.map(async (m) => {
    const st = await buildMatchState(payload, m.id).catch(() => null)
    if (st) finals.set(m.id, { home: st.score.home, away: st.score.away })
  }))

  const leaderboard = buildPredictionLeaderboard(
    finished.filter((m) => finals.has(m.id)).map((m) => ({ actual: finals.get(m.id)!, preds: m.preds.filter(keep) })),
  )
  const upcoming = scopedMatches.filter((m) => m.status === 'scheduled' && !myEntryOf(m))
  const lockedCount = scopedMatches.filter((m) => m.status === 'scheduled' && myEntryOf(m)).length
  const scored = finished.filter((m) => finals.has(m.id)).map((m) => ({ ...m, actual: finals.get(m.id)!, groupPreds: m.preds.filter(keep) }))

  const dt = (d: string) => new Date(d).toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const scopeLabel = (s: string): string => {
    if (s.startsWith('team:')) {
      const tid = Number(s.slice(5))
      const m = allMatches.find((x) => x.homeId === tid || x.awayId === tid)
      return myTeamName(tid) ?? (m ? (m.homeId === tid ? m.home : m.away) : `Ploeg ${tid}`)
    }
    if (s.startsWith('reeks:')) return `Reeks ${reeksNaam(s.slice(6))}`
    return 'Hele club'
  }

  return (
    <Shell>
      {activePool ? (
        <div className="vs-poolhead">
          <Link href="/club/voorspel" className="vs-back">← Clubklassement</Link>
          <h2 className="vs-poolname-h">🏆 {activePool.name}</h2>
          <p className="vs-poolmeta">
            {activePool.members.length} {activePool.members.length === 1 ? 'speler' : 'spelers'} · {scopeLabel(scope)} · code <strong className="vs-code">{activePool.code}</strong>
          </p>
          <div className="vs-poolhead-actions">
            <InviteCopy code={activePool.code} />
            <PoolLeave poolId={activePool.id} />
          </div>
        </div>
      ) : (
        <>
          <p className="vs-intro">Voorspel de exacte eindstand en bouw een klassement op met je clubgenoten ({seizoen}).</p>
          <div className="vs-toprow">
            <ScopePicker scope={scope} options={scopeOptions} />
            {myHosted.length > 0 && (
              <div className="vs-poolchips">
                {myHosted.map(({ pool }) => (
                  <Link key={pool.id} href={`/club/voorspel?pool=${pool.id}`} className="vs-poolchip">🏆 {pool.name}</Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

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

      <h2 className="vs-h2">🔮 Te voorspellen</h2>
      {lockedCount > 0 && (
        <p className="vs-locked">🔒 {lockedCount} {lockedCount === 1 ? 'voorspelling staat' : 'voorspellingen staan'} vast — je kan ze niet meer wijzigen.</p>
      )}
      {upcoming.length === 0 ? (
        <p className="empty">{lockedCount > 0 ? 'Alles voorspeld — succes! 🤞' : 'Geen geplande wedstrijden om te voorspellen.'}</p>
      ) : (
        <div className="vs-list">
          {upcoming.map((m) => (
            <div key={m.id} className="vs-match">
              <div className="vs-match-head">
                <span className="vs-match-reeks">{m.reeks}</span>
                <span className="vs-match-date">{dt(m.date)}</span>
              </div>
              <div className="vs-match-teams">{m.home} <span className="vs-vs">–</span> {m.away}</div>
              <PredictForm matchId={m.id} homeName={m.home} awayName={m.away} initialHome={null} initialAway={null} />
            </div>
          ))}
        </div>
      )}

      {scored.length > 0 && (
        <>
          <h2 className="vs-h2">✅ Afgehandeld</h2>
          <div className="vs-list">
            {scored.slice().reverse().map((m) => {
              const ranked = scoreMatchPredictions(m.actual, m.groupPreds).sort((a, b) => b.points - a.points)
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

      {!activePool && (
        <section className="vs-pools">
          <h2 className="vs-h2">👥 Privé-pools <span className="vs-h2-sub">eigen pronostiekje met aparte stand</span></h2>
          <div className="vs-poolcompact">
            <details className="vs-pooldd">
              <summary>➕ Nieuwe pool starten</summary>
              <PoolCreate scopeOptions={scopeOptions} />
            </details>
            <details className="vs-pooldd" open={Boolean(joinParam)}>
              <summary>🔗 Joinen met code{joinParam ? ' — bevestig je uitnodiging' : ''}</summary>
              <PoolJoin initialCode={joinParam ?? ''} />
            </details>
          </div>
        </section>
      )}
    </Shell>
  )
}
