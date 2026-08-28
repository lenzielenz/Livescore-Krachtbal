// Server-side tornooi-engine: maakt het schema aan, leidt de live-state af en verwerkt de
// aantekenaar-acties (start, doelpunt, undo, klok, helft, einde). De winnaar (en bij halve finales
// de verliezer) schuift bij het beëindigen automatisch door naar het volgende slot.
//
// Alle mutaties draaien met overrideAccess (server is vertrouwd), net als de match-engine.

import type { Payload } from 'payload'

import { CATEGORIES, type Category, categoryConfig } from './categories'
import {
  type Bracket,
  type Goal,
  type Side,
  type SlotRef,
  type Standing,
  buildBracket,
  buildRoundRobin,
  computeStandings,
  deriveScore,
  loserName,
  resolveWinner,
  winnerName,
} from './tournament'

export type TournamentFormat = 'knockout' | 'roundrobin'

export type TMatchState = {
  id: number
  round: number
  position: number
  bracket: Bracket
  label: string
  home: string | null
  away: string | null
  status: 'pending' | 'live' | 'finished'
  winner: Side | null
  score: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: number; away: number }
  refereeStops: number
  currentHalf: number
  clockSeconds: number
  clockRunning: boolean
  /** Gepland aanvangsuur (ISO) — het groep-kantinescherm telt hiernaar af. */
  plannedAt: string | null
  /** Laatst genoteerde doelpunt — wat "undo" zou wegnemen; voedt ook de kantine-viering. */
  lastGoal: { side: Side; points: 1 | 2 } | null
}

export type TournamentState = {
  id: number
  name: string
  category: Category
  status: 'live' | 'finished'
  method: string
  format: TournamentFormat
  halfDurationSeconds: number
  rounds: { round: number; label: string; matches: TMatchState[] }[]
  thirdPlace: TMatchState | null
  champion: string | null
  /** Enkel bij round-robin: de live rangschikking. */
  standings?: Standing[]
}

type MatchDoc = {
  id: number
  round: number
  position: number
  bracket: Bracket
  label?: string | null
  home?: string | null
  away?: string | null
  status: 'pending' | 'live' | 'finished'
  winner?: Side | null
  goals?: Goal[] | null
  crosses?: { home?: number; away?: number } | null
  timeouts?: { home?: number; away?: number } | null
  refereeStops?: number | null
  winnerTo?: SlotRef | null
  loserTo?: SlotRef | null
  currentHalf?: number | null
  clockSeconds?: number | null
  clockRunning?: boolean | null
  clockUpdatedAt?: string | null
  plannedAt?: string | null
}

const COLL = 'tournament-matches' as const

function goalsOf(m: Pick<MatchDoc, 'goals'>): Goal[] {
  return Array.isArray(m.goals) ? (m.goals as Goal[]) : []
}

function countsOf(v: { home?: number; away?: number } | null | undefined): { home: number; away: number } {
  return { home: Number(v?.home) || 0, away: Number(v?.away) || 0 }
}

/** Live klokstand: lopende klok telt verder vanaf clockUpdatedAt. */
function liveClock(m: Pick<MatchDoc, 'clockRunning' | 'clockUpdatedAt' | 'clockSeconds'>): number {
  const base = m.clockSeconds ?? 0
  if (!m.clockRunning || !m.clockUpdatedAt) return base
  const elapsed = (Date.now() - new Date(m.clockUpdatedAt).getTime()) / 1000
  return base + Math.max(0, elapsed)
}

function toState(m: MatchDoc): TMatchState {
  const goals = goalsOf(m)
  const laatste = goals.length ? goals[goals.length - 1] : null
  return {
    id: m.id,
    round: m.round,
    position: m.position,
    bracket: m.bracket,
    label: m.label ?? '',
    home: m.home ?? null,
    away: m.away ?? null,
    status: m.status,
    winner: m.winner ?? null,
    score: deriveScore(goals),
    crosses: countsOf(m.crosses),
    timeouts: countsOf(m.timeouts),
    refereeStops: Number(m.refereeStops) || 0,
    currentHalf: m.currentHalf ?? 1,
    clockSeconds: Math.floor(liveClock(m)),
    clockRunning: Boolean(m.clockRunning),
    plannedAt: (m as { plannedAt?: string | null }).plannedAt ?? null,
    lastGoal: laatste ? { side: laatste.side, points: laatste.points === 2 ? 2 : 1 } : null,
  }
}

