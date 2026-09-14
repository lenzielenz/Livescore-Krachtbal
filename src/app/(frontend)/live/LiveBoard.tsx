'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { PushOptIn } from '@/components/PushOptIn'
import { TeamLogo } from '@/components/TeamLogo'
import { type ClubColors } from '@/lib/club-colors'
import { type LogoFit } from '@/lib/logo-fit'
import { pronostiekOpen } from '@/lib/pronostiek-weekend'
import { speeldagenRond, volgendeSpeeldag, vorigeSpeeldag, type Speeldag } from '@/lib/speeldagen'
import { pastBijZoekterm } from '@/lib/team-search'
import { brusselsNoonUtc, formatDateBE, shiftDateStr } from '@/lib/datetime'

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
  /** Aftrap ruim voorbij zonder notatie: in werkelijkheid gespeeld, maar zonder uitslag. */
  awaitingResult?: boolean
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

const shiftDate = shiftDateStr


/** Korte dagnaam voor de speeldagenlijst: "Vandaag", anders "za 12 sep". */
function dagLabel(datum: string, today: string): string {
  if (datum === today) return 'Vandaag'
  return formatDateBE(brusselsNoonUtc(datum), {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

function useFavSet(key: string, userId: number | string | null = null): [Set<number>, (id: number) => void] {
  // Favorieten zijn persoonsgebonden. Zonder account behouden we de oude gastlijst;
  // ingelogde accounts krijgen elk een eigen localStorage-bucket, ook op dezelfde pc.
  const storageKey = userId == null ? key : `${key}:${userId}`
  const [set, setSet] = useState<Set<number>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      setSet(raw ? new Set(JSON.parse(raw) as number[]) : new Set())
    } catch {
      setSet(new Set())
    }
  }, [storageKey])
  const toggle = (id: number) =>
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


/**
 * Houdt het bord vanzelf actueel. Eén gedeelde verbinding per dag (zie day-channel.ts) stuurt
 * enkel de veranderlijke stand door; namen, logo's en kleuren blijven staan. Bewust alleen
 * verbinden wanneer er iets te volgen valt (vandaag, of een lopende/te noteren wedstrijd) en
 * alleen terwijl het tabblad zichtbaar is — een bord dat in je achterzak openstaat, hoeft niet
 * te blijven pollen.
 *
 * Geeft ook terug welke wedstrijden NET gescoord hebben, zodat de rij even kan oplichten.
 */
function useLiveScores(initial: DayMatch[], date: string, today: string): [DayMatch[], Set<number>] {
  const [scores, setScores] = useState<Record<number, Partial<DayMatch>>>({})
  const [flash, setFlash] = useState<Set<number>>(new Set())
  const vorige = useRef<Record<number, string>>({})

  const nodig = date === today || initial.some((m) => m.status === 'live' || m.awaitingResult)

  useEffect(() => {
    if (!nodig || typeof window === 'undefined') return
    let es: EventSource | null = null
    const timers: ReturnType<typeof setTimeout>[] = []

    const open = () => {
      if (es) return
      es = new EventSource(`/api/live/stream?date=${date}`)
      es.addEventListener('scores', (e) => {
        let lijst: (Partial<DayMatch> & { id: number })[] = []
        try {
          lijst = JSON.parse((e as MessageEvent).data) as (Partial<DayMatch> & { id: number })[]
        } catch {
          return
        }
        const perId: Record<number, Partial<DayMatch>> = {}
        const nieuw = new Set<number>()
        for (const s of lijst) {
          perId[s.id] = s
          const sleutel = `${s.score?.home ?? 0}-${s.score?.away ?? 0}`
          const was = vorige.current[s.id]
          // Enkel oplichten bij een ECHTE wijziging, niet bij de eerste frame (dan weet je nog
          // niets en zou het hele bord knipperen).
          if (was !== undefined && was !== sleutel) nieuw.add(s.id)
          vorige.current[s.id] = sleutel
        }
        setScores(perId)
        if (nieuw.size > 0) {
          setFlash((prev) => new Set([...prev, ...nieuw]))
          timers.push(
            setTimeout(() => {
              setFlash((prev) => {
                const next = new Set(prev)
                for (const id of nieuw) next.delete(id)
                return next
              })
            }, 2600),
          )
        }
      })
    }
    const close = () => {
      es?.close()
      es = null
    }
    const onVis = () => (document.visibilityState === 'visible' ? open() : close())

    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      for (const t of timers) clearTimeout(t)
      close()
    }
  }, [date, nodig])

  const samen = useMemo(
    () => initial.map((m) => (scores[m.id] ? { ...m, ...scores[m.id] } : m)),
    [initial, scores],
  )
  return [samen, flash]
}

