'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { PushOptIn } from '@/components/PushOptIn'
import { TeamLogo } from '@/components/TeamLogo'
import { type ClubColors } from '@/lib/club-colors'
import { type LogoFit } from '@/lib/logo-fit'
import { LIVE_VIEW_COOKIE, type LiveView } from '@/lib/live-view'
import { pronostiekOpen } from '@/lib/pronostiek-weekend'
import { aantalOp, alleSpeeldagen, volgendeSpeeldag, vorigeSpeeldag, type Speeldag } from '@/lib/speeldagen'
import { pastBijZoekterm } from '@/lib/team-search'
import { brusselsNoonUtc, dateStrBE, formatDateBE, shiftDateStr } from '@/lib/datetime'

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
const FAV_REEKS_KEY = 'kb-fav-reeksen'
const FILTER_STATE_KEY = 'kb-live-filters'
const SCROLL_STATE_KEY = 'kb-live-scroll'

/** Wat er van het filterbord bewaard blijft bij het verlaten van de pagina (zie de restore/persist-
 *  effecten in LiveBoard) — enkel voor dezelfde dag, anders zou een reeksfilter van vandaag raar
 *  staan op een compleet andere speeldag. Scroll zit in een eigen sleutel (zie SCROLL_STATE_KEY):
 *  die wijzigt continu tijdens het scrollen, de filters enkel bij een echte filterwijziging. */
type StoredFilterState = {
  date: string
  query: string
  sortBy: 'reeks' | 'tijd' | 'thuisuit'
  reeksFilter: string | null
  onlyFavTeams: boolean
  onlyFavClubs: boolean
  onlyFavReeksen: boolean
  onlyMyClub: boolean
  onlyLive: boolean
}
type StoredScrollState = { date: string; scrollY: number }

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

