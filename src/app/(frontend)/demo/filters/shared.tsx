'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { brusselsNoonUtc, dateStrBE, formatDateBE, shiftDateStr } from '@/lib/datetime'
import { alleSpeeldagen, volgendeSpeeldag, vorigeSpeeldag, type Speeldag } from '@/lib/speeldagen'
import { pastBijZoekterm } from '@/lib/team-search'

import type { DayMatch } from '../../live/LiveBoard'

/** Korte datumlabel: "Vandaag" op de huidige dag, anders "za 12 dec". Gedeeld door de
 * datumkiezer en de datum-tags op de kaarten (bij een uitgebreide zoekopdracht). */
function dagKort(datum: string, today: string): string {
  if (datum === today) return 'Vandaag'
  return formatDateBE(brusselsNoonUtc(datum), { weekday: 'short', day: '2-digit', month: 'short' })
}

// Testpagina voor 3 voorstellen van de selectie-/filter-UI (reeksen, ploegen, clubs, live).
// Alle drie hergebruiken dezelfde data + dezelfde wedstrijdkaart (MatchGroups hieronder) — enkel
// het stuk waarmee je snel een reeks/ploeg/club/live wedstrijd vindt verschilt per voorstel.
// Bewust EIGEN localStorage-sleutels (kb-demo-fav-*) i.p.v. de echte (kb-fav-*): testen hier mag
// nooit de favorieten van de echte startpagina aanraken.
const FAV_TEAMS_KEY = 'kb-demo-fav-ploegen'
const FAV_CLUBS_KEY = 'kb-demo-fav-clubs'
const FAV_REEKS_KEY = 'kb-demo-fav-reeksen'

function useFavSet<T extends number | string>(key: string, userId: number | string | null = null): [Set<T>, (id: T) => void] {
  const storageKey = userId == null ? key : `${key}:${userId}`
  const [set, setSet] = useState<Set<T>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      setSet(raw ? new Set(JSON.parse(raw) as T[]) : new Set())
    } catch {
      setSet(new Set())
    }
  }, [storageKey])
  const toggle = (id: T) =>
    setSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {}
      return next
    })
  return [set, toggle]
}

export type DemoFilters = ReturnType<typeof useDemoFilters>

