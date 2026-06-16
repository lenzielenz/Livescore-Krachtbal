import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { getAuthUser } from '@/lib/auth-user'
import { sanitizeCheckins } from '@/lib/checkins'
import { formatDateTimeBE } from '@/lib/datetime'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { seasonFromDate } from '@/lib/seasons'
import './paspoort.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mijn supporterpaspoort — Krachtbal Live' }

const teamName = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="site">
        <h1 className="page-title">🎟️ <span className="brand">Supporterpaspoort</span></h1>
        {children}
      </div>
    </>
  )
}

export default async function PaspoortPage() {
  const me = await getAuthUser()
  if (!me) {
    return (
      <Shell>
        <section className="wb-card" style={{ maxWidth: 440 }}>
          <p className="wb-sub">Log in en duid op een wedstrijd aan dat je erbij bent — zo bouw je je paspoort op.</p>
          <Link href="/inloggen" className="wb-btn wb-btn-primary">Inloggen →</Link>
        </section>
      </Shell>
    )
  }

  const checkins = sanitizeCheckins((me as { checkins?: unknown }).checkins)
  const payload = await getPayloadClient()
  const ids = checkins.map((c) => c.m)
  const matches = ids.length
    ? (await payload.find({ collection: 'matches', where: { id: { in: ids } }, depth: 1, limit: 200 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))).docs
    : []

  // Scores van bijgewoonde, afgelopen wedstrijden (voor "doelpunten gezien").
  const withScore = await Promise.all(
    matches.map(async (m) => {
      const finished = (m as { status?: string }).status === 'finished'
      let score: { home: number; away: number } | null = null
      if (finished) {
        try {
          const st = await buildMatchState(payload, (m as { id: number }).id)
          score = { home: st.score.home, away: st.score.away }
        } catch {
          /* overslaan */
        }
      }
      return { m, score, finished }
    }),
  )
  withScore.sort((a, b) => new Date(String((b.m as { date?: string }).date ?? 0)).getTime() - new Date(String((a.m as { date?: string }).date ?? 0)).getTime())

  const total = matches.length
  const goalsSeen = withScore.reduce((s, x) => s + (x.score ? x.score.home + x.score.away : 0), 0)
  const thisSeason = seasonFromDate(new Date())
  const seasonCount = matches.filter((m) => {
    const d = (m as { date?: string }).date
    return d ? seasonFromDate(new Date(String(d))) === thisSeason : false
  }).length
  const name = String((me as { name?: string }).name || (me as { email?: string }).email || 'Supporter')

  return (
    <Shell>
      <p className="wb-intro">
        Elke wedstrijd waar je "🙋 Ik ben erbij" aantikt, komt hier terecht. <Link href="/wrapped" style={{ color: 'var(--accent)' }}>🎁 Mijn Wrapped</Link> · <Link href="/profiel" style={{ color: 'var(--accent)' }}>← Naar mijn profiel</Link>
      </p>

      <div className="pp-card">
        <div className="pp-head">
          <span className="pp-badge" aria-hidden>🎟️</span>
          <div>
            <div className="pp-name">{name}</div>
            <div className="pp-sub">Supporterpaspoort · {thisSeason}</div>
          </div>
        </div>
        <div className="pp-stats">
          <div className="pp-stat"><b>{total}</b><span>wedstrijden</span></div>
          <div className="pp-stat"><b>{goalsSeen}</b><span>doelpunten gezien</span></div>
          <div className="pp-stat"><b>{seasonCount}</b><span>dit seizoen</span></div>
        </div>
      </div>

      {total === 0 ? (
        <p className="empty">Nog geen wedstrijden bijgewoond. Tik op een wedstrijd "🙋 Ik ben erbij" aan!</p>
      ) : (
        <ul className="pp-list">
          {withScore.map(({ m, score }) => {
            const id = (m as { id: number }).id
            const date = (m as { date?: string }).date
            return (
              <li key={id}>
                <Link href={`/match/${id}`} className="pp-item">
                  <span className="pp-item-teams">{teamName((m as { homeTeam?: unknown }).homeTeam)} <i>—</i> {teamName((m as { awayTeam?: unknown }).awayTeam)}</span>
                  {score ? <span className="pp-item-score">{score.home}–{score.away}</span> : <span className="pp-item-date">{date ? formatDateTimeBE(String(date)) : ''}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}