function useFavSet<T extends number | string>(key: string, userId: number | string | null = null): [Set<T>, (id: T) => void] {
  // Favorieten zijn persoonsgebonden. Zonder account behouden we de oude gastlijst;
  // ingelogde accounts krijgen elk een eigen localStorage-bucket, ook op dezelfde pc.
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

/**
 * Houdt het bord vanzelf actueel. Eén gedeelde verbinding per dag (zie day-channel.ts) stuurt
 * enkel de veranderlijke stand door; namen, logo's en kleuren blijven staan. Bewust alleen
 * verbinden wanneer er iets te volgen valt (vandaag, of een lopende/te noteren wedstrijd) en
 * alleen terwijl het tabblad zichtbaar is — een bord dat in je achterzak openstaat, hoeft niet
 * te blijven pollen.
 *
 * Geeft ook terug welke wedstrijden NET gescoord hebben, zodat de rij even kan oplichten.
 */
function useLiveScores(initial: DayMatch[], date: string, today: string, view: LiveView): [DayMatch[], Set<number>] {
  const [scores, setScores] = useState<Record<number, Partial<DayMatch>>>({})
  const [flash, setFlash] = useState<Set<number>>(new Set())
  const vorige = useRef<Record<number, string>>({})

  // In weekend-weergave is `date` de zaterdag — vandaag valt "in bereik" zodra het za óf zo is.
  const rangeIncludesToday = view === 'weekend' ? today >= date && today <= shiftDate(date, 1) : date === today
  const nodig = rangeIncludesToday || initial.some((m) => m.status === 'live' || m.awaitingResult)

  useEffect(() => {
    if (!nodig || typeof window === 'undefined') return
    let es: EventSource | null = null
    const timers: ReturnType<typeof setTimeout>[] = []

    const open = () => {
      if (es) return
      es = new EventSource(`/api/live/stream?date=${date}${view === 'weekend' ? '&view=weekend' : ''}`)
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
  }, [date, view, nodig])

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
  view,
  myClubId = null,
  supportersMode = false,
  userId = null,
}: {
  date: string
  today: string
  matches: DayMatch[]
  /** Dagen waarop er gespeeld wordt, met hun aantal — voedt de pijltjes en de datumkiezer. */
  speeldagen?: Speeldag[]
  /** Per dag of per volledig weekend bekijken. In 'weekend' is `date` steeds de zaterdag van
   *  dat weekend (zie loadLiveDay.weekendZaterdag). */
  view: LiveView
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
  const [matches, netGescoord] = useLiveScores(initialMatches, date, today, view)
  const [favTeams, toggleTeam] = useFavSet(FAV_TEAMS_KEY, userId)
  const [favClubs, toggleClub] = useFavSet(FAV_CLUBS_KEY, userId)
  const [favReeksen, toggleReeks] = useFavSet<string>(FAV_REEKS_KEY, userId)
  const [reeksFilter, setReeksFilter] = useState<string | null>(null)
  const [onlyFavTeams, setOnlyFavTeams] = useState(false)
  const [onlyFavClubs, setOnlyFavClubs] = useState(false)
  const [onlyFavReeksen, setOnlyFavReeksen] = useState(false)
  // Ingelogde supporter met een club ziet standaard meteen z'n EIGEN club (zolang die vandaag
  // speelt). Hij kan de "Mijn club"-filter zelf uitzetten om andere wedstrijden te zien.
  const [onlyMyClub, setOnlyMyClub] = useState(
    () => myClubId != null && matches.some((m) => m.home.clubId === myClubId || m.away.clubId === myClubId),
  )
  // Staat standaard aan zodra er live wedstrijden zijn — tot de supporter zelf "Nu live" uitzet
  // in de filterlade. Voor een ingelogde supporter wiens club vandaag speelt: toon z'n club live
  // als die live is, anders z'n hele dag (i.p.v. een lege live-lijst). Lazy initializer → enkel
  // bij opbouw.
  const [onlyLive, setOnlyLive] = useState(() => {
    const anyLive = matches.some((m) => m.status === 'live')
    const isMine = (m: DayMatch) => myClubId != null && (m.home.clubId === myClubId || m.away.clubId === myClubId)
    if (myClubId == null || !matches.some(isMine)) return anyLive
    return matches.some((m) => isMine(m) && m.status === 'live')
  })
  const [query, setQuery] = useState('')
  const [openRow, setOpenRow] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Wie een eigen club heeft, wil in de eerste plaats weten wanneer ZIJN ploeg thuis/uit speelt —
  // "Reeks" (alle wedstrijden van de dag, gegroepeerd) is dan pas de tweede vraag. Zonder gekende
  // club (of de restore hieronder) blijft "Reeks" de standaard.
  const [sortBy, setSortBy] = useState<'reeks' | 'tijd' | 'thuisuit'>(() => (myClubId != null ? 'thuisuit' : 'reeks'))
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

  // Filters, sortering en scrollpositie overleven een bezoek aan een wedstrijdpagina en terug: zonder
  // dit begint elke terugkeer weer bovenaan met alle filters gewist ("als je terug gaat moet het zijn
  // waar je gebleven was"). `hydrated` bewaakt dat de persist-effect hieronder pas ná de restore in
  // dezelfde render meeloopt: zonder die gate schrijft persist bij het opbouwen éérst de (nog niet
  // herstelde) defaults weg, en leest de restore die zelf weer terug bij Reacts StrictMode-dubbele
  // mount-cyclus (mount → cleanup → mount) in ontwikkeling — waardoor de zonet herstelde waarden
  // alsnog overschreven raken.
  const [hydrated, setHydrated] = useState(false)
  const pendingScrollRef = useRef<number | null>(null)
  useEffect(() => {
    // Enkel bij het opbouwen van dit bordexemplaar — dus ook wanneer je terugkeert van een
    // wedstrijdpagina, want die had het vorige exemplaar afgebroken.
    try {
      const raw = sessionStorage.getItem(FILTER_STATE_KEY)
      const saved = raw ? (JSON.parse(raw) as StoredFilterState) : null
      if (saved && saved.date === date) {
        setQuery(saved.query)
        setSortBy(saved.sortBy)
        setReeksFilter(saved.reeksFilter)
        setOnlyFavTeams(saved.onlyFavTeams)
        setOnlyFavClubs(saved.onlyFavClubs)
        setOnlyFavReeksen(saved.onlyFavReeksen)
        setOnlyMyClub(saved.onlyMyClub)
        setOnlyLive(saved.onlyLive)
      }
      const rawScroll = sessionStorage.getItem(SCROLL_STATE_KEY)
      const savedScroll = rawScroll ? (JSON.parse(rawScroll) as StoredScrollState) : null
      if (savedScroll && savedScroll.date === date) {
        // Pas echt scrollen zodra de (herstelde) lijst haar uiteindelijke vorm heeft — zie het
        // effect verderop dat naar `groups` luistert.
        pendingScrollRef.current = savedScroll.scrollY
      }
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(
        FILTER_STATE_KEY,
        JSON.stringify({ date, query, sortBy, reeksFilter, onlyFavTeams, onlyFavClubs, onlyFavReeksen, onlyMyClub, onlyLive }),
      )
    } catch {}
  }, [hydrated, date, query, sortBy, reeksFilter, onlyFavTeams, onlyFavClubs, onlyFavReeksen, onlyMyClub, onlyLive])

  // Scrollpositie wijzigt continu (i.p.v. bij een discrete filterwijziging) — een eigen, gethrottelde
  // listener i.p.v. wachten tot het verlaten van de pagina, want dat moment is in de praktijk niet
  // betrouwbaar te vangen (geen paginaverlating in de browserzin bij een SPA-navigatie).
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        try {
          sessionStorage.setItem(SCROLL_STATE_KEY, JSON.stringify({ date, scrollY: window.scrollY } satisfies StoredScrollState))
        } catch {}
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [date])

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
      fetch(`/api/live/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
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
  const reeksFav = (m: DayMatch) => favReeksen.has(m.reeks)
  // Wedstrijden van de eigen club (uit het login-account): thuis óf uit.
  const myClubMatch = (m: DayMatch) => myClubId != null && (m.home.clubId === myClubId || m.away.clubId === myClubId)
  const myClubCount = useMemo(() => (myClubId == null ? 0 : matches.filter(myClubMatch).length), [matches, myClubId])

  // Basis: alles behalve het reeks-filter toegepast, zodat de reeks-tellingen
  // tonen hoeveel er ná zoeken/live/favorieten overblijft.
  const base = useMemo(
    () =>
      combined.filter((m) => {
        if (showLiveOnly && m.status !== 'live') return false
        if (query.trim() && !matchesQuery(m, query)) return false
        // "Mijn club" beperkt tot de wedstrijden van de eigen club.
        if (onlyMyClub && !myClubMatch(m)) return false
        // Favorieten-filters combineren met OF: toon wat een favoriete ploeg óf club bevat.
        if (onlyFavTeams || onlyFavClubs || onlyFavReeksen) {
          const hit = (onlyFavTeams && teamFav(m)) || (onlyFavClubs && clubFav(m)) || (onlyFavReeksen && reeksFav(m))
          if (!hit) return false
        }
        return true
      }),
    [combined, showLiveOnly, onlyFavTeams, onlyFavClubs, onlyFavReeksen, onlyMyClub, myClubId, favTeams, favClubs, favReeksen, query],
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
  // Een dag zónder wedstrijden is iets anders dan te strenge filters: dan helpt wissen niet,
  // en sturen we de bezoeker naar een andere dag of de rest van het platform.
  const dayEmpty = matches.length === 0

  // Op tijdstip of thuis/uit: één doorlopende lijst, geen reeks-secties — handig om te zien wat er
  // nu/zo dadelijk speelt (tijdstip), of om eerst je eigen thuiswedstrijden en dan je uitwedstrijden
  // af te lopen (thuis/uit, enkel mogelijk mét een gekende eigen club). Op reeks (standaard):
  // gegroepeerd zoals voorheen, elke groep zelf al chronologisch (de matches komen al gesorteerd op
  // datum uit de databank).
  const flatSort = sortBy === 'tijd' || (sortBy === 'thuisuit' && myClubId != null)
  const byKickoff = (a: DayMatch, b: DayMatch) => a.kickoff.localeCompare(b.kickoff)
  const groups = useMemo(() => {
    if (sortBy === 'thuisuit' && myClubId != null) {
      // Thuis (mijn club speelt thuis) eerst, dan uit, dan de rest — elke groep chronologisch.
      // Die derde groep komt in de praktijk enkel voor als "Mijn club" niet ook aanstaat.
      const thuis = visible.filter((m) => m.home.clubId === myClubId).sort(byKickoff)
      const uit = visible.filter((m) => m.away.clubId === myClubId && m.home.clubId !== myClubId).sort(byKickoff)
      const overige = visible.filter((m) => m.home.clubId !== myClubId && m.away.clubId !== myClubId).sort(byKickoff)
      const flat = [...thuis, ...uit, ...overige]
      return flat.length ? ([['', flat]] as [string, DayMatch[]][]) : []
    }
    if (sortBy === 'tijd') {
      const sorted = [...visible].sort(byKickoff)
      return sorted.length ? ([['', sorted]] as [string, DayMatch[]][]) : []
    }
    const map = new Map<string, DayMatch[]>()
    for (const m of visible) {
      const arr = map.get(m.reeks) ?? []
      arr.push(m)
      map.set(m.reeks, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible, sortBy, myClubId])

  // Pas terugscrollen nadat de herstelde filters de lijst hun uiteindelijke hoogte gegeven hebben —
  // anders mikt scrollTo op een hoogte die vlak daarna nog verandert.
  useEffect(() => {
    if (pendingScrollRef.current == null) return
    const y = pendingScrollRef.current
    pendingScrollRef.current = null
    requestAnimationFrame(() => window.scrollTo(0, y))
  }, [groups])

  const dateLabel = formatDateBE(brusselsNoonUtc(date), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
  // Mag er voor deze speeldag al gepronostikeerd worden? (open vanaf zondagmiddernacht ervoor)
  const kanVoorspellen = useMemo(() => pronostiekOpen(brusselsNoonUtc(date).toISOString()), [date])

  // In weekend-weergave is `date` steeds de zaterdag (zie weekendZaterdag) — de zondag erbij voor
  // het label en de tellingen.
  const zondag = useMemo(() => shiftDate(date, 1), [date])
  const weekendLabel = useMemo(() => {
    const za = formatDateBE(brusselsNoonUtc(date), { day: '2-digit', month: 'short' })
    const zo = formatDateBE(brusselsNoonUtc(zondag), { day: '2-digit', month: 'short' })
    return `${za} – ${zo}`
  }, [date, zondag])

  // Datumnavigatie op basis van de échte speeldagen (zie speeldagen.ts). Zonder die lijst (bv. een
  // lege kalender) valt alles terug op één dag opschuiven. In weekend-weergave springen de pijltjes
  // gewoon een vol weekend (7 dagen) door — eenvoudiger en voorspelbaarder dan content-bewust naar
  // het eerstvolgende weekend mét wedstrijden zoeken.
  const dagenRef = useRef<HTMLDetailsElement>(null)
  const vorigeDag = useMemo(
    () => (view === 'weekend' ? shiftDate(date, -7) : speeldagen.length ? vorigeSpeeldag(speeldagen, date) : shiftDate(date, -1)),
    [speeldagen, date, view],
  )
  const volgendeDag = useMemo(
    () => (view === 'weekend' ? shiftDate(date, 7) : speeldagen.length ? volgendeSpeeldag(speeldagen, date) : shiftDate(date, 1)),
    [speeldagen, date, view],
  )
  const viewQS = view === 'weekend' ? '&view=weekend' : ''
  // Het hele seizoen, niet enkel een venster van een paar weken — de kiezer scrolt toch al
  // binnen z'n eigen vak (zie .lb-dagen), en anders leek de agenda na een paar weken op te houden.
  const venster = useMemo(() => (speeldagen.length ? alleSpeeldagen(speeldagen, date) : []), [speeldagen, date])
  const aantalVandaag = useMemo(() => speeldagen.find((d) => d.datum === date)?.aantal ?? 0, [speeldagen, date])
  const aantalWeekend = useMemo(() => aantalOp(speeldagen, date) + aantalOp(speeldagen, zondag), [speeldagen, date, zondag])

  // "Bewaar als standaard": schrijft de dag/weekend-keuze weg in een cookie (1 jaar geldig), zodat
  // elke gebruiker zijn eigen voorkeur terugkrijgt bij een volgend bezoek zonder ?view= in de URL
  // (zie de server-side cookie-lezing in page.tsx/live/page.tsx). Geen router.refresh() nodig: de
  // huidige weergave verandert niet, enkel wat een VOLGEND bezoek standaard toont.
  const [savedView, setSavedView] = useState<LiveView | null>(null)
  const [viewSaveFlash, setViewSaveFlash] = useState(false)
  useEffect(() => {
    try {
      const m = document.cookie.match(new RegExp(`(?:^|; )${LIVE_VIEW_COOKIE}=([^;]*)`))
      setSavedView(m?.[1] === 'weekend' ? 'weekend' : 'dag')
    } catch {
      setSavedView('dag')
    }
  }, [])
  const saveView = () => {
    try {
      document.cookie = `${LIVE_VIEW_COOKIE}=${view}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    } catch {}
    setSavedView(view)
    setViewSaveFlash(true)
    window.setTimeout(() => setViewSaveFlash(false), 1800)
  }
  const viewIsSaved = savedView === view

  const emptyReason = query.trim()
    ? ` voor “${query.trim()}”`
    : showLiveOnly
      ? ' live'
      : onlyFavTeams || onlyFavClubs
        ? ' bij je favorieten'
        : onlyFavReeksen
          ? ' bij je favoriete reeksen'
          : ''

  // Filterlade sluit ook met Escape — een lade is een modaal blok, dat hoort erbij.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="lb">
      <main className="lb-main">
        <div className="lb-datenav">
          {/* De pijltjes springen naar de vorige/volgende dag waar écht gespeeld wordt. In een
              competitie die enkel in het weekend speelt, scheelt dat vier tikken op leegte.
              Is er niets meer in die richting, dan staat de pijl uit i.p.v. naar een lege dag te
              leiden. Zijn er (nog) geen speeldagen bekend, dan valt alles terug op één dag
              opschuiven — beter dan een dood bord. */}
          {vorigeDag ? (
            <Link href={`/?date=${vorigeDag}${viewQS}`} className="lb-datebtn" aria-label={view === 'weekend' ? 'Vorig weekend' : 'Vorige speeldag'}>‹</Link>
          ) : (
            <span className="lb-datebtn uit" aria-hidden>‹</span>
          )}
          <details
            className="lb-date"
            ref={dagenRef}
            onToggle={(e) => {
              // Bij het hele seizoen in de lijst (i.p.v. een klein venster) moet de kiezer bij
              // openen meteen naar de huidige dag springen — anders begin je bovenaan in augustus.
              if (!(e.target as HTMLDetailsElement).open) return
              requestAnimationFrame(() => {
                dagenRef.current?.querySelector('.lb-dag.nu')?.scrollIntoView({ block: 'center' })
              })
            }}
          >
            <summary className="lb-datesum">
              <span className="lb-datelabel">{view === 'weekend' ? 'Weekend' : date === today ? 'Vandaag' : dateLabel}</span>
              <span className="lb-datesub">
                {view === 'weekend' ? weekendLabel : date.split('-').reverse().join('-')}
                {(view === 'weekend' ? aantalWeekend : aantalVandaag) > 0 && (
                  <span className="lb-datecount">{view === 'weekend' ? aantalWeekend : aantalVandaag}</span>
                )}
                <span aria-hidden> ⌄</span>
              </span>
            </summary>
            <div className="lb-dagen">
              {venster.length === 0 ? (
                <p className="lb-dagen-leeg">Nog geen wedstrijden ingepland.</p>
              ) : (
                venster.map((d) => (
                  // Een specifieke dag kiezen betekent altijd "toon MIJ die ene dag" — ook vanuit
                  // weekend-weergave, dus expliciet &view=dag i.p.v. terugvallen op de bewaarde
                  // voorkeur (die zou de gekozen dag anders meteen terug naar haar weekend trekken).
                  <Link
                    key={d.datum}
                    href={`/?date=${d.datum}&view=dag`}
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
                  onChange={(e) => e.target.value && router.push(`/?date=${e.target.value}&view=dag`)}
                  aria-label="Kies datum"
                />
              </label>
            </div>
          </details>
          {volgendeDag ? (
            <Link href={`/?date=${volgendeDag}${viewQS}`} className="lb-datebtn" aria-label={view === 'weekend' ? 'Volgend weekend' : 'Volgende speeldag'}>›</Link>
          ) : (
            <span className="lb-datebtn uit" aria-hidden>›</span>
          )}
        </div>

        {/* Dag/weekend-keuze + persoonlijke voorkeur bewaren. Enkel de datumbalk hierboven blijft
            plakken tijdens het scrollen (zie .lb-datenav in live.css) — deze rij hoort er wel
            logisch bij maar hoeft zelf niet mee te scrollen. */}
        <div className="lb-viewrow">
          <div className="lb-viewtoggle" role="group" aria-label="Dag of weekend bekijken">
            <Link href={`/?date=${date}&view=dag`} className={`lb-view-btn ${view === 'dag' ? 'on' : ''}`}>
              📅 Dag
            </Link>
            <Link href={`/?date=${date}&view=weekend`} className={`lb-view-btn ${view === 'weekend' ? 'on' : ''}`}>
              🗓 Weekend
            </Link>
          </div>
          <button
            type="button"
            className={`lb-view-save ${viewIsSaved && !viewSaveFlash ? 'saved' : ''}`}
            onClick={saveView}
            disabled={viewIsSaved && !viewSaveFlash}
            title="Onthoud deze keuze (dag/weekend) voor je volgende bezoek"
          >
            {viewSaveFlash ? '✓ Bewaard' : viewIsSaved ? '✓ Jouw standaard' : '💾 Bewaar als standaard'}
          </button>
        </div>

        {/* Enkel de zoekbalk blijft vast in beeld (het meest gebruikte pad — je eigen ploeg
            typen); reeks/live/mijn club/favorieten zitten achter één "Filters"-knop die een lade
            opent. Wint de meeste ruimte voor de wedstrijden zelf. */}
        <div className="lb-searchrow">
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
          <button type="button" className="lb-filterbtn" onClick={() => setDrawerOpen(true)}>
            🔎 Filters
            {activeCount > 0 && <span className="lb-filterbadge">{activeCount}</span>}
          </button>
        </div>

        <PushOptIn />

        {/* Je zoekt hier meestal je eigen ploeg. De zoekbalk toont nu ook wat er elders in het
            seizoen speelt (zie searchSeizoen/extra hierboven, met een datumtag per kaart), maar
            voor de volledige agenda (met kalender-export) blijft deze link de diepere route. */}
        {query.trim().length >= 2 && (
          <Link href={`/zoeken?ploeg=${encodeURIComponent(query.trim())}`} className="lb-wanneer">
            📅 Wanneer speelt <b>{query.trim()}</b> nog? Bekijk de hele agenda →
          </Link>
        )}

        {!dayEmpty && groups.length > 0 && (
          <div className="lb-sort">
            <span className="lb-sort-lbl">Sorteer</span>
            <button type="button" className={`lb-sort-btn ${sortBy === 'reeks' ? 'on' : ''}`} onClick={() => setSortBy('reeks')}>
              🏷 Reeks
            </button>
            <button type="button" className={`lb-sort-btn ${sortBy === 'tijd' ? 'on' : ''}`} onClick={() => setSortBy('tijd')}>
              ⏱ Tijdstip
            </button>
            {myClubId != null && (
              <button type="button" className={`lb-sort-btn ${sortBy === 'thuisuit' ? 'on' : ''}`} onClick={() => setSortBy('thuisuit')}>
                🏠 Thuis/Uit
              </button>
            )}
          </div>
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
                <p className="lb-empty-title">
                  Geen wedstrijden {view === 'weekend' ? 'dit weekend' : date === today ? 'vandaag' : 'op deze dag'}.
                </p>
                <p className="lb-empty-sub">Spring naar een andere dag of ontdek de rest van het platform.</p>
                <div className="lb-empty-actions">
                  <Link href={`/?date=${shiftDate(date, view === 'weekend' ? 7 : 1)}${viewQS}`} className="lb-empty-btn primary">
                    {view === 'weekend' ? 'Volgend weekend ›' : 'Volgende dag ›'}
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
            const isCollapsed = !flatSort && collapsed.has(reeks)
            const liveInGroup = list.filter((m) => m.status === 'live').length
            return (
            <section key={reeks || '__flat__'} className={`lb-group ${isCollapsed ? 'collapsed' : ''}`}>
              {!flatSort && (
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
                    title={favReeksen.has(reeks) ? 'Verwijder reeksfavoriet' : 'Maak reeks favoriet'}
                  >
                    {favReeksen.has(reeks) ? '★' : '☆'}
                  </button>
                </div>
              )}
              {!isCollapsed && list.map((m) => {
                const played = m.status !== 'scheduled'
                const live = m.status === 'live'
                const hasStats = played && (m.crosses || m.timeouts)
                const rowFav = teamFav(m) || clubFav(m)
                const open = openRow === m.id
                // Bij tijdstip/thuis-uit sorteren en/of een actieve zoekopdracht over meerdere
                // dagen (searchSeizoen) vervangt dit tagje de reeks-kop van de groep.
                const tags = [
                  sortBy === 'thuisuit' && myClubId != null
                    ? m.home.clubId === myClubId
                      ? '🏠 Thuis'
                      : m.away.clubId === myClubId
                        ? '✈ Uit'
                        : null
                    : null,
                  flatSort ? m.reeks : null,
                  // In weekend-weergave (za+zo door elkaar) én bij een zoekopdracht over meerdere
                  // dagen (searchSeizoen): toon per kaart op welke dag ze precies valt.
                  view === 'weekend' || query.trim().length >= 2 ? dagLabel(dateStrBE(new Date(m.kickoff)), today) : null,
                ].filter((t): t is string => Boolean(t))
                return (
                  <div key={m.id} className="lb-rowwrap">
                    {tags.length > 0 && <span className="lb-row-reeks">{tags.join(' · ')}</span>}
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

      {drawerOpen && (
        <div className="lb-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="lb-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filters">
            <div className="lb-sheet-head">
              <h3>Filters</h3>
              <button type="button" className="lb-sheet-close" onClick={() => setDrawerOpen(false)} aria-label="Sluit">✕</button>
            </div>

            <div className="lb-sheet-body">
              {(liveCount > 0 || myClubId != null) && (
                <section className="lb-sheet-section">
                  <h4>Snelfilters</h4>
                  <div className="lb-sheet-row">
                    {liveCount > 0 && (
                      <button type="button" className={`lb-reeks fav live ${showLiveOnly ? 'on' : ''}`} onClick={() => setOnlyLive((v) => !v)}>
                        <span className="lb-livedot" /> Nu live
                        <span className="lb-reeks-n">{liveCount}</span>
                      </button>
                    )}
                    {myClubId != null && (
                      <button type="button" className={`lb-reeks fav ${onlyMyClub ? 'on' : ''}`} onClick={() => setOnlyMyClub((v) => !v)}>
                        <span>🏠 Mijn club</span>
                        {myClubCount > 0 && <span className="lb-reeks-n">{myClubCount}</span>}
                      </button>
                    )}
                  </div>
                </section>
              )}

              <section className="lb-sheet-section">
                <h4>Reeks</h4>
                <div className="lb-reekslist">
                  <button type="button" className={`lb-reeksrow ${reeksFilter == null ? 'on' : ''}`} onClick={() => setReeksFilter(null)}>
                    <span>Alle reeksen</span>
                    <span className="lb-reeks-n">{base.length}</span>
                  </button>
                  {reeksen.map(([r, n]) => (
                    <button
                      key={r}
                      type="button"
                      className={`lb-reeksrow ${reeksFilter === r ? 'on' : ''}`}
                      onClick={() => setReeksFilter(reeksFilter === r ? null : r)}
                    >
                      <span>{r}</span>
                      <span className="lb-reeks-n">{n}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="lb-sheet-section">
                <h4>Favorieten</h4>
                <div className="lb-sheet-row">
                  <button type="button" className={`lb-reeks fav ${onlyFavTeams ? 'on' : ''}`} onClick={() => setOnlyFavTeams((v) => !v)}>
                    <span>★ Ploegen</span>
                    {favTeams.size > 0 && <span className="lb-reeks-n">{favTeams.size}</span>}
                  </button>
                  <button type="button" className={`lb-reeks fav ${onlyFavClubs ? 'on' : ''}`} onClick={() => setOnlyFavClubs((v) => !v)}>
                    <span>★ Clubs</span>
                    {favClubs.size > 0 && <span className="lb-reeks-n">{favClubs.size}</span>}
                  </button>
                  <button type="button" className={`lb-reeks fav ${onlyFavReeksen ? 'on' : ''}`} onClick={() => setOnlyFavReeksen((v) => !v)}>
                    <span>★ Reeksen</span>
                    {favReeksen.size > 0 && <span className="lb-reeks-n">{favReeksen.size}</span>}
                  </button>
                </div>
              </section>
            </div>

            <div className="lb-sheet-foot">
              <button type="button" className="lb-empty-btn" onClick={clearFilters}>↺ Wis filters</button>
              <button type="button" className="lb-empty-btn primary" onClick={() => setDrawerOpen(false)}>
                Toon {visible.length} wedstrijden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