export function LiveBoard({
  date,
  today,
  matches: initialMatches,
  speeldagen = [],
  myClubId = null,
  supportersMode = false,
  userId = null,
}: {
  date: string
  today: string
  matches: DayMatch[]
  /** Dagen waarop er gespeeld wordt, met hun aantal — voedt de pijltjes en de datumkiezer. */
  speeldagen?: Speeldag[]
  /** De club van de ingelogde gebruiker (ingesteld in de admin) — voedt de "Mijn club"-filter. */
  myClubId?: number | null
  /** Globale supporters-modus: dan krijgt elke wedstrijd een "Aantekenen"-knop zodat iedereen
   *  meteen vanaf het live-bord de score kan beginnen doorgeven. */
  supportersMode?: boolean
  /** Authenticated account identity used to isolate favorites on shared devices. */
  userId?: number | string | null
}) {
  const router = useRouter()
  // Het bord werkt zichzelf bij zolang er iets te volgen valt (zie useLiveScores hierboven).
  const [matches, netGescoord] = useLiveScores(initialMatches, date, today)
  const [favTeams, toggleTeam] = useFavSet(FAV_TEAMS_KEY, userId)
  const [favClubs, toggleClub] = useFavSet(FAV_CLUBS_KEY, userId)
  const [reeksFilter, setReeksFilter] = useState<string | null>(null)
  const [onlyFavTeams, setOnlyFavTeams] = useState(false)
  const [onlyFavClubs, setOnlyFavClubs] = useState(false)
  // Ingelogde supporter met een club ziet standaard meteen z'n EIGEN club (zolang die vandaag
  // speelt). Hij kan de "Mijn club"-filter zelf uitzetten om andere wedstrijden te zien.
  const [onlyMyClub, setOnlyMyClub] = useState(
    () => myClubId != null && matches.some((m) => m.home.clubId === myClubId || m.away.clubId === myClubId),
  )
  // Open standaard op "Nu live" zodra er live wedstrijden zijn — tot de supporter naar "Hele dag"
  // wisselt. Voor een ingelogde supporter wiens club vandaag speelt: toon z'n club live als die
  // live is, anders z'n hele dag (i.p.v. een lege live-lijst). Lazy initializer → enkel bij opbouw.
  const [onlyLive, setOnlyLive] = useState(() => {
    const anyLive = matches.some((m) => m.status === 'live')
    const isMine = (m: DayMatch) => myClubId != null && (m.home.clubId === myClubId || m.away.clubId === myClubId)
    if (myClubId == null || !matches.some(isMine)) return anyLive
    return matches.some((m) => isMine(m) && m.status === 'live')
  })
  const [query, setQuery] = useState('')
  const [openRow, setOpenRow] = useState<number | null>(null)
  // Reeksen die de supporter zelf dichtklapte — zo veegt hij weg wat hem niet boeit
  // zonder iets te verliezen (de telling blijft op de kop staan). Standaard alles open.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapsed = (reeks: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(reeks)) next.delete(reeks)
      else next.add(reeks)
      return next
    })

  const liveCount = useMemo(() => matches.filter((m) => m.status === 'live').length, [matches])
  // "Enkel live" geldt alléén als er ook echt live wedstrijden zijn: op een dag zonder live
  // (bv. een vorige datum) valt het bord vanzelf terug op alles i.p.v. een lege lijst.
  const showLiveOnly = onlyLive && liveCount > 0

  // Zoek op ploegnaam, clubnaam of reeks — zoals mensen ze typen ("sint michiels" vindt
  // "KBC St. Michiels B", "baasro" vindt "'T Botterken Baasrode"). Zie team-search.ts.
  const matchesQuery = (m: DayMatch, q: string) =>
    pastBijZoekterm(q, m.home.name, m.away.name, m.home.clubName, m.away.clubName, m.reeks)

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
        if (showLiveOnly && m.status !== 'live') return false
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

  // Staat er een filter aan? Dan is een lege lijst gevolg van de keuze van de supporter —
  // we bieden één knop om alles weer vrij te geven i.p.v. een doodlopend zinnetje.
  const anyFilterActive =
    Boolean(query.trim()) || showLiveOnly || onlyFavTeams || onlyFavClubs || onlyMyClub || reeksFilter != null
  const clearFilters = () => {
    setQuery('')
    setOnlyLive(false)
    setOnlyFavTeams(false)
    setOnlyFavClubs(false)
    setOnlyMyClub(false)
    setReeksFilter(null)
  }
  // Een dag zónder wedstrijden is iets anders dan te strenge filters: dan helpt wissen niet,
  // en sturen we de bezoeker naar een andere dag of de rest van het platform.
  const dayEmpty = matches.length === 0

  const groups = useMemo(() => {
    const map = new Map<string, DayMatch[]>()
    for (const m of visible) {
      const arr = map.get(m.reeks) ?? []
      arr.push(m)
      map.set(m.reeks, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])

  const dateLabel = formatDateBE(brusselsNoonUtc(date), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
  // Mag er voor deze speeldag al gepronostikeerd worden? (open vanaf zondagmiddernacht ervoor)
  const kanVoorspellen = useMemo(() => pronostiekOpen(brusselsNoonUtc(date).toISOString()), [date])

  // Datumnavigatie op basis van de échte speeldagen (zie speeldagen.ts). Zonder die lijst (bv. een
  // lege kalender) valt alles terug op één dag opschuiven.
  const dagenRef = useRef<HTMLDetailsElement>(null)
  const vorigeDag = useMemo(
    () => (speeldagen.length ? vorigeSpeeldag(speeldagen, date) : shiftDate(date, -1)),
    [speeldagen, date],
  )
  const volgendeDag = useMemo(
    () => (speeldagen.length ? volgendeSpeeldag(speeldagen, date) : shiftDate(date, 1)),
    [speeldagen, date],
  )
  const venster = useMemo(() => (speeldagen.length ? speeldagenRond(speeldagen, date) : []), [speeldagen, date])
  const aantalVandaag = useMemo(() => speeldagen.find((d) => d.datum === date)?.aantal ?? 0, [speeldagen, date])

  const emptyReason = query.trim()
    ? ` voor “${query.trim()}”`
    : showLiveOnly
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
        {/* Snelfilters apart — favorieten. Live staat als eigen schakelaar bovenaan het bord. */}
        <div className="lb-quick">
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
        <PushOptIn />
      </aside>

      <main className="lb-main">
        {/* Hoofdschakelaar: "Nu live" (standaard aan zodra er live wedstrijden zijn) ↔ "Hele dag".
            Eén rustige plek om te kiezen wat je ziet, i.p.v. een filter in de zijbalk. */}
        {liveCount > 0 && (
          <div className="lb-livetabs" role="tablist" aria-label="Toon live of de hele dag">
            <button
              type="button"
              role="tab"
              aria-selected={showLiveOnly}
              className={`lb-livetab ${showLiveOnly ? 'on' : ''}`}
              onClick={() => setOnlyLive(true)}
            >
              <span className="lb-livedot" /> Nu live
              <span className="lb-livetab-n">{liveCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!showLiveOnly}
              className={`lb-livetab ${!showLiveOnly ? 'on' : ''}`}
              onClick={() => setOnlyLive(false)}
            >
              Hele dag
            </button>
          </div>
        )}

        <div className="lb-datenav">
          {/* De pijltjes springen naar de vorige/volgende dag waar écht gespeeld wordt. In een
              competitie die enkel in het weekend speelt, scheelt dat vier tikken op leegte.
              Is er niets meer in die richting, dan staat de pijl uit i.p.v. naar een lege dag te
              leiden. Zijn er (nog) geen speeldagen bekend, dan valt alles terug op één dag
              opschuiven — beter dan een dood bord. */}
          {vorigeDag ? (
            <Link href={`/?date=${vorigeDag}`} className="lb-datebtn" aria-label="Vorige speeldag">‹</Link>
          ) : (
            <span className="lb-datebtn uit" aria-hidden>‹</span>
          )}
          <details className="lb-date" ref={dagenRef}>
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
                    href={`/?date=${d.datum}`}
                    className={`lb-dag${d.datum === date ? ' nu' : ''}${d.aantal === 0 ? ' leeg' : ''}`}
                    onClick={() => dagenRef.current?.removeAttribute('open')}
                  >
                    <span className="lb-dag-naam">{dagLabel(d.datum, today)}</span>
                    <span className="lb-dag-aantal">{d.aantal > 0 ? d.aantal : '—'}</span>
                  </Link>
                ))
              )}
              {/* Verder terug of vooruit dan het venster? Dan blijft de gewone datumkiezer er. */}
              <label className="lb-dag-anders">
                Andere datum
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && router.push(`/?date=${e.target.value}`)}
                  aria-label="Kies datum"
                />
              </label>
            </div>
          </details>
          {volgendeDag ? (
            <Link href={`/?date=${volgendeDag}`} className="lb-datebtn" aria-label="Volgende speeldag">›</Link>
          ) : (
            <span className="lb-datebtn uit" aria-hidden>›</span>
          )}
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

        {/* Je zoekt hier meestal je eigen ploeg. Speelt die vandaag niet, dan is het bord een
            doodlopend straatje — daarom een rechtstreekse doorstap naar de volledige agenda van
            die ploeg. Staat er wél iets vandaag, dan blijft de link discreet onderaan de zoekbalk. */}
        {query.trim().length >= 2 && (
          <Link href={`/zoeken?ploeg=${encodeURIComponent(query.trim())}`} className="lb-wanneer">
            📅 Wanneer speelt <b>{query.trim()}</b> nog? Bekijk de hele agenda →
          </Link>
        )}

        {groups.length === 0 ? (
          <div className="lb-empty">
            {!dayEmpty && anyFilterActive ? (
              <>
                <p className="lb-empty-title">Niets gevonden{emptyReason}.</p>
                <p className="lb-empty-sub">Pas je filters aan of toon weer alle wedstrijden van deze dag.</p>
                <div className="lb-empty-actions">
                  <button type="button" className="lb-empty-btn primary" onClick={clearFilters}>
                    ↺ Wis filters
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="lb-empty-title">Geen wedstrijden op {date === today ? 'vandaag' : 'deze dag'}.</p>
                <p className="lb-empty-sub">Spring naar een andere dag of ontdek de rest van het platform.</p>
                <div className="lb-empty-actions">
                  <Link href={`/?date=${shiftDate(date, 1)}`} className="lb-empty-btn primary">
                    Volgende dag ›
                  </Link>
                  <Link href="/rangschikking" className="lb-empty-btn">
                    📊 Bekijk de stand
                  </Link>
                  <Link href="/demo" className="lb-empty-btn">
                    🎓 Probeer de demo
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          groups.map(([reeks, list]) => {
            const isCollapsed = collapsed.has(reeks)
            const liveInGroup = list.filter((m) => m.status === 'live').length
            return (
            <section key={reeks} className={`lb-group ${isCollapsed ? 'collapsed' : ''}`}>
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
              {!isCollapsed && list.map((m) => {
                const played = m.status !== 'scheduled'
                const live = m.status === 'live'
                const hasStats = played && (m.crosses || m.timeouts)
                const rowFav = teamFav(m) || clubFav(m)
                const open = openRow === m.id
                return (
                  <div key={m.id} className="lb-rowwrap">
                    {/* "live" hier = de kaart-look (zie hierboven), niet de wedstrijdstatus. "now"
                        schakelt de dure bewegende/blur-effecten (aurora, glans, matglas) in — enkel
                        voor de paar écht-lopende wedstrijden, anders hapert het scrollen door
                        tientallen tegelijk animerende/blurrende rijen. */}
                    <div className={`lb-row live ${live ? 'now' : ''}${netGescoord.has(m.id) ? ' scored' : ''}`}>
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
                      {/* Elke rij krijgt dezelfde "Glas"-kaart (logo's + bewegende clubkleuren +
                          glans), ongeacht status — enkel het middenbadge en de score/'vs' wisselen.
                          De CSS-klassen heten nog "live"/"lb-match-live" (historisch: dit was ooit
                          enkel voor lopende wedstrijden), maar gelden nu voor élke rij.
                          Geen <Link> meer als buitenste element (kan geen <a> in <a> nesten) — de
                          kaart navigeert zelf via JS naar de match, zodat logo/naam er WEL twee
                          eigen linkjes naar het ploegprofiel in kunnen zitten (1 tik: bord → hele
                          seizoensagenda van je ploeg). stopPropagation op die linkjes voorkomt dat
                          de tik ook de kaart (match) opent. */}
                      <div
                        className="lb-match lb-match-live"
                        style={{ '--hc': m.home.colors?.primary ?? 'var(--accent)', '--ac': m.away.colors?.primary ?? 'var(--accent)' } as CSSProperties}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/match/${m.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            router.push(`/match/${m.id}`)
                          }
                        }}
                      >
                        <span className="lbl-head">
                          <span className="lbl-color" aria-hidden />
                          <span className="lbl-gl" aria-hidden />
                          <Link href={`/ploegen/${m.home.teamId}`} className="lbl-logo" onClick={(e) => e.stopPropagation()} aria-label={`${m.home.name} — seizoensagenda`}>
                            <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size={44} ringColor={m.home.colors?.primary} />
                          </Link>
                          <span className="lbl-center">
                            {live ? (
                              <span className="lb-livebadge">LIVE</span>
                            ) : m.status === 'finished' ? (
                              <span className="lb-donebadge">Einde</span>
                            ) : m.awaitingResult && supportersMode ? (
                              <span className="lb-needsresult" title="Vermoedelijk gespeeld — nog geen uitslag doorgegeven">🏁 uitslag?</span>
                            ) : (
                              <span className="lb-time">{m.time}</span>
                            )}
                            {/* Nog te spelen: geen kale "vs" maar een verzorgde chip (lbl-vs). */}
                            <span className={`lbl-score${played ? '' : ' lbl-vs'}`}>{played ? `${m.score.home} – ${m.score.away}` : 'VS'}</span>
                            {hasStats && (
                              <span className="lb-stats">
                                <span title="Kruisjes">✖ {m.crosses?.home ?? 0}–{m.crosses?.away ?? 0}</span>
                                <span className="lb-stat-sep">·</span>
                                <span title="Time-outs">⏱ {m.timeouts?.home ?? 0}–{m.timeouts?.away ?? 0}</span>
                                {m.refereeStops ? (
                                  <>
                                    <span className="lb-stat-sep">·</span>
                                    <span title="Time-outs scheidsrechter">🧑‍⚖️ ⏱ {m.refereeStops}</span>
                                  </>
                                ) : null}
                              </span>
                            )}
                          </span>
                          <Link href={`/ploegen/${m.away.teamId}`} className="lbl-logo" onClick={(e) => e.stopPropagation()} aria-label={`${m.away.name} — seizoensagenda`}>
                            <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size={44} ringColor={m.away.colors?.primary} />
                          </Link>
                        </span>
                        <span className="lbl-names">
                          <Link href={`/ploegen/${m.home.teamId}`} className="lbl-name" onClick={(e) => e.stopPropagation()}>{m.home.name}</Link>
                          <Link href={`/ploegen/${m.away.teamId}`} className="lbl-name away" onClick={(e) => e.stopPropagation()}>{m.away.name}</Link>
                        </span>
                      </div>
                    </div>

                    {/* Supporters-modus: vrije livescore. Bij een LOPENDE wedstrijd staat de
                        "Aantekenen"-knop er meteen — daar telt elke seconde, en wie de score wil
                        doorgeven mag niet eerst moeten ontdekken dat hij de rij kan openklikken.
                        Voor wedstrijden die nog moeten beginnen blijft de knop achter de ster: dat
                        zijn er op een speeldag tientallen, en die hoeven het bord niet vol te zetten. */}
                    {supportersMode && (live || open) && m.status !== 'finished' && (
                      <Link href={`/scorekeeper/${m.id}`} className="lb-score-cta">
                        <span className="lb-score-cta-ico" aria-hidden>✏️</span>
                        <span className="lb-score-cta-txt">
                          {live ? 'Aantekenen — verder scoren' : 'Aantekenen — start de wedstrijd'}
                        </span>
                        <span className="lb-score-cta-arrow" aria-hidden>→</span>
                      </Link>
                    )}
                    {/* Aftrap ruim voorbij zonder notatie? Rechtstreeks naar het uitslag-formulier
                        op de matchpagina — zo raakt elke gespeelde match toch aan zijn eindstand. */}
                    {supportersMode && open && m.awaitingResult && (
                      <Link href={`/match/${m.id}#uitslag`} className="lb-score-cta">
                        <span className="lb-score-cta-ico" aria-hidden>🏁</span>
                        <span className="lb-score-cta-txt">Gespeeld? Geef de uitslag door</span>
                        <span className="lb-score-cta-arrow" aria-hidden>→</span>
                      </Link>
                    )}
                    {/* Pronostiek-uitnodiging in de uitgeklapte rij: de speelweek staat open
                        (vanaf zondagmiddernacht) en er valt nog te voorspellen. */}
                    {open && !m.awaitingResult && m.status !== 'finished' && kanVoorspellen && (
                      <Link href={`/match/${m.id}`} className="lb-score-cta pronostiek">
                        <span className="lb-score-cta-ico" aria-hidden>🔮</span>
                        <span className="lb-score-cta-txt">
                          {m.status === 'live' ? 'Voorspel de uitslag — kan nog tijdens de match' : 'Voorspel de uitslag — speel de pronostiek'}
                        </span>
                        <span className="lb-score-cta-arrow" aria-hidden>→</span>
                      </Link>
                    )}

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
          })
        )}
      </main>
    </div>
  )
}