/** Alle filterstaat + de afgeleide (gegroepeerde) wedstrijdenlijst — gedeeld door de 3 voorstellen. */
export function useDemoFilters(matches: DayMatch[], myClubId: number | null, userId: number | string | null) {
  const [favTeams, toggleTeam] = useFavSet<number>(FAV_TEAMS_KEY, userId)
  const [favClubs, toggleClub] = useFavSet<number>(FAV_CLUBS_KEY, userId)
  const [favReeksen, toggleReeks] = useFavSet<string>(FAV_REEKS_KEY, userId)
  const [reeksFilter, setReeksFilter] = useState<string | null>(null)
  const [onlyFavTeams, setOnlyFavTeams] = useState(false)
  const [onlyFavClubs, setOnlyFavClubs] = useState(false)
  const [onlyFavReeksen, setOnlyFavReeksen] = useState(false)
  const [onlyMyClub, setOnlyMyClub] = useState(
    () => myClubId != null && matches.some((m) => m.home.clubId === myClubId || m.away.clubId === myClubId),
  )
  const [onlyLive, setOnlyLive] = useState(() => matches.some((m) => m.status === 'live'))
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sortBy, setSortBy] = useState<'reeks' | 'tijd'>('reeks')

  // Vul de dag-gebonden lijst aan met treffers van andere dagen zodra er iets getypt wordt (2+
  // tekens) — zo blijft "waarom vind ik niets?" uit als je ploeg vandaag niet speelt. Gedebouncet
  // en met een eigen abort per toets zodat een trage/oude respons een nieuwere niet overschrijft.
  const [extra, setExtra] = useState<DayMatch[]>([])
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setExtra([])
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/demo/filters/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((data: { matches?: DayMatch[] }) => setExtra(Array.isArray(data.matches) ? data.matches : []))
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])

  // Combinatie van de dag-lijst + de extra seizoenstreffers, ontdubbeld op id. Zonder actieve
  // zoekopdracht is dit gewoon `matches` — niets verandert dan aan het bestaande gedrag.
  const combined = useMemo(() => {
    if (extra.length === 0) return matches
    const seen = new Set(matches.map((m) => m.id))
    const extraMatches = extra.filter((m) => !seen.has(m.id))
    return extraMatches.length ? [...matches, ...extraMatches] : matches
  }, [matches, extra])

  const liveCount = useMemo(() => matches.filter((m) => m.status === 'live').length, [matches])
  const showLiveOnly = onlyLive && liveCount > 0

  const matchesQuery = (m: DayMatch, q: string) =>
    pastBijZoekterm(q, m.home.name, m.away.name, m.home.clubName, m.away.clubName, m.reeks)

  const teamFav = (m: DayMatch) => favTeams.has(m.home.teamId) || favTeams.has(m.away.teamId)
  const clubFav = (m: DayMatch) =>
    (m.home.clubId != null && favClubs.has(m.home.clubId)) || (m.away.clubId != null && favClubs.has(m.away.clubId))
  const reeksFav = (m: DayMatch) => favReeksen.has(m.reeks)
  const myClubMatch = (m: DayMatch) => myClubId != null && (m.home.clubId === myClubId || m.away.clubId === myClubId)
  const myClubCount = useMemo(() => (myClubId == null ? 0 : matches.filter(myClubMatch).length), [matches, myClubId])

  const base = useMemo(
    () =>
      combined.filter((m) => {
        if (showLiveOnly && m.status !== 'live') return false
        if (query.trim() && !matchesQuery(m, query)) return false
        if (onlyMyClub && !myClubMatch(m)) return false
        if (onlyFavTeams || onlyFavClubs || onlyFavReeksen) {
          const hit = (onlyFavTeams && teamFav(m)) || (onlyFavClubs && clubFav(m)) || (onlyFavReeksen && reeksFav(m))
          if (!hit) return false
        }
        return true
      }),
    [combined, showLiveOnly, onlyFavTeams, onlyFavClubs, onlyFavReeksen, onlyMyClub, myClubId, favTeams, favClubs, favReeksen, query],
  )

  const reeksen = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of base) counts.set(m.reeks, (counts.get(m.reeks) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [base])

  const visible = base.filter((m) => !reeksFilter || m.reeks === reeksFilter)

  const anyFilterActive =
    Boolean(query.trim()) || showLiveOnly || onlyFavTeams || onlyFavClubs || onlyFavReeksen || onlyMyClub || reeksFilter != null
  const activeCount =
    (query.trim() ? 1 : 0) +
    (showLiveOnly ? 1 : 0) +
    (onlyMyClub ? 1 : 0) +
    (onlyFavTeams ? 1 : 0) +
    (onlyFavClubs ? 1 : 0) +
    (onlyFavReeksen ? 1 : 0) +
    (reeksFilter ? 1 : 0)
  const clearFilters = () => {
    setQuery('')
    setOnlyLive(false)
    setOnlyFavTeams(false)
    setOnlyFavClubs(false)
    setOnlyFavReeksen(false)
    setOnlyMyClub(false)
    setReeksFilter(null)
  }
  const dayEmpty = matches.length === 0

  // Op tijdstip: één doorlopende lijst chronologisch, geen reeks-secties — handig om te zien wat
  // er nu/zo dadelijk speelt, ongeacht de reeks. Op reeks (standaard): gegroepeerd zoals vandaag,
  // elke groep zelf al chronologisch (de matches komen al gesorteerd op datum uit de databank).
  const groups = useMemo(() => {
    if (sortBy === 'tijd') {
      const chronologisch = [...visible].sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      return chronologisch.length ? ([['', chronologisch]] as [string, DayMatch[]][]) : []
    }
    const map = new Map<string, DayMatch[]>()
    for (const m of visible) {
      const arr = map.get(m.reeks) ?? []
      arr.push(m)
      map.set(m.reeks, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible, sortBy])

  return {
    query, setQuery,
    reeksFilter, setReeksFilter,
    onlyMyClub, setOnlyMyClub,
    onlyFavTeams, setOnlyFavTeams,
    onlyFavClubs, setOnlyFavClubs,
    onlyFavReeksen, setOnlyFavReeksen,
    onlyLive, setOnlyLive,
    drawerOpen, setDrawerOpen,
    sortBy, setSortBy,
    favTeams, toggleTeam,
    favClubs, toggleClub,
    favReeksen, toggleReeks,
    liveCount, showLiveOnly, myClubCount,
    base, reeksen, groups,
    anyFilterActive, activeCount, clearFilters, dayEmpty,
  }
}

/**
 * Datumnavigatie — bewust ONGEWIJZIGD gehouden en gedeeld door alle 3 voorstellen: het verzoek
 * ging over de reeks-/ploeg-/club-/live-selectie, niet over hoe je van dag wisselt.
 */
export function DateNav({
  date,
  today,
  speeldagen,
  basePath,
}: {
  date: string
  today: string
  speeldagen: Speeldag[]
  basePath: string
}) {
  const dagenRef = useRef<HTMLDetailsElement>(null)
  const dateLabel = formatDateBE(brusselsNoonUtc(date), { weekday: 'long', day: '2-digit', month: 'long' })
  const vorigeDag = useMemo(() => (speeldagen.length ? vorigeSpeeldag(speeldagen, date) : shiftDateStr(date, -1)), [speeldagen, date])
  const volgendeDag = useMemo(() => (speeldagen.length ? volgendeSpeeldag(speeldagen, date) : shiftDateStr(date, 1)), [speeldagen, date])
  const venster = useMemo(() => (speeldagen.length ? alleSpeeldagen(speeldagen, date) : []), [speeldagen, date])
  const aantalVandaag = useMemo(() => speeldagen.find((d) => d.datum === date)?.aantal ?? 0, [speeldagen, date])
  const dagLabel = (datum: string) => dagKort(datum, today)

  return (
    <div className="lb-datenav">
      {vorigeDag ? (
        <Link href={`${basePath}?date=${vorigeDag}`} className="lb-datebtn" aria-label="Vorige speeldag">‹</Link>
      ) : (
        <span className="lb-datebtn uit" aria-hidden>‹</span>
      )}
      <details
        className="lb-date"
        ref={dagenRef}
        onToggle={(e) => {
          if (!(e.target as HTMLDetailsElement).open) return
          requestAnimationFrame(() => {
            dagenRef.current?.querySelector('.lb-dag.nu')?.scrollIntoView({ block: 'center' })
          })
        }}
      >
        <summary className="lb-datesum">
          <span className="lb-datelabel">{date === today ? 'Vandaag' : dateLabel}</span>
          <span className="lb-datesub">
            {date.split('-').reverse().join('-')}
            {aantalVandaag > 0 && <span className="lb-datecount">{aantalVandaag}</span>}
            <span aria-hidden> ⌄</span>
          </span>
        </summary>
        <div className="lb-dagen">
          {venster.length === 0 ? (
            <p className="lb-dagen-leeg">Nog geen wedstrijden ingepland.</p>
          ) : (
            venster.map((d) => (
              <Link
                key={d.datum}
                href={`${basePath}?date=${d.datum}`}
                className={`lb-dag${d.datum === date ? ' nu' : ''}${d.aantal === 0 ? ' leeg' : ''}`}
                onClick={() => dagenRef.current?.removeAttribute('open')}
              >
                <span className="lb-dag-naam">{dagLabel(d.datum)}</span>
                <span className="lb-dag-aantal">{d.aantal > 0 ? d.aantal : '—'}</span>
              </Link>
            ))
          )}
        </div>
      </details>
      {volgendeDag ? (
        <Link href={`${basePath}?date=${volgendeDag}`} className="lb-datebtn" aria-label="Volgende speeldag">›</Link>
      ) : (
        <span className="lb-datebtn uit" aria-hidden>›</span>
      )}
    </div>
  )
}

/** Compacte reeks-kiezer — hergebruikt door voorstel 1 en 2. */
export function ReeksSelect({ filters, label = 'Reeks' }: { filters: DemoFilters; label?: string }) {
  return (
    <select
      className="lb-reeks-select fp-select"
      value={filters.reeksFilter ?? ''}
      onChange={(e) => filters.setReeksFilter(e.target.value || null)}
      aria-label="Kies een reeks"
    >
      <option value="">{label} — alle ({filters.base.length})</option>
      {filters.reeksen.map(([r, n]) => (
        <option key={r} value={r}>{r} ({n})</option>
      ))}
    </select>
  )
}

/** Eén "★ Favorieten"-knop die een klein menu opent met de 3 favorieten-filters — vervangt de 3
 * losse pil-knoppen van de huidige startpagina door één plek. Hergebruikt door voorstel 1 en 2. */
export function FavPopover({ filters }: { filters: DemoFilters }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const anyOn = filters.onlyFavTeams || filters.onlyFavClubs || filters.onlyFavReeksen
  return (
    <div className="fp-wrap" ref={ref}>
      <button type="button" className={`lb-reeks fav fp-btn ${anyOn ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>★ Favorieten</span>
        <span aria-hidden className="fp-caret">⌄</span>
      </button>
      {open && (
        <div className="fp-menu">
          <button type="button" className={`lb-reeks fav ${filters.onlyFavTeams ? 'on' : ''}`} onClick={() => filters.setOnlyFavTeams((v) => !v)}>
            <span>★ Ploegen</span>
            {filters.favTeams.size > 0 && <span className="lb-reeks-n">{filters.favTeams.size}</span>}
          </button>
          <button type="button" className={`lb-reeks fav ${filters.onlyFavClubs ? 'on' : ''}`} onClick={() => filters.setOnlyFavClubs((v) => !v)}>
            <span>★ Clubs</span>
            {filters.favClubs.size > 0 && <span className="lb-reeks-n">{filters.favClubs.size}</span>}
          </button>
          <button type="button" className={`lb-reeks fav ${filters.onlyFavReeksen ? 'on' : ''}`} onClick={() => filters.setOnlyFavReeksen((v) => !v)}>
            <span>★ Reeksen</span>
            {filters.favReeksen.size > 0 && <span className="lb-reeks-n">{filters.favReeksen.size}</span>}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * De wedstrijdenlijst zelf — identieke kaart-look als de echte startpagina (zelfde CSS-klassen uit
 * live.css), maar zonder de dingen die niets met de SELECTIE-UX te maken hebben (live-SSE-polling,
 * "aantekenen"/pronostiek-CTA's, weer): dit is een vergelijking van de vind-mechaniek, niet van de
 * wedstrijdkaart.
 */
export function MatchGroups({ filters, today }: { filters: DemoFilters; today: string }) {
  const [openRow, setOpenRow] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapsed = (reeks: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(reeks)) next.delete(reeks)
      else next.add(reeks)
      return next
    })

  const { groups, sortBy, setSortBy, query, favTeams, toggleTeam, favClubs, toggleClub, favReeksen, toggleReeks, anyFilterActive, clearFilters, dayEmpty } = filters
  // Sortering op tijd geeft één doorlopende lijst terug onder de sleutel '' (zie useDemoFilters) —
  // dan tonen we geen reeks-kop/ster, enkel een klein tagje per kaart.
  const chronologisch = sortBy === 'tijd'
  // Bij een actieve zoekopdracht kunnen de treffers over meerdere dagen verspreid zitten (zie
  // searchSeizoen/extra in useDemoFilters) — dan moet élke kaart tonen op welke dag ze staat.
  const zoekActief = query.trim().length >= 2

  const sortToggle = !dayEmpty && (
    <div className="lb-sort">
      <span className="lb-sort-lbl">Sorteer</span>
      <button type="button" className={`lb-sort-btn ${sortBy === 'reeks' ? 'on' : ''}`} onClick={() => setSortBy('reeks')}>
        🏷 Reeks
      </button>
      <button type="button" className={`lb-sort-btn ${sortBy === 'tijd' ? 'on' : ''}`} onClick={() => setSortBy('tijd')}>
        ⏱ Tijdstip
      </button>
    </div>
  )

  if (groups.length === 0) {
    return (
      <>
        {sortToggle}
        <div className="lb-empty">
          {!dayEmpty && anyFilterActive ? (
            <>
              <p className="lb-empty-title">Niets gevonden.</p>
              <p className="lb-empty-sub">Pas je filters aan of toon weer alle wedstrijden van deze dag.</p>
              <div className="lb-empty-actions">
                <button type="button" className="lb-empty-btn primary" onClick={clearFilters}>↺ Wis filters</button>
              </div>
            </>
          ) : (
            <p className="lb-empty-title">Geen wedstrijden op deze dag.</p>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {sortToggle}
      {groups.map(([reeks, list]) => {
        const isCollapsed = !chronologisch && collapsed.has(reeks)
        const liveInGroup = list.filter((m) => m.status === 'live').length
        return (
          <section key={reeks || '__tijd__'} className={`lb-group ${isCollapsed ? 'collapsed' : ''}`}>
            {!chronologisch && (
              <div className="lb-group-head-row">
                <button
                  type="button"
                  className="lb-group-head"
                  onClick={() => toggleCollapsed(reeks)}
                  aria-expanded={!isCollapsed}
                  title={isCollapsed ? 'Reeks openklappen' : 'Reeks dichtklappen'}
                >
                  <span className="lb-group-chevron" aria-hidden="true">▾</span>
                  <span className="lb-group-name">{reeks}</span>
                  {liveInGroup > 0 && <span className="lb-group-live"><span className="lb-livedot" />{liveInGroup}</span>}
                  <span className="lb-group-n">{list.length}</span>
                </button>
                <button
                  type="button"
                  className={`lb-group-star ${favReeksen.has(reeks) ? 'on' : ''}`}
                  onClick={() => toggleReeks(reeks)}
                  aria-label={favReeksen.has(reeks) ? `Verwijder ${reeks} als favoriete reeks` : `Volg ${reeks} als favoriete reeks`}
                >
                  {favReeksen.has(reeks) ? '★' : '☆'}
                </button>
              </div>
            )}
            {!isCollapsed && list.map((m) => {
              const played = m.status !== 'scheduled'
              const live = m.status === 'live'
              const hasStats = played && (m.crosses || m.timeouts)
              const rowFav = favTeams.has(m.home.teamId) || favTeams.has(m.away.teamId) || (m.home.clubId != null && favClubs.has(m.home.clubId)) || (m.away.clubId != null && favClubs.has(m.away.clubId))
              const open = openRow === m.id
              const tags = [
                chronologisch ? m.reeks : null,
                zoekActief ? dagKort(dateStrBE(new Date(m.kickoff)), today) : null,
              ].filter((t): t is string => Boolean(t))
              return (
                <div key={m.id} className="lb-rowwrap">
                  {tags.length > 0 && <span className="lb-row-reeks">{tags.join(' · ')}</span>}
                  <div className={`lb-row live ${live ? 'now' : ''}`}>
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
                    <Link
                      href={`/match/${m.id}`}
                      className="lb-match lb-match-live"
                      style={{ '--hc': m.home.colors?.primary ?? 'var(--accent)', '--ac': m.away.colors?.primary ?? 'var(--accent)' } as CSSProperties}
                    >
                      <span className="lbl-head">
                        <span className="lbl-color" aria-hidden />
                        <span className="lbl-gl" aria-hidden />
                        <span className="lbl-logo">
                          <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size={44} ringColor={m.home.colors?.primary} />
                        </span>
                        <span className="lbl-center">
                          {live ? (
                            <span className="lb-livebadge">LIVE</span>
                          ) : m.status === 'finished' ? (
                            <span className="lb-donebadge">Einde</span>
                          ) : (
                            <span className="lb-time">{m.time}</span>
                          )}
                          <span className={`lbl-score${played ? '' : ' lbl-vs'}`}>{played ? `${m.score.home} – ${m.score.away}` : 'VS'}</span>
                          {hasStats && (
                            <span className="lb-stats">
                              <span title="Kruisjes">✖ {m.crosses?.home ?? 0}–{m.crosses?.away ?? 0}</span>
                              <span className="lb-stat-sep">·</span>
                              <span title="Time-outs">⏱ {m.timeouts?.home ?? 0}–{m.timeouts?.away ?? 0}</span>
                            </span>
                          )}
                        </span>
                        <span className="lbl-logo">
                          <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size={44} ringColor={m.away.colors?.primary} />
                        </span>
                      </span>
                      <span className="lbl-names">
                        <span className="lbl-name">{m.home.name}</span>
                        <span className="lbl-name away">{m.away.name}</span>
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
        )
      })}
    </>
  )
}
