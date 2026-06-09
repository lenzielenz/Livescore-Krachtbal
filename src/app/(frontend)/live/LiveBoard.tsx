'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { type ClubColors } from '@/lib/club-colors'
import { type LogoFit } from '@/lib/logo-fit'
import { RowWeather } from './RowWeather'

type TeamRef = {
  teamId: number
  name: string
  logoUrl: string | null
  logoFit?: LogoFit | null
  colors?: ClubColors | null
  clubId: number | null
  clubName: string | null
}

export type DayMatch = {
  id: number
  reeks: string
  time: string
  /** ISO-datum/uur van de aftrap (voor het weer rond de wedstrijd). */
  kickoff: string
  status: string
  home: TeamRef
  away: TeamRef
  score: { home: number; away: number }
  crosses?: { home: number; away: number }
  timeouts?: { home: number; away: number }
  refereeStops?: number
  /** Locatie van het thuisterrein → weer per wedstrijd. */
  weather?: { plaats: string | null; lat: number | null; lng: number | null } | null
}

const FAV_TEAMS_KEY = 'kb-fav-ploegen'
const FAV_CLUBS_KEY = 'kb-fav-clubs'

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function useFavSet(key: string): [Set<number>, (id: number) => void] {
  const [set, setSet] = useState<Set<number>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) setSet(new Set(JSON.parse(raw) as number[]))
    } catch {}
  }, [key])
  const toggle = (id: number) =>
    setSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(key, JSON.stringify([...next]))
      } catch {}
      return next
    })
  return [set, toggle]
}

