import { brusselsDayBoundsUtc, brusselsNoonUtc, brusselsParts, dateStrBE, formatTimeBE, shiftDateStr } from '@/lib/datetime'
import { purgeExpiredDemos } from '@/lib/demo'
import { buildScoreboards, type ScoreboardData } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { MATCH_ASSUMED_DONE_MS } from '@/lib/simple-score'
import type { Speeldag } from '@/lib/speeldagen'
import { pastBijZoekterm } from '@/lib/team-search'

import type { DayMatch } from './LiveBoard'

// Leesbare reeksnaam zonder code-prefix (bv. "1ste Nationale Dames" i.p.v. "1NAD — …").
const reeksLabel = (v: unknown) => reeksNaam(v)

// Dag-grenzen in Belgische tijd (de server draait in UTC) zodat avondwedstrijden op de juiste dag
// vallen.
const dayBounds = (dateStr: string) => brusselsDayBoundsUtc(dateStr)

/**
 * Welke dag moet een bezoeker zonder expliciete `?date=` te zien krijgen? Vandaag als daar al iets
 * gepland/bezig is — anders de eerstvolgende dag mét een wedstrijd (bv. in augustus, vóór de
 * seizoensstart in september), zodat het bord nooit blanco opent en een bezoeker altijd meteen de
 * eerstvolgende wedstrijden ziet i.p.v. zelf te moeten doorklikken. Niets gepland in de toekomst?
 * Dan blijft "vandaag" de terugval (bestaande lege-staat met een link naar de volgende dag).
 */
export async function resolveDefaultDay(today: string): Promise<string> {
  const payload = await getPayloadClient()
  const { start: todayStart, end: todayEnd } = dayBounds(today)
  // "Vandaag" telt als geldig zodra er vandaag zelf iets staat (binnen de daggrenzen), of als er
  // een wedstrijd LIVE is (ongeacht de datum erop — een match die gisterenavond begon kan nog
  // steeds bezig zijn), zelfde logica als loadLiveDay(). Let op: NIET "datum >= vandaag" alleen —
  // dat is altijd waar zodra er ooit nog een toekomstige wedstrijd bestaat.
  const heeftVandaag = await payload
    .count({
      collection: 'matches',
      where: {
        and: [
          {
            or: [
              { and: [{ date: { greater_than_equal: todayStart } }, { date: { less_than: todayEnd } }] },
              { status: { equals: 'live' } },
            ],
          },
          { analyseOnly: { not_equals: true } },
          { isDemo: { not_equals: true } },
        ],
      },
      overrideAccess: true,
    })
    .catch(() => ({ totalDocs: 0 }))
  if (heeftVandaag.totalDocs > 0) return today

  const eerstvolgende = await payload
    .find({
      collection: 'matches',
      // Zoek strikt vanaf het begin van vandaag. Zonder deze grens gaf de oplopende sortering
      // altijd de oudste wedstrijd van het seizoen terug, waardoor maandag het voorbije weekend
      // opnieuw op de homepage verscheen.
      where: {
        and: [
          { date: { greater_than_equal: todayStart } },
          { analyseOnly: { not_equals: true } },
          { isDemo: { not_equals: true } },
        ],
      },
      sort: 'date',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as { date?: unknown }[] }))
  const datumVeld = eerstvolgende.docs[0]?.date
  if (!datumVeld) return today
  const d = new Date(String(datumVeld))
  return Number.isNaN(d.getTime()) ? today : dateStrBE(d)
}

/**
 * Laadt alle wedstrijden voor een [start, end)-venster (ISO-instants) + de actueel-live
 * wedstrijden (wanneer dat venster vandaag bevat) en berekent voor elk de afgeleide stand. De
 * stand wordt GEBATCHT opgebouwd (buildScoreboards: enkele queries voor alle wedstrijden samen)
 * i.p.v. per wedstrijd — schaalt naar een vol weekend (100+ wedstrijden). Gedeeld door
 * loadLiveDay (één dag) en loadLiveWeekend (za+zo) hieronder.
 */
