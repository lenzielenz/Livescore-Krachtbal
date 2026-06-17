import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId, userPlayerId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateTimeBE } from '@/lib/datetime'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import './hub.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Mijn Krachtbal — Krachtbal Live' }

const teamName = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
const scoreOf = async (payload: Awaited<ReturnType<typeof getPayloadClient>>, id: number) => {
  try {
    const st = await buildMatchState(payload, id)
    return { home: st.score.home, away: st.score.away }
  } catch {
    return null
  }
}

export default async function HubPage() {
  const me = await getAuthUser()
  const payload = await getPayloadClient()
  const clubId = userClubId(me)
  // Account gekoppeld aan een speler-dossier? Dan tonen we de eigen ontwikkeling.
  const myPlayerId = userPlayerId(me)

  // Live nu (alle wedstrijden).
  const liveRes = await payload
    .find({ collection: 'matches', where: { and: [{ status: { equals: 'live' } }, competitionWhere()] }, sort: 'date', depth: 1, limit: 6 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const liveScores = await Promise.all(liveRes.docs.map((m) => scoreOf(payload, (m as { id: number }).id)))

  // Mijn club: naam + volgende wedstrijd + laatste uitslag.
  let club: { id: number; name: string } | null = null
  let nextMatch: { id: number; date?: string; home: string; away: string } | null = null
  let lastMatch: { id: number; home: string; away: string; score: { home: number; away: number } | null } | null = null
  if (clubId != null) {
    const c = await payload.findByID({ collection: 'clubs', id: Number(clubId), depth: 0 }).catch(() => null)
    if (c) club = { id: c.id as number, name: String(c.name) }
    const teamsRes = await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 60 }).catch(() => ({ docs: [] as { id: number }[] }))
    const teamIds = teamsRes.docs.map((t) => t.id)
    if (teamIds.length) {
      const ms = await payload
        .find({ collection: 'matches', where: { and: [{ or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }, competitionWhere()] }, sort: 'date', depth: 1, limit: 300 })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
      const up = ms.docs.find((m) => (m as { status?: string }).status !== 'finished')
      if (up) nextMatch = { id: (up as { id: number }).id, date: (up as { date?: string }).date, home: teamName((up as { homeTeam?: unknown }).homeTeam), away: teamName((up as { awayTeam?: unknown }).awayTeam) }
      const fin = ms.docs.filter((m) => (m as { status?: string }).status === 'finished').sort((a, b) => new Date(String((b as { date?: string }).date ?? 0)).getTime() - new Date(String((a as { date?: string }).date ?? 0)).getTime())[0]
      if (fin) lastMatch = { id: (fin as { id: number }).id, home: teamName((fin as { homeTeam?: unknown }).homeTeam), away: teamName((fin as { awayTeam?: unknown }).awayTeam), score: await scoreOf(payload, (fin as { id: number }).id) }
    }
  }

  // Laatste nieuws.
  const news = await payload
    .find({ collection: 'news', where: { published: { equals: true } }, sort: '-publishedAt', depth: 0, limit: 3 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  return (
    <>
      <SiteHeader />
      <div className="site hub">
        <h1 className="page-title">🏠 <span className="brand">Mijn Krachtbal</span></h1>

        {/* Live nu */}
        <section className="hub-sec">
          <h2 className="hub-h2"><span className="hub-live-dot" aria-hidden /> Live nu</h2>
          {liveRes.docs.length === 0 ? (
            <p className="hub-empty">Geen wedstrijd live op dit moment. <Link href="/">Bekijk alle wedstrijden →</Link></p>
          ) : (
            <div className="hub-live-grid">
              {liveRes.docs.map((m, i) => {
                const id = (m as { id: number }).id
                const sc = liveScores[i]
                return (
                  <Link key={id} href={`/match/${id}`} className="hub-live-card">
                    <span className="hub-live-badge">LIVE</span>
                    <span className="hub-live-teams">{teamName((m as { homeTeam?: unknown }).homeTeam)} <i>—</i> {teamName((m as { awayTeam?: unknown }).awayTeam)}</span>
                    {sc && <span className="hub-live-score">{sc.home}–{sc.away}</span>}
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Mijn club */}
        {club ? (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn club</h2>
            <div className="hub-club">
              <Link href={`/clubs/${club.id}`} className="hub-club-name">{club.name} →</Link>
              <div className="hub-club-rows">
                {nextMatch && (
                  <Link href={`/match/${nextMatch.id}`} className="hub-club-row">
                    <span className="hub-club-lbl">Volgende</span>
                    <span className="hub-club-teams">{nextMatch.home} — {nextMatch.away}</span>
                    <span className="hub-club-date">{nextMatch.date ? formatDateTimeBE(String(nextMatch.date)) : ''}</span>
                  </Link>
                )}
                {lastMatch && (
                  <Link href={`/match/${lastMatch.id}`} className="hub-club-row">
                    <span className="hub-club-lbl">Laatste</span>
                    <span className="hub-club-teams">{lastMatch.home} — {lastMatch.away}</span>
                    {lastMatch.score && <span className="hub-club-score">{lastMatch.score.home}–{lastMatch.score.away}</span>}
                  </Link>
                )}
                {!nextMatch && !lastMatch && <p className="hub-empty">Nog geen wedstrijden voor je club.</p>}
              </div>
            </div>
          </section>
        ) : (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn club</h2>
            <p className="hub-empty">
              {me ? <>Stel je club in op <Link href="/profiel">je profiel</Link> om hier je ploeg te volgen.</> : <><Link href="/inloggen">Log in</Link> en kies je club om alles op maat te zien.</>}
            </p>
          </section>
        )}

        {/* Mijn ontwikkeling — enkel als het account aan een speler gekoppeld is. */}
        {myPlayerId != null && (
          <section className="hub-sec">
            <h2 className="hub-h2">Mijn ontwikkeling</h2>
            <div className="hub-tiles">
              <Link href={`/spelers/${myPlayerId}`} className="hub-tile">📈<span>Skill &amp; Fame</span></Link>
              <Link href="/beheer/training/progressie" className="hub-tile">🏋️<span>Mijn training</span></Link>
              <Link href="/profiel/scorecard" className="hub-tile">🃏<span>Scorecard</span></Link>
            </div>
          </section>
        )}

        {/* Snelkoppelingen */}
        <section className="hub-sec">
          <h2 className="hub-h2">Snel naar</h2>
          <div className="hub-tiles">
            <Link href="/rangschikking" className="hub-tile">📊<span>Stand</span></Link>
            <Link href="/club/voorspel" className="hub-tile">🔮<span>Pronostiek</span></Link>
            <Link href="/profiel" className="hub-tile">👤<span>Mijn profiel</span></Link>
            <Link href="/profiel/paspoort" className="hub-tile">🎟️<span>Paspoort</span></Link>
            <Link href="/profiel/badges" className="hub-tile">🏅<span>Badges</span></Link>
            <Link href="/fans" className="hub-tile">📣<span>Supporters</span></Link>
            <Link href="/wrapped" className="hub-tile">🎁<span>Wrapped</span></Link>
            <Link href="/nieuws" className="hub-tile">📰<span>Nieuws</span></Link>
            <Link href="/superster" className="hub-tile">⭐<span>Superster</span></Link>
            <Link href="/ontwikkeling" className="hub-tile">📈<span>Ontwikkeling</span></Link>
            <Link href="/tornooi" className="hub-tile">🏆<span>Beker</span></Link>
          </div>
        </section>

        {/* Laatste nieuws */}
        {news.docs.length > 0 && (
          <section className="hub-sec">
            <h2 className="hub-h2">Laatste nieuws</h2>
            <div className="hub-news">
              {news.docs.map((n) => (
                <Link key={(n as { id: number }).id} href={`/nieuws/${(n as { id: number }).id}`} className="hub-news-item">
                  <span className="hub-news-title">{String((n as { title?: unknown }).title ?? '')}</span>
                  {Boolean((n as { excerpt?: unknown }).excerpt) && <span className="hub-news-ex">{String((n as { excerpt?: unknown }).excerpt)}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