export function LiveBoard({
  date,
  today,
  matches,
  myClubId = null,
}: {
  date: string
  today: string
  matches: DayMatch[]
  /** De club van de ingelogde gebruiker (ingesteld in de admin) — voedt de "Mijn club"-filter. */
  myClubId?: number | null
}) {
  const router = useRouter()
  const [favTeams, toggleTeam] = useFavSet(FAV_TEAMS_KEY)
  const [favClubs, toggleClub] = useFavSet(FAV_CLUBS_KEY)
  const [reeksFilter, setReeksFilter] = useState<string | null>(null)
  const [onlyFavTeams, setOnlyFavTeams] = useState(false)
  const [onlyFavClubs, setOnlyFavClubs] = useState(false)
  const [onlyMyClub, setOnlyMyClub] = useState(false)
  const [onlyLive, setOnlyLive] = useState(false)
  const [query, setQuery] = useState('')
  const [openRow, setOpenRow] = useState<number | null>(null)

  const liveCount = useMemo(() => matches.filter((m) => m.status === 'live').length, [matches])

  // Zoek op ploegnaam of reeks (accent-ongevoelig).
  const matchesQuery = (m: DayMatch, q: string) => {
    const n = norm(q)
    return norm(m.home.name).includes(n) || norm(m.away.name).includes(n) || norm(m.reeks).includes(n)
  }

  const teamFav = (m: DayMatch) => favTeams.has(m.home.teamId) || favTeams.has(m.away.teamId)
  const clubFav = (m: DayMatch) =>
    (m.home.clubId != null && favClubs.has(m.home.clubId)) || (m.away.clubId != null && favClubs.has(m.away.clubId))
  // Wedstrijden van de eigen club (uit het login-account): thuis óf uit.
  const myClubMatch = (m: DayMatch) => myClubId != null && (m.home.clubId === myClubId || m.away.clubId === myClubId)
  const myClubCount = useMemo(() => (myClubId == null ? 0 : matches.filter(myClubMatch).length), [matches, myClubId])

  // Basis: alles behalve het reeks-filter toegepast, zodat de reeks-tellingen
  // tonen hoeveel er ná zoeken/live/favorieten overblijft.
  const base = useMemo(
    () =>
      matches.filter((m) => {
        if (onlyLive && m.status !== 'live') return false
        if (query.trim() && !matchesQuery(m, query)) return false
        // "Mijn club" beperkt tot de wedstrijden van de eigen club.
        if (onlyMyClub && !myClubMatch(m)) return false
        // Favorieten-filters combineren met OF: toon wat een favoriete ploeg óf club bevat.
        if (onlyFavTeams || onlyFavClubs) {
          const hit = (onlyFavTeams && teamFav(m)) || (onlyFavClubs && clubFav(m))
          if (!hit) return false
        }
        return true
      }),
    [matches, onlyLive, onlyFavTeams, onlyFavClubs, onlyMyClub, myClubId, favTeams, favClubs, query],
  )

  // Reeksen + tellingen op basis van de actieve filters (slim navigeren).
  const reeksen = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of base) counts.set(m.reeks, (counts.get(m.reeks) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [base])

  const visible = base.filter((m) => !reeksFilter || m.reeks === reeksFilter)

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

  const emptyReason = query.trim()
    ? ` voor “${query.trim()}”`
    : onlyLive
      ? ' live'
      : onlyFavTeams || onlyFavClubs
        ? ' bij je favorieten'
        : ''

  return (
    <div className="lb">
      <aside className="lb-side">
        <h3>Reeksen</h3>
        {/* Eén keuzemenu i.p.v. een wolk knoppen — blijft overzichtelijk bij veel reeksen. */}
        <select
          className="lb-reeks-select"
          value={reeksFilter ?? ''}
          onChange={(e) => setReeksFilter(e.target.value || null)}
          aria-label="Kies een reeks"
        >
          <option value="">Alle reeksen ({base.length})</option>
          {reeksen.map(([r, n]) => (
            <option key={r} value={r}>{r} ({n})</option>
          ))}
        </select>
        {/* Snelfilters apart — Live + favorieten. */}
        <div className="lb-quick">
          <button type="button" className={`lb-reeks live ${onlyLive ? 'on' : ''}`} onClick={() => setOnlyLive((v) => !v)} disabled={liveCount === 0}>
            <span><span className="lb-livedot" /> Live</span>
            {liveCount > 0 && <span className="lb-reeks-n">{liveCount}</span>}
          </button>
          {myClubId != null && (
            <button type="button" className={`lb-reeks fav ${onlyMyClub ? 'on' : ''}`} onClick={() => setOnlyMyClub((v) => !v)}>
              <span>🏠 Mijn club</span>
              {myClubCount > 0 && <span className="lb-reeks-n">{myClubCount}</span>}
            </button>
          )}
          <button type="button" className={`lb-reeks fav ${onlyFavTeams ? 'on' : ''}`} onClick={() => setOnlyFavTeams((v) => !v)}>
            <span>★ Ploegen</span>
            {favTeams.size > 0 && <span className="lb-reeks-n">{favTeams.size}</span>}
          </button>
          <button type="button" className={`lb-reeks fav ${onlyFavClubs ? 'on' : ''}`} onClick={() => setOnlyFavClubs((v) => !v)}>
            <span>★ Clubs</span>
            {favClubs.size > 0 && <span className="lb-reeks-n">{favClubs.size}</span>}
          </button>
        </div>
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
          <p className="lb-empty">Geen wedstrijden{emptyReason} op deze dag.</p>
        ) : (
          groups.map(([reeks, list]) => (
            <section key={reeks} className="lb-group">
              <div className="lb-group-head">{reeks}<span className="lb-group-n">{list.length}</span></div>
              {list.map((m) => {
                const played = m.status !== 'scheduled'
                const live = m.status === 'live'
                const hasStats = played && (m.crosses || m.timeouts)
                const rowFav = teamFav(m) || clubFav(m)
                const open = openRow === m.id
                return (
                  <div key={m.id} className="lb-rowwrap">
                    <div className={`lb-row ${live ? 'live' : ''}`}>
                      <button
                        type="button"
                        className={`lb-star ${rowFav ? 'on' : ''}`}
                        onClick={() => setOpenRow(open ? null : m.id)}
                        aria-label="Volgen"
                        aria-expanded={open}
                        title="Volg een ploeg of club"
                      >
                        {rowFav ? '★' : '☆'}
                      </button>
                      <Link href={`/match/${m.id}`} className="lb-match">
                        <span className="lb-team home">
                          <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size="sm" ringColor={m.home.colors?.primary} />
                          <span className="lb-name">{m.home.name}</span>
                        </span>
                        <span className="lb-mid">
                          <span className="lb-status">
                            {live ? (
                              <span className="lb-livebadge">LIVE</span>
                            ) : m.status === 'finished' ? (
                              <span className="lb-donebadge">Einde</span>
                            ) : (
                              <span className="lb-time">{m.time}</span>
                            )}
                          </span>
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
                          {m.weather && (
                            <RowWeather kickoff={m.kickoff} plaats={m.weather.plaats} lat={m.weather.lat} lng={m.weather.lng} />
                          )}
                        </span>
                        <span className="lb-team away">
                          <span className="lb-name">{m.away.name}</span>
                          <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size="sm" ringColor={m.away.colors?.primary} />
                        </span>
                      </Link>
                    </div>

                    {open && (
                      <div className="lb-follow">
                        <span className="lb-follow-lbl">Volg ploeg</span>
                        <button type="button" className={`lb-follow-chip ${favTeams.has(m.home.teamId) ? 'on' : ''}`} onClick={() => toggleTeam(m.home.teamId)}>
                          {favTeams.has(m.home.teamId) ? '★' : '☆'} {m.home.name}
                        </button>
                        <button type="button" className={`lb-follow-chip ${favTeams.has(m.away.teamId) ? 'on' : ''}`} onClick={() => toggleTeam(m.away.teamId)}>
                          {favTeams.has(m.away.teamId) ? '★' : '☆'} {m.away.name}
                        </button>
                        {(m.home.clubId != null || m.away.clubId != null) && <span className="lb-follow-lbl">Volg club</span>}
                        {m.home.clubId != null && (
                          <button type="button" className={`lb-follow-chip ${favClubs.has(m.home.clubId) ? 'on' : ''}`} onClick={() => toggleClub(m.home.clubId as number)}>
                            {favClubs.has(m.home.clubId) ? '★' : '☆'} {m.home.clubName ?? m.home.name}
                          </button>
                        )}
                        {m.away.clubId != null && m.away.clubId !== m.home.clubId && (
                          <button type="button" className={`lb-follow-chip ${favClubs.has(m.away.clubId) ? 'on' : ''}`} onClick={() => toggleClub(m.away.clubId as number)}>
                            {favClubs.has(m.away.clubId) ? '★' : '☆'} {m.away.clubName ?? m.away.name}
                          </button>
                        )}
                      </div>
                    )}
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
