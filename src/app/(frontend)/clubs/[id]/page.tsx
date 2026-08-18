import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { competitionWhere } from '@/lib/analyse-access'
import { formatDateTimeBE } from '@/lib/datetime'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import '../clubs.css'

export const dynamic = 'force-dynamic'

const teamName = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayloadClient()
  const c = await payload.findByID({ collection: 'clubs', id: Number(id), depth: 0 }).catch(() => null)
  return { title: c?.name ? `${String(c.name)} — Krachtbal Live` : 'Club — Krachtbal Live' }
}

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cid = Number(id)
  if (!Number.isFinite(cid)) notFound()

  const payload = await getPayloadClient()
  const club = await payload.findByID({ collection: 'clubs', id: cid, depth: 1 }).catch(() => null)
  if (!club || club.analyseOnly) notFound()

  const teamsRes = await payload
    .find({ collection: 'teams', where: { and: [{ club: { equals: cid } }, competitionWhere()] }, sort: 'name', depth: 0, limit: 60 })
    .catch(() => ({ docs: [] as { id: number; name: string; reeks?: string }[] }))
  const teamIds = teamsRes.docs.map((t) => t.id)

  const matchesRes = teamIds.length
    ? await payload
        .find({
          collection: 'matches',
          where: { and: [{ or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }, competitionWhere()] },
          sort: 'date',
          depth: 1,
          limit: 300,
        })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }

  const all = matchesRes.docs
  const upcoming = all.filter((m) => (m as { status?: string }).status !== 'finished').slice(0, 6)
  const recent = all
    .filter((m) => (m as { status?: string }).status === 'finished')
    .sort((a, b) => new Date(String((b as { date?: string }).date ?? 0)).getTime() - new Date(String((a as { date?: string }).date ?? 0)).getTime())
    .slice(0, 6)
  const recentScores = await Promise.all(
    recent.map(async (m) => {
      try {
        const st = await buildMatchState(payload, (m as { id: number }).id)
        return { home: st.score.home, away: st.score.away }
      } catch {
        return null
      }
    }),
  )

  const news = await payload
    .find({ collection: 'news', where: { and: [{ club: { equals: cid } }, { published: { equals: true } }] }, sort: '-publishedAt', depth: 1, limit: 4 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const primary = (club.colorPrimary as string) || 'var(--accent)'
  const logoUrl = club.logo && typeof club.logo === 'object' ? ((club.logo as { url?: string }).url ?? null) : ((club.logoUrl as string) || null)
  const style = { ['--club' as string]: primary } as React.CSSProperties

  return (
    <>
      <SiteHeader />
      <div className="site cl" style={style}>
        <header className="cl-hero">
          <TeamLogo name={String(club.name)} logoUrl={logoUrl} side="home" size="92px" ringColor={primary} />
          <div className="cl-hero-id">
            <h1 className="cl-name">{String(club.name)}</h1>
            {(club.accommodatie || club.plaats) && (
              <p className="cl-loc">📍 {[String(club.accommodatie ?? '').trim(), String(club.plaats ?? '').trim()].filter(Boolean).join(' · ')}</p>
            )}
            {Boolean(club.website) && (
              <a className="cl-web" href={String(club.website)} target="_blank" rel="noopener noreferrer">🌐 Website</a>
            )}
            {teamIds.length > 0 && (
              <a
                className="cl-web"
                href={`/api/agenda/ics?clubs=${cid}&name=${encodeURIComponent(String(club.name))}`}
                title="Alle wedstrijden van alle ploegen van deze club downloaden (Google/Apple/Outlook)"
              >
                📅 Hele clubagenda
              </a>
            )}
          </div>
        </header>

        {teamsRes.docs.length > 0 && (
          <section className="cl-sec">
            <h2 className="cl-h2">Ploegen</h2>
            <div className="cl-teams">
              {teamsRes.docs.map((t) => (
                <Link key={t.id} href={`/ploegen/${t.id}`} className="cl-team">{t.name}{t.reeks ? <i> · {reeksNaam(t.reeks)}</i> : null}</Link>
              ))}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="cl-sec">
            <h2 className="cl-h2">Volgende wedstrijden</h2>
            <ul className="cl-matches">
              {upcoming.map((m) => {
                const mid = (m as { id: number }).id
                const date = (m as { date?: string }).date
                return (
                  <li key={mid}>
                    <Link href={`/match/${mid}`} className="cl-match">
                      <span className="cl-match-date">{date ? formatDateTimeBE(String(date)) : 'Datum n.t.b.'}</span>
                      <span className="cl-match-teams">{teamName((m as { homeTeam?: unknown }).homeTeam)} <i>—</i> {teamName((m as { awayTeam?: unknown }).awayTeam)}</span>
                      {(m as { status?: string }).status === 'live' && <span className="cl-live">LIVE</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section className="cl-sec">
            <h2 className="cl-h2">Recente uitslagen</h2>
            <ul className="cl-matches">
              {recent.map((m, i) => {
                const mid = (m as { id: number }).id
                const sc = recentScores[i]
                return (
                  <li key={mid}>
                    <Link href={`/match/${mid}`} className="cl-match">
                      <span className="cl-match-teams">{teamName((m as { homeTeam?: unknown }).homeTeam)} <i>—</i> {teamName((m as { awayTeam?: unknown }).awayTeam)}</span>
                      {sc && <span className="cl-score">{sc.home}–{sc.away}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {news.docs.length > 0 && (
          <section className="cl-sec">
            <h2 className="cl-h2">Clubnieuws</h2>
            <div className="cl-news">
              {news.docs.map((n) => (
                <Link key={(n as { id: number }).id} href={`/nieuws/${(n as { id: number }).id}`} className="cl-news-item">
                  {String((n as { title?: unknown }).title ?? '')}
                </Link>
              ))}
            </div>
          </section>
        )}

        {teamsRes.docs.length === 0 && upcoming.length === 0 && recent.length === 0 && (
          <p className="empty">Nog geen ploegen of wedstrijden voor deze club.</p>
        )}
      </div>
    </>
  )
}