async function loadRange(start: string, end: string, includeLive: boolean): Promise<DayMatch[]> {
  const payload = await getPayloadClient()
  // Ruim meteen vervallen demo's op (best-effort) — zo verdwijnen ze ~binnen het uur,
  // ook zonder dat iemand de demo opent.
  await purgeExpiredDemos(payload).catch(() => undefined)
  // Analyse-only én demo-wedstrijden zijn nooit publiek/live zichtbaar.
  const dayRes = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { date: { greater_than_equal: start, less_than: end } },
        { analyseOnly: { not_equals: true } },
        { isDemo: { not_equals: true } },
      ],
    },
    sort: 'date',
    depth: 0,
    limit: 500,
  })

  // Live wedstrijden altijd tonen wanneer het venster vandaag bevat — ook al staat hun datum anders.
  const liveRes = includeLive
    ? await payload.find({
        collection: 'matches',
        where: {
          and: [{ status: { equals: 'live' } }, { analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }],
        },
        depth: 0,
        limit: 100,
      })
    : { docs: [] as (typeof dayRes)['docs'] }

  const seen = new Set<number>()
  const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })

  const cards = await buildScoreboards(payload, docs)
  return cardsToDayMatches(docs, cards)
}

// Gedeeld door /live en de startpagina.
export async function loadLiveDay(selected: string, today: string): Promise<DayMatch[]> {
  const { start, end } = dayBounds(selected)
  return loadRange(start, end, selected === today)
}

/** De zaterdag van het weekend waarin `dateStr` valt: za/zo blijft op hetzelfde weekend, een
 *  weekdag springt vooruit naar het eerstvolgende weekend. */
export function weekendZaterdag(dateStr: string): string {
  const wd = brusselsParts(brusselsNoonUtc(dateStr)).weekdayMon0 // 0=ma … 6=zo
  return wd === 6 ? shiftDateStr(dateStr, -1) : shiftDateStr(dateStr, 5 - wd)
}

/** Laadt een heel weekend (zaterdag + zondag) in één keer — de weekend-weergave van het bord. */
export async function loadLiveWeekend(zaterdag: string, today: string): Promise<DayMatch[]> {
  const zondag = shiftDateStr(zaterdag, 1)
  const { start } = dayBounds(zaterdag)
  const { end } = dayBounds(zondag)
  return loadRange(start, end, today >= zaterdag && today <= zondag)
}

/**
 * Zet ruwe match-docs + hun opgebouwde stand (buildScoreboards) om naar het DayMatch-formaat dat
 * het bord tekent. Gedeeld door loadLiveDay hierboven en searchSeizoen hieronder, zodat een
 * wedstrijd er hetzelfde uitziet ongeacht via welk pad ze geladen werd.
 */