async function loadMatches(payload: Payload, tournamentId: number): Promise<MatchDoc[]> {
  const res = await payload.find({
    collection: COLL,
    where: { tournament: { equals: tournamentId } },
    sort: ['round', 'position'],
    depth: 0,
    limit: 500,
  })
  return res.docs as unknown as MatchDoc[]
}

/**
 * Maak een nieuw tornooi met zijn volledige schema aan vanuit een geordende slot-lijst
 * (lengte = macht van 2; null = bye). Geeft het tornooi-id terug.
 */
export async function createTournament(
  payload: Payload,
  args: {
    name: string
    category: Category
    method: 'manual' | 'auto'
    slots: (string | null)[]
    format?: TournamentFormat
    /** Expliciete koppeling ploegnaam → club (betrouwbaar logo + club gekoppeld). */
    teamClubs?: { name: string; clubId: number }[]
    /** Koppeling ploegnaam → echte ploeg (Teams) zodat de aantekentafel de spelers kan laden. */
    teamTeams?: { name: string; teamId: number }[]
    /** Toon de lopende wedstrijden van deze beker bovenaan de live-pagina. */
    toonOpLive?: boolean
    /** Hoofdgroep/tornooidag (bv. "Beker van Brugge") die meerdere reeksen bundelt. */
    groep?: string
    /** Organiserende club: logo + kleuren bepalen de look van het groep-kantinescherm. */
    hostClub?: number
    /** Geplande uren (ISO of null) per ronde-1-wedstrijd, in bracket-volgorde. */
    plannedTimes?: (string | null)[]
  },
): Promise<number> {
  const format: TournamentFormat = args.format === 'roundrobin' ? 'roundrobin' : 'knockout'
  const filled = args.slots.filter((s): s is string => Boolean(s))
  if (filled.length < 2) throw new Error('Een tornooi heeft minstens 2 ploegen nodig.')

  const bracket = format === 'roundrobin' ? buildRoundRobin(filled) : buildBracket(args.slots)
  // Knock-out: verbied een wedstrijd zonder enige ploeg (twee bye's tegenover elkaar).
  if (format === 'knockout') {
    for (const m of bracket) {
      if (m.round === 1 && m.bracket === 'main' && !m.home && !m.away) {
        throw new Error('Ongeldige loting: een wedstrijd zonder ploegen. Verdeel de bye’s anders.')
      }
    }
  }

  const tournament = await payload.create({
    collection: 'tournaments',
    data: {
      name: args.name,
      category: args.category,
      method: args.method,
      format,
      status: 'live',
      teamCount: filled.length,
      toonOpLive: Boolean(args.toonOpLive),
      ...(args.groep?.trim() ? { groep: args.groep.trim() } : {}),
      ...(args.hostClub != null && Number.isFinite(args.hostClub) ? { hostClub: args.hostClub } : {}),
      ...(args.teamClubs && args.teamClubs.length ? { teamClubs: args.teamClubs } : {}),
      ...(args.teamTeams && args.teamTeams.length ? { teamTeams: args.teamTeams } : {}),
    },
    overrideAccess: true,
  })

  // Wedstrijden in schema-volgorde aanmaken (bye-wedstrijden zijn al 'finished' met winnaar).
  // De geplande uren gelden per ronde-1-slot, in dezelfde volgorde als de preview toonde.
  let ronde1Index = 0
  for (const m of bracket) {
    const gepland = m.round === 1 && m.bracket === 'main' ? args.plannedTimes?.[ronde1Index++] : undefined
    await payload.create({
      collection: COLL,
      data: {
        tournament: tournament.id,
        round: m.round,
        position: m.position,
        bracket: m.bracket,
        label: m.label,
        home: m.home,
        away: m.away,
        status: m.status,
        winner: m.winner ?? undefined,
        goals: [],
        winnerTo: m.winnerTo ?? undefined,
        loserTo: m.loserTo ?? undefined,
        currentHalf: 1,
        clockSeconds: 0,
        clockRunning: false,
        ...(gepland ? { plannedAt: gepland } : {}),
      },
      overrideAccess: true,
    })
  }

  return tournament.id
}

