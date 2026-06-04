'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { type ClubColors } from '@/lib/club-colors'
import { type LogoFit } from '@/lib/logo-fit'

export type DayMatch = {
  id: number
  reeks: string
  time: string
  status: string
  home: { name: string; logoUrl: string | null; logoFit?: LogoFit | null; colors?: ClubColors | null }
  away: { name: string; logoUrl: string | null; logoFit?: LogoFit | null; colors?: ClubColors | null }
  score: { home: number; away: number }
  crosses?: { home: number; away: number }
  timeouts?: { home: number; away: number }
  refereeStops?: number
}

const FAV_KEY = 'krachtbal-favorieten'

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function LiveBoard({ date, today, matches }: { date: string; today: string; matches: DayMatch[] }) {
  const router = useRouter()
  const [favs, setFavs] = useState<Set<number>>(new Set())
  const [reeksFilter, setReeksFilter] = useState<string | null>(null)
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [onlyLive, setOnlyLive] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY)
      if (raw) setFavs(new Set(JSON.parse(raw) as number[]))
    } catch {}
  }, [])

  const toggleFav = (id: number) => {
    setFavs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  const liveCount = useMemo(() => matches.filter((m) => m.status === 'live').length, [matches])

  // Zoek op ploegnaam of reeks (accent-ongevoelig).
  const matchesQuery = (m: DayMatch, q: string) => {
    const n = norm(q)
    return norm(m.home.name).includes(n) || norm(m.away.name).includes(n) || norm(m.reeks).includes(n)
  }

  // Basis: alles behalve het reeks-filter toegepast, zodat de reeks-tellingen
  // in de zijbalk tonen hoeveel er ná zoeken/live/favorieten overblijft.
  const base = useMemo(
    () =>
      matches.filter(
        (m) =>
          (!onlyLive || m.status === 'live') &&
          (!onlyFavs || favs.has(m.id)) &&
          (!query.trim() || matchesQuery(m, query)),
      ),
    [matches, onlyLive, onlyFavs, favs, query],
  )

  // Reeksen + tellingen op basis van de actieve filters (slim navigeren).
  const reeksen = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of base) counts.set(m.reeks, (counts.get(m.reeks) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [base])

  const visible = base.filter((m) => !reeksFilter || m.reeks === reeksFilter)

  // Groepeer per reeks.
  const groups = useMemo(() => {
    const map = new Map<string, DayMatch[]>()
    for (const m of visible) {
      const arr = map.get(m.reeks) ?? []
      arr.push(m)
      map.set(m.reeks, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('nl-BE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })

  return (
    <div className="lb">
      <aside className="lb-side">
        <h3>Reeksen</h3>
        <button type="button" className={`lb-reeks ${reeksFilter === null ? 'on' : ''}`} onClick={() => setReeksFilter(null)}>
          <span>Alle reeksen</span>
          <span className="lb-reeks-n">{base.length}</span>
        </button>
        {reeksen.map(([r, n]) => (
          <button type="button" key={r} className={`lb-reeks ${reeksFilter === r ? 'on' : ''}`} onClick={() => setReeksFilter(r)}>
            <span>{r}</span>
            <span className="lb-reeks-n">{n}</span>
          </button>
        ))}
        <button type="button" className={`lb-reeks live ${onlyLive ? 'on' : ''}`} onClick={() => setOnlyLive((v) => !v)} disabled={liveCount === 0}>
          <span><span className="lb-livedot" /> Live</span>
          {liveCount > 0 && <span className="lb-reeks-n">{liveCount}</span>}
        </button>
        <button type="button" className={`lb-reeks fav ${onlyFavs ? 'on' : ''}`} onClick={() => setOnlyFavs((v) => !v)}>
          <span>★ Favorieten</span>
          {favs.size > 0 && <span className="lb-reeks-n">{favs.size}</span>}
        </button>
      </aside>

      <main className="lb-main">
        <div className="lb-datenav">
          <Link href={`/?date=${shiftDate(date, -1)}`} className="lb-datebtn">‹</Link>
          <div className="lb-date">
            <span className="lb-datelabel">{date === today ? 'Vandaag' : dateLabel}</span>
            <input
              type="date"
              className="lb-dateinput"
              value={date}
              onChange={(e) => e.target.value && router.push(`/?date=${e.target.value}`)}
              aria-label="Kies datum"
            />
          </div>
          <Link href={`/?date=${shiftDate(date, 1)}`} className="lb-datebtn">›</Link>
        </div>

        <div className="lb-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek een ploeg of reeks…"
            aria-label="Zoek een ploeg of reeks"
          />
          {query && (
            <button type="button" className="lb-search-clear" onClick={() => setQuery('')} aria-label="Wis zoekopdracht">
              ✕
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <p className="lb-empty">
            Geen wedstrijden{query.trim() ? ` voor “${query.trim()}”` : onlyLive ? ' live' : onlyFavs ? ' bij je favorieten' : ''} op deze dag.
          </p>
        ) : (
          groups.map(([reeks, list]) => (
            <section key={reeks} className="lb-group">
              <div className="lb-group-head">{reeks}<span className="lb-group-n">{list.length}</span></div>
              {list.map((m) => {
                const played = m.status !== 'scheduled'
                const live = m.status === 'live'
                const hasStats = played && (m.crosses || m.timeouts)
                return (
                  <div key={m.id} className={`lb-row ${live ? 'live' : ''}`}>
                    <button
                      type="button"
                      className={`lb-star ${favs.has(m.id) ? 'on' : ''}`}
                      onClick={() => toggleFav(m.id)}
                      aria-label="Favoriet"
                      title="Markeer als favoriet"
                    >
                      {favs.has(m.id) ? '★' : '☆'}
                    </button>
                    <Link href={`/match/${m.id}`} className="lb-match">
                      <span className="lb-status">
                        {live ? <span className="lb-livebadge">LIVE</span> : <span className="lb-time">{m.time}</span>}
                      </span>
                      <span className="lb-team home">
                        <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size="sm" ringColor={m.home.colors?.primary} />
                        <span className="lb-name">{m.home.name}</span>
                      </span>
                      <span className="lb-mid">
                        <span className="lb-score">{played ? `${m.score.home} – ${m.score.away}` : 'vs'}</span>
                        {hasStats && (
                          <span className="lb-stats">
                            <span title="Kruisjes">✖ {m.crosses?.home ?? 0}–{m.crosses?.away ?? 0}</span>
                            <span className="lb-stat-sep">·</span>
                            <span title="Minuten (time-outs)">
                              ⏱ {m.timeouts?.home ?? 0}–{m.timeouts?.away ?? 0}
                              {m.refereeStops ? ` +${m.refereeStops} SR` : ''}
                            </span>
                          </span>
                        )}
                      </span>
                      <span className="lb-team away">
                        <span className="lb-name">{m.away.name}</span>
                        <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size="sm" ringColor={m.away.colors?.primary} />
                      </span>
                    </Link>
                  </div>
                )
              })}
            </section>
          ))
        )}
      </main>
    </div>
  )
}