function cardsToDayMatches(docs: { id: number; date?: unknown; reeks?: unknown }[], cards: Map<number, ScoreboardData>): DayMatch[] {
  // Auto-live: een geplande wedstrijd waarvan het ingestelde uur al voorbij is, tonen we als "live"
  // (ook al heeft nog niemand ze gestart). Instant-vergelijking → tijdzone-onafhankelijk.
  // MAAR: dat venster is begrensd. Een match die uren geleden begon en nooit genoteerd werd, is
  // in werkelijkheid gedaan — die eeuwig "LIVE 0–0" tonen misleidt. Na het venster markeren we ze
  // als "wacht op uitslag": het bord toont dan een uitslag-vraagteken i.p.v. een live-badge, en
  // supporters kunnen de eindstand doorgeven (zie ReportResult op de matchpagina).
  const now = Date.now()

  const days: DayMatch[] = []
  for (const m of docs) {
    const c = cards.get(m.id)
    if (!c) continue // ontbrekende ploeg → overslaan (zoals voorheen)
    const kickoffTs = new Date(m.date as string).getTime()
    const autoLive = c.status === 'scheduled' && kickoffTs <= now && now - kickoffTs < MATCH_ASSUMED_DONE_MS
    const awaitingResult = c.status === 'scheduled' && now - kickoffTs >= MATCH_ASSUMED_DONE_MS
    const hw = c.teams.home
    days.push({
      id: m.id,
      reeks: reeksLabel(m.reeks),
      time: formatTimeBE(m.date as string),
      kickoff: String(m.date),
      status: autoLive ? 'live' : c.status,
      awaitingResult,
      weather: { plaats: hw.plaats, lat: hw.lat, lng: hw.lng },
      home: { teamId: c.teams.home.id, name: c.teams.home.name, logoUrl: c.teams.home.logoUrl, logoFit: c.teams.home.logoFit, colors: c.teams.home.colors, clubId: c.teams.home.clubId, clubName: c.teams.home.clubName },
      away: { teamId: c.teams.away.id, name: c.teams.away.name, logoUrl: c.teams.away.logoUrl, logoFit: c.teams.away.logoFit, colors: c.teams.away.colors, clubId: c.teams.away.clubId, clubName: c.teams.away.clubName },
      score: c.score,
      crosses: c.crosses,
      timeouts: c.timeouts,
      refereeStops: c.refereeStops,
    })
  }
  return days
}

/**
 * Zoekt "ploeg of reeks" over het HELE seizoen (niet enkel de geselecteerde dag) — voedt de
 * uitgebreide zoekresultaten op /demo/filters: typ je een ploeg/reeks in, dan zie je niet enkel de
 * treffers van vandaag maar ook wat er nog komt en al gespeeld is, elders in de kalender.
 * Zelfde vind-regels als het bord zelf (team-search.ts), enkel niet beperkt tot één dag.
 */
export async function searchSeizoen(query: string, limit = 60): Promise<DayMatch[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const payload = await getPayloadClient()
  const res = await payload
    .find({
      collection: 'matches',
      where: { and: [{ analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }] },
      sort: 'date',
      depth: 0,
      limit: 3000,
    })
    .catch(() => ({ docs: [] as { id: number; date?: unknown; reeks?: unknown; homeTeam: unknown; awayTeam: unknown }[] }))
  if (res.docs.length === 0) return []

  const cards = await buildScoreboards(payload, res.docs)
  const all = cardsToDayMatches(res.docs, cards)
  const matched = all.filter((m) => pastBijZoekterm(q, m.home.name, m.away.name, m.home.clubName, m.away.clubName, m.reeks))
  return matched.slice(0, limit)
}

/**
 * Alle dagen waarop er gespeeld wordt, met hoeveel wedstrijden er die dag staan. Voedt de
 * datumnavigatie: de pijltjes springen naar de volgende dag waar écht iets staat (i.p.v. vier
 * lege dagen door te tikken tot het weekend), en de kiezer toont per dag een teller.
 *
 * Eén query over de hele kalender, met enkel het datumveld — dat weegt niet, ook niet met een
 * volledig seizoen erin.
 */
export async function loadSpeeldagen(): Promise<Speeldag[]> {
  const payload = await getPayloadClient()
  const res = await payload
    .find({
      collection: 'matches',
      where: { and: [{ analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }] },
      sort: 'date',
      depth: 0,
      pagination: false,
      select: { date: true },
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as { date?: unknown }[] }))

  const perDag = new Map<string, number>()
  for (const m of res.docs) {
    const ruw = (m as { date?: unknown }).date
    if (!ruw) continue
    const d = new Date(String(ruw))
    if (Number.isNaN(d.getTime())) continue
    const dag = dateStrBE(d)
    perDag.set(dag, (perDag.get(dag) ?? 0) + 1)
  }
  return [...perDag.entries()]
    .map(([datum, aantal]) => ({ datum, aantal }))
    .sort((a, b) => a.datum.localeCompare(b.datum))
}