/** Volledige live-state van een tornooi voor het schema-, veld- en kantinescherm. */
export async function buildTournamentState(payload: Payload, tournamentId: number): Promise<TournamentState> {
  const t = await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 })
  const docs = await loadMatches(payload, tournamentId)
  const states = docs.map(toState)

  const mainByRound = new Map<number, TMatchState[]>()
  let thirdPlace: TMatchState | null = null
  for (const s of states) {
    if (s.bracket === 'third') {
      thirdPlace = s
      continue
    }
    const arr = mainByRound.get(s.round) ?? []
    arr.push(s)
    mainByRound.set(s.round, arr)
  }

  const rounds = [...mainByRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, matches]) => ({
      round,
      label: matches[0]?.label ?? `Ronde ${round}`,
      matches: matches.sort((a, b) => a.position - b.position),
    }))

  const format: TournamentFormat = (t as { format?: string }).format === 'roundrobin' ? 'roundrobin' : 'knockout'

  // Round-robin: rangschikking uit alle wedstrijden; kampioen = leider als alles gespeeld is.
  let standings: Standing[] | undefined
  let champion: string | null
  if (format === 'roundrobin') {
    const teams = [...new Set(states.flatMap((s) => [s.home, s.away]).filter((n): n is string => Boolean(n)))]
    standings = computeStandings(states, teams)
    champion = t.status === 'finished' ? (standings[0]?.team ?? null) : null
  } else {
    const finalRound = rounds[rounds.length - 1]
    const finalMatch = finalRound?.matches.find((m) => m.bracket === 'main')
    champion = finalMatch?.status === 'finished' && finalMatch.winner ? finalMatch[finalMatch.winner] : null
  }

  return {
    id: t.id,
    name: t.name as string,
    category: t.category as Category,
    status: t.status as 'live' | 'finished',
    method: (t.method as string) ?? 'auto',
    format,
    halfDurationSeconds: categoryConfig(t.category as Category).halfDurationSeconds,
    rounds,
    thirdPlace,
    champion,
    standings,
  }
}

async function getMatch(payload: Payload, matchId: number): Promise<MatchDoc> {
  return (await payload.findByID({ collection: COLL, id: matchId, depth: 0 })) as unknown as MatchDoc
}

async function update(payload: Payload, matchId: number, data: Partial<MatchDoc>): Promise<void> {
  await payload.update({ collection: COLL, id: matchId, data: data as Record<string, unknown>, overrideAccess: true })
}

/** Start (of hervat) een wedstrijd: beide ploegen moeten gekend zijn. */
export async function startMatch(payload: Payload, matchId: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  if (!m.home || !m.away) throw new Error('Beide ploegen moeten gekend zijn voor de start.')
  if (m.status === 'finished') throw new Error('Deze wedstrijd is al afgelopen.')
  await update(payload, matchId, {
    status: 'live',
    clockRunning: true,
    clockUpdatedAt: new Date().toISOString(),
  })
}

/** Een scorer (optioneel) — gevuld als de tornooiploeg aan een echte ploeg gekoppeld is. */
export type GoalScorer = { id: number; shirtNumber?: number; name?: string }

/** Registreer een doelpunt: nekworp = 1, rugworp = 2 (telt dubbel). De scorer is optioneel. */
export async function recordGoal(
  payload: Payload,
  matchId: number,
  side: Side,
  points: 1 | 2,
  scorer?: GoalScorer,
): Promise<void> {
  const m = await getMatch(payload, matchId)
  if (m.status === 'finished') throw new Error('Deze wedstrijd is al afgelopen.')
  const goals = goalsOf(m)
  goals.push({
    side,
    points,
    half: m.currentHalf ?? 1,
    clock: Math.floor(liveClock(m)),
    ts: Date.now(),
    ...(scorer?.id ? { scorerId: scorer.id, scorerNumber: scorer.shirtNumber, scorerName: scorer.name } : {}),
  })
  await update(payload, matchId, { goals, status: m.status === 'pending' ? 'live' : m.status })
}

/** Pas de scheidsrechter-minuten (gestopte tijd) aan (+1 / −1). */
export async function recordRefereeStop(payload: Payload, matchId: number, delta: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  const next = Math.max(0, (Number(m.refereeStops) || 0) + (delta < 0 ? -1 : 1))
  await update(payload, matchId, { refereeStops: next })
}

