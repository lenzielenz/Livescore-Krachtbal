'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { type LogoFit } from '@/lib/logo-fit'

export type DayMatch = {
  id: number
  reeks: string
  time: string
  status: string
  home: { name: string; logoUrl: string | null; logoFit?: LogoFit | null }
  away: { name: string; logoUrl: string | null; logoFit?: LogoFit | null }
  score: { home: number; away: number }
}

const FAV_KEY = 'krachtbal-favorieten'

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function LiveBoard({ date, today, matches }: { date: string; today: string; matches: DayMatch[] }) {
  const router = useRouter()
  const [favs, setFavs] = useState<Set<number>>(new Set())
  const [reeksFilter, setReeksFilter] = useState<string | null>(null)
  const [onlyFavs, setOnlyFavs] = useState(false)

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

  // Reeksen aanwezig op deze dag (voor de filterlijst links).
  const reeksen = useMemo(() => [...new Set(matches.map((m) => m.reeks))].sort(), [matches])

  const visible = matches.filter(
    (m) => (!reeksFilter || m.reeks === reeksFilter) && (!onlyFavs || favs.has(m.id)),
  )
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
          Alle reeksen
        </button>
        {reeksen.map((r) => (
          <button type="button" key={r} className={`lb-reeks ${reeksFilter === r ? 'on' : ''}`} onClick={() => setReeksFilter(r)}>
            {r}
          </button>
        ))}
        <button type="button" className={`lb-reeks fav ${onlyFavs ? 'on' : ''}`} onClick={() => setOnlyFavs((v) => !v)}>
          ★ Favorieten {favs.size > 0 && `(${favs.size})`}
        </button>
      </aside>

      <main className="lb-main">
        <div className="lb-datenav">
          <Link href={`/live?date=${shiftDate(date, -1)}`} className="lb-datebtn">‹</Link>
          <div className="lb-date">
            <span className="lb-datelabel">{date === today ? 'Vandaag' : dateLabel}</span>
            <input
              type="date"
              className="lb-dateinput"
              value={date}
              onChange={(e) => e.target.value && router.push(`/live?date=${e.target.value}`)}
              aria-label="Kies datum"
            />
          </div>
          <Link href={`/live?date=${shiftDate(date, 1)}`} className="lb-datebtn">›</Link>
        </div>

        {groups.length === 0 ? (
          <p className="lb-empty">Geen wedstrijden{onlyFavs ? ' bij je favorieten' : ''} op deze dag.</p>
        ) : (
          groups.map(([reeks, list]) => (
            <section key={reeks} className="lb-group">
              <div className="lb-group-head">{reeks}</div>
              {list.map((m) => {
                const played = m.status !== 'scheduled'
                return (
                  <div key={m.id} className={`lb-row ${m.status === 'live' ? 'live' : ''}`}>
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
                      <span className="lb-status">{m.status === 'live' ? 'LIVE' : played ? m.time : m.time}</span>
                      <span className="lb-team">
                        <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size="xs" />
                        <span className="lb-name">{m.home.name}</span>
                      </span>
                      <span className="lb-score">{played ? `${m.score.home} – ${m.score.away}` : 'vs'}</span>
                      <span className="lb-team">
                        <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size="xs" />
                        <span className="lb-name">{m.away.name}</span>
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