/** Neem het laatste doelpunt terug (vangnet). */
export async function undoGoal(payload: Payload, matchId: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  const goals = goalsOf(m)
  goals.pop()
  await update(payload, matchId, { goals })
}

/** Pas de kruisjes-teller van een ploeg aan (+1 / −1). */
export async function recordCross(payload: Payload, matchId: number, side: Side, delta: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  const c = countsOf(m.crosses)
  c[side] = Math.max(0, c[side] + (delta < 0 ? -1 : 1))
  await update(payload, matchId, { crosses: c })
}

/** Pas de time-out-teller (aangevraagde minuten) van een ploeg aan (+1 / −1). */
export async function recordTimeout(payload: Payload, matchId: number, side: Side, delta: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  const t = countsOf(m.timeouts)
  t[side] = Math.max(0, t[side] + (delta < 0 ? -1 : 1))
  await update(payload, matchId, { timeouts: t })
}

/** Klok starten/pauzeren of de tijd zetten. Bij pauzeren wordt de verstreken tijd vastgeklikt. */
/** Gepland aanvangsuur zetten of wissen (tornooidag-planning; voedt het aftellen op de kantine). */
export async function planMatch(payload: Payload, matchId: number, plannedAtIso: string | null): Promise<void> {
  if (plannedAtIso != null && Number.isNaN(new Date(plannedAtIso).getTime())) {
    throw new Error('Ongeldig tijdstip.')
  }
  await update(payload, matchId, { plannedAt: plannedAtIso } as Partial<MatchDoc>)
}

/**
 * Wissel de thuis- en uitploeg van plaats (scheidsrechterlijk of praktisch: wie op welk veld
 * begint). Kan zolang de wedstrijd niet gestart is — nadien zou de score van kant wisselen.
 */
export async function swapSides(payload: Payload, matchId: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  if (!m.home || !m.away) throw new Error('Beide ploegen moeten gekend zijn om te wisselen.')
  if (m.status !== 'pending' || goalsOf(m).length > 0)
    throw new Error('Wisselen kan enkel vóór de start van de wedstrijd.')
  // Round-robin-labels dragen de affiche ("A – B"): draai die mee; ronde-labels blijven staan.
  const label = m.label === `${m.home} – ${m.away}` ? `${m.away} – ${m.home}` : m.label
  await update(payload, matchId, { home: m.away, away: m.home, label } as Partial<MatchDoc>)
}

export async function setClock(
  payload: Payload,
  matchId: number,
  opts: { running?: boolean; seconds?: number },
): Promise<void> {
  const m = await getMatch(payload, matchId)
  const data: Partial<MatchDoc> = {}
  const base = opts.seconds !== undefined ? Math.max(0, opts.seconds) : Math.floor(liveClock(m))
  data.clockSeconds = base
  if (opts.running !== undefined) {
    data.clockRunning = opts.running
    data.clockUpdatedAt = new Date().toISOString()
  } else if (m.clockRunning) {
    // Tijd handmatig gezet terwijl de klok loopt → herijk het startpunt.
    data.clockUpdatedAt = new Date().toISOString()
  }
  await update(payload, matchId, data)
}

/** Naar de tweede helft: klok terug op 0, gepauzeerd. */
export async function advanceHalf(payload: Payload, matchId: number): Promise<void> {
  await update(payload, matchId, {
    currentHalf: 2,
    clockSeconds: 0,
    clockRunning: false,
    clockUpdatedAt: new Date().toISOString(),
  })
}

/**
 * Beëindig een wedstrijd: bepaal de winnaar (uit de stand, of expliciet bij gelijkspel) en schuif
 * winnaar (en bij een halve finale de verliezer) door naar het volgende slot.
 */
export async function finishMatch(payload: Payload, matchId: number, explicitWinner?: Side | null): Promise<void> {
  const m = await getMatch(payload, matchId)
  const score = deriveScore(goalsOf(m))
  const tournamentId = await tournamentIdOf(payload, m)
  const t = await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 }).catch(() => null)
  const format = (t as { format?: string } | null)?.format === 'roundrobin' ? 'roundrobin' : 'knockout'

  const winner = resolveWinner(score, explicitWinner)
  // In een afvalrace moet er een winnaar zijn (extra worpen bij gelijkspel). Bij round-robin
  // mag een wedstrijd op een gelijkspel eindigen (3 punten elk).
  if (!winner && format === 'knockout') {
    throw new Error('Gelijkspel: kies wie doorgaat (extra worpen).')
  }

  await update(payload, matchId, { status: 'finished', winner, clockRunning: false, clockSeconds: Math.floor(liveClock(m)) })

  const champ = winnerName({ home: m.home ?? null, away: m.away ?? null, winner })
  const loser = loserName({ home: m.home ?? null, away: m.away ?? null, winner })
  if (m.winnerTo && champ) await applyToSlot(payload, m, m.winnerTo, champ)
  if (m.loserTo && loser) await applyToSlot(payload, m, m.loserTo, loser)

  // Tornooi afsluiten zodra alle wedstrijden gespeeld zijn.
  const docs = await loadMatches(payload, tournamentId)
  if (docs.every((d) => d.status === 'finished')) {
    await payload.update({ collection: 'tournaments', id: tournamentId, data: { status: 'finished' }, overrideAccess: true })
  }
}

async function tournamentIdOf(payload: Payload, m: MatchDoc): Promise<number> {
  const full = (await payload.findByID({ collection: COLL, id: m.id, depth: 0 })) as unknown as {
    tournament: number | { id: number }
  }
  return typeof full.tournament === 'object' ? full.tournament.id : full.tournament
}

/** Zoek de wedstrijd waar een doel-slot (ronde/positie/schema) naar verwijst. */
async function findSlotMatch(payload: Payload, tournamentId: number, ref: SlotRef): Promise<MatchDoc | null> {
  const res = await payload.find({
    collection: COLL,
    where: {
      and: [
        { tournament: { equals: tournamentId } },
        { round: { equals: ref.round } },
        { position: { equals: ref.position } },
        { bracket: { equals: ref.bracket } },
      ],
    },
    depth: 0,
    limit: 1,
  })
  return (res.docs[0] as unknown as MatchDoc) ?? null
}

/** Schrijf een ploegnaam in het doel-slot (volgende ronde / kleine finale). */
async function applyToSlot(payload: Payload, source: MatchDoc, ref: SlotRef, name: string): Promise<void> {
  const tournamentId = await tournamentIdOf(payload, source)
  const target = await findSlotMatch(payload, tournamentId, ref)
  if (target) await update(payload, target.id, { [ref.slot]: name } as Partial<MatchDoc>)
}

/**
 * Heropen een afgelopen wedstrijd om de score nog aan te passen. De doorgeschoven winnaar (en
 * eventueel verliezer) wordt uit de vervolgronde teruggetrokken — dat kan enkel zolang daar nog
 * niet gespeeld wordt. Het tornooi zelf gaat terug op 'live' als het al afgesloten was.
 */
export async function reopenMatch(payload: Payload, matchId: number): Promise<void> {
  const m = await getMatch(payload, matchId)
  if (m.status !== 'finished') throw new Error('Deze wedstrijd is niet afgelopen.')
  if (!m.home || !m.away) throw new Error('Een bye kan niet heropend worden.')
  const tournamentId = await tournamentIdOf(payload, m)

  // Eerst BEIDE vervolg-slots controleren, dan pas leegmaken — geen half werk bij een weigering.
  const refs = [m.winnerTo, m.loserTo].filter((r): r is SlotRef => Boolean(r))
  const targets: { ref: SlotRef; doc: MatchDoc }[] = []
  for (const ref of refs) {
    const doc = await findSlotMatch(payload, tournamentId, ref)
    if (!doc) continue
    if (doc.status !== 'pending' || goalsOf(doc).length > 0) {
      throw new Error('De volgende ronde is al bezig — deze wedstrijd kan niet meer heropend worden.')
    }
    targets.push({ ref, doc })
  }
  for (const t of targets) {
    await update(payload, t.doc.id, { [t.ref.slot]: null } as unknown as Partial<MatchDoc>)
  }

  await update(payload, matchId, { status: 'live', winner: null, clockRunning: false })
  await payload
    .update({ collection: 'tournaments', id: tournamentId, data: { status: 'live' }, overrideAccess: true })
    .catch(() => undefined)
}

// ── Tornooi-beheer: schrijffouten rechtzetten en herloten ────────────────────────────────────

/** Tornooinaam (categorienaam) wijzigen — voor een simpele schrijffout. */
export async function renameTournament(payload: Payload, tournamentId: number, naam: string): Promise<void> {
  const schoon = naam.trim()
  if (!schoon) throw new Error('Geef een naam in.')
  await payload.update({ collection: 'tournaments', id: tournamentId, data: { name: schoon }, overrideAccess: true })
}

/**
 * Ploegnaam wijzigen doorheen het hele tornooi: elke wedstrijd (thuis/uit/winnaar blijft per
 * kant kloppen) én de club-/ploegkoppelingen. Voor een schrijffout — de identiteit blijft
 * dezelfde ploeg.
 */
export async function renameTeam(payload: Payload, tournamentId: number, van: string, naar: string): Promise<void> {
  const oud = van.trim()
  const nieuw = naar.trim()
  if (!oud || !nieuw) throw new Error('Geef een ploegnaam in.')
  if (oud === nieuw) return
  const docs = await loadMatches(payload, tournamentId)
  const namen = new Set<string>()
  for (const d of docs) {
    if (d.home) namen.add(d.home)
    if (d.away) namen.add(d.away)
  }
  if (!namen.has(oud)) throw new Error(`Ploeg "${oud}" niet gevonden in dit tornooi.`)
  if (namen.has(nieuw)) throw new Error(`Er speelt al een ploeg "${nieuw}" in dit tornooi.`)

  for (const d of docs) {
    const data: Partial<MatchDoc> = {}
    if (d.home === oud) data.home = nieuw
    if (d.away === oud) data.away = nieuw
    if (Object.keys(data).length) await update(payload, d.id, data)
  }

  // Koppelingen (logo/club en echte-ploeg) mee hernoemen zodat ze blijven werken.
  const t = (await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 })) as {
    teamClubs?: { name?: string }[] | null
    teamTeams?: { name?: string }[] | null
  }
  const hernoem = (lijst: { name?: string }[] | null | undefined) =>
    Array.isArray(lijst) ? lijst.map((x) => (x?.name === oud ? { ...x, name: nieuw } : x)) : undefined
  const teamClubs = hernoem(t.teamClubs)
  const teamTeams = hernoem(t.teamTeams)
  if (teamClubs || teamTeams) {
    await payload.update({
      collection: 'tournaments',
      id: tournamentId,
      data: { ...(teamClubs ? { teamClubs } : {}), ...(teamTeams ? { teamTeams } : {}) },
      overrideAccess: true,
    })
  }
}

/** Verkeerd bewaarde categorie rechtzetten — bepaalt speelduur/worpen voor nog te spelen matchen. */
export async function changeCategory(payload: Payload, tournamentId: number, category: string): Promise<void> {
  if (!(CATEGORIES as readonly string[]).includes(category)) throw new Error(`Onbekende categorie: ${category}`)
  await payload.update({
    collection: 'tournaments',
    id: tournamentId,
    data: { category: category as Category },
    overrideAccess: true,
  })
}

/**
 * Manuele planning (round-robin): vervang het volledige speelschema door een zelf samengestelde
 * lijst wedstrijden — wie tegen wie, in welke volgorde, en optioneel om welk uur. Zo kan de
 * organisator bv. "A tegen C, daarna C tegen B" plannen i.p.v. de automatische rotatie.
 * Kan enkel zolang er nog NIETS gespeeld is (zelfde bewaking als de herloting).
 */
export async function planSchedule(
  payload: Payload,
  tournamentId: number,
  wedstrijden: { home: string; away: string; plannedAt?: string | null }[],
): Promise<void> {
  const t = (await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 })) as {
    format?: string
  }
  if (t.format !== 'roundrobin')
    throw new Error('Manueel plannen kan enkel bij een poule (round-robin); bij knock-out bepaalt de loting de paren.')

  const docs = await loadMatches(payload, tournamentId)
  const gespeeld = docs.some((d) => d.status !== 'pending' || goalsOf(d).length > 0)
  if (gespeeld) throw new Error('Er is al gespeeld — de planning hertekenen kan niet meer.')

  // Enkel gekende ploegen: de planning kiest paren, ze voegt geen nieuwe ploegen toe.
  const gekend = new Set<string>()
  for (const d of docs) {
    if (d.home) gekend.add(d.home)
    if (d.away) gekend.add(d.away)
  }
  if (wedstrijden.length === 0) throw new Error('Plan minstens één wedstrijd.')
  for (const w of wedstrijden) {
    if (!w.home || !w.away) throw new Error('Elke wedstrijd heeft twee ploegen nodig.')
    if (w.home === w.away) throw new Error(`${w.home} kan niet tegen zichzelf spelen.`)
    if (!gekend.has(w.home)) throw new Error(`Onbekende ploeg: ${w.home}`)
    if (!gekend.has(w.away)) throw new Error(`Onbekende ploeg: ${w.away}`)
  }

  // Oud schema weg, de zelf samengestelde lijst erin — de volgorde ís de speelvolgorde.
  await payload.delete({ collection: COLL, where: { tournament: { equals: tournamentId } }, overrideAccess: true })
  let position = 0
  for (const w of wedstrijden) {
    await payload.create({
      collection: COLL,
      data: {
        tournament: tournamentId,
        round: 1,
        position: position++,
        bracket: 'main',
        label: `${w.home} – ${w.away}`,
        home: w.home,
        away: w.away,
        status: 'pending',
        goals: [],
        currentHalf: 1,
        clockSeconds: 0,
        clockRunning: false,
        ...(w.plannedAt ? { plannedAt: w.plannedAt } : {}),
      },
      overrideAccess: true,
    })
  }
  await payload.update({
    collection: 'tournaments',
    id: tournamentId,
    data: { status: 'live' },
    overrideAccess: true,
  })
}

/**
 * Herloting: gooi het schema opnieuw met een nieuwe slot-volgorde (manueel gekozen of geschud).
 * Kan enkel zolang er nog NIETS gespeeld is (geen enkele echte wedstrijd gestart of genoteerd) —
 * bye's tellen niet mee. De geplande uren van ronde 1 blijven per wedstrijdslot behouden.
 */
export async function redrawTournament(
  payload: Payload,
  tournamentId: number,
  slots: (string | null)[],
): Promise<void> {
  const t = (await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 })) as {
    format?: string
  }
  const format: TournamentFormat = t.format === 'roundrobin' ? 'roundrobin' : 'knockout'
  const docs = await loadMatches(payload, tournamentId)
  const gespeeld = docs.some((d) => {
    const bye = d.status === 'finished' && (!d.home || !d.away)
    return !bye && (d.status !== 'pending' || goalsOf(d).length > 0)
  })
  if (gespeeld) throw new Error('Er is al gespeeld — herloten kan niet meer.')

  const filled = slots.filter((s): s is string => Boolean(s))
  if (filled.length < 2) throw new Error('Een tornooi heeft minstens 2 ploegen nodig.')

  // Geplande uren van ronde 1 bewaren per slot-volgorde, zodat de dagplanning blijft staan.
  const oudeUren = docs
    .filter((d) => d.round === 1 && d.bracket === 'main')
    .sort((a, b) => a.position - b.position)
    .map((d) => d.plannedAt ?? null)

  const bracket = format === 'roundrobin' ? buildRoundRobin(filled) : buildBracket(slots)
  if (format === 'knockout') {
    for (const m of bracket) {
      if (m.round === 1 && m.bracket === 'main' && !m.home && !m.away) {
        throw new Error('Ongeldige loting: een wedstrijd zonder ploegen. Verdeel de bye’s anders.')
      }
    }
  }

  // Oud schema weg, nieuw schema erin (zelfde patroon als bij het aanmaken).
  await payload.delete({ collection: COLL, where: { tournament: { equals: tournamentId } }, overrideAccess: true })
  let ronde1Index = 0
  for (const m of bracket) {
    const gepland = m.round === 1 && m.bracket === 'main' ? oudeUren[ronde1Index++] : undefined
    await payload.create({
      collection: COLL,
      data: {
        tournament: tournamentId,
        round: m.round,
        position: m.position,
        bracket: m.bracket,
        label: m.label,
        home: m.home,
        away: m.away,
        status: m.status,
        winner: m.winner ?? undefined,
        goals: [],
        winnerTo: m.winnerTo ?? undefined,
        loserTo: m.loserTo ?? undefined,
        currentHalf: 1,
        clockSeconds: 0,
        clockRunning: false,
        ...(gepland ? { plannedAt: gepland } : {}),
      },
      overrideAccess: true,
    })
  }
  await payload.update({
    collection: 'tournaments',
    id: tournamentId,
    data: { teamCount: filled.length, status: 'live' },
    overrideAccess: true,
  })
}
