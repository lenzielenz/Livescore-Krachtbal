import type { Payload } from 'payload'

import { buildMatchState, buildTimeline } from './match-engine'
import { isTribuneOpen } from './tribune'

// Live match-kanaal: één gedeelde bron per wedstrijd die NAAR ALLE verbonden clients fan-out doet,
// over één en dezelfde SSE-stream. Drie soorten events:
//   - 'update'    : score/tijdlijn (gepolld, met diff zodat er enkel bij wijziging gepusht wordt)
//   - 'reactions' : SERVER-SIDE GEAGGREGEERDE emoji-tikken per venster (bv. {clap:47}), NOOIT één
//                   event per tik (dat zou bij >100 kijkers ontploffen). Eigen cadans, losgekoppeld
//                   van de score zodat een reactie-piek nooit een score-update vertraagt.
//   - 'viewers'   : aantal actieve kijkers (subscriber-count van dit kanaal).
//
// Schaal: per-instance in-memory. Op één Railway-instance correct; bij horizontale schaal hoort
// hier Redis pub/sub onder (reacties → counter met TTL, viewers → som over instances). Zie AUDIT.

type Send = (event: string, data: unknown, id?: number) => void

// Eén live shoutout (ingelogde supporter). Wordt nu ook PERSISTENT bewaard op de wedstrijd
// (matches.liveShoutouts), zodat berichten en tellers niet verdwijnen wanneer (even) niemand
// kijkt of de server herstart. Het kanaal hydrateert hieruit en schrijft terug.
export type Shout = { id: number; name: string; text: string; at: number }

type Channel = {
  payload: Payload
  subs: Set<Send>
  // Kijker-identiteit per verbinding: een stabiel per-browser id (zelfde persoon met meerdere
  // tabbladen telt één keer), of null voor schermen/tafels die niet als kijker meetellen.
  viewerKeys: Map<Send, string | null>
  lastScore: string
  lastId: number
  status: string // laatst gekende wedstrijdstatus (voor het tribune-venster)
  finishedAt: string | null // tijdstip van afloop (voor het 1u-navenster)
  reactions: Record<string, number> // delta sinds de laatste flush (zwevende emoji's)
  totals: Record<string, number> // cumulatief deze wedstrijd (zichtbare tellers)
  shoutouts: Shout[] // ringbuffer van recente berichten
  shoutSeq: number
  pollVotes: Record<string, number> // voorspel-poll: cumulatieve stemmen per optie (home/draw/away)
  pollSaveTimer: ReturnType<typeof setTimeout> | null
  hydrated: boolean // al uit de DB geladen?
  saveTimer: ReturnType<typeof setTimeout> | null // debounce voor het wegschrijven van tellers
  poll: ReturnType<typeof setInterval> | null
  flush: ReturnType<typeof setInterval> | null
  idle: ReturnType<typeof setTimeout> | null // sloop-timer wanneer (even) niemand kijkt
}

const channels = new Map<number, Channel>()

const SCORE_POLL_MS = 1500
const REACTION_FLUSH_MS = 300 // geaggregeerd venster (~3 flushes/sec)
// Tellers worden gebundeld weggeschreven (niet bij elke tik) om DB-druk te vermijden.
const REACTION_SAVE_MS = 5000
// Houd het kanaal (met shoutouts + tellers) nog even in leven als de laatste kijker weggaat, zodat
// een simpele page-refresh de tribune niet wist. Pas na deze grace-periode wordt het opgeruimd.
const IDLE_GRACE_MS = 60_000
const ALLOWED_EMOJI = new Set(['clap', 'fire', 'heart', 'goal', 'wow', 'rocket'])
const MAX_SHOUTS = 40 // hou enkel de recentste berichten bij
export const POLL_OPTIONS = ['home', 'draw', 'away'] as const
const POLL_SET = new Set<string>(POLL_OPTIONS)

function broadcast(ch: Channel, event: string, data: unknown, id?: number) {
  for (const send of ch.subs) {
    try {
      send(event, data, id)
    } catch {
      /* kapotte subscriber mag de rest niet breken */
    }
  }
}

// Het oogje telt PERSONEN, geen verbindingen: uniek per browser-id, en passieve schermen
// (veldscherm, kantine, aantekentafel) tellen niet mee — anders klopt het aantal nooit.
function viewerCount(ch: Channel): number {
  const uniek = new Set<string>()
  for (const key of ch.viewerKeys.values()) if (key) uniek.add(key)
  return uniek.size
}

function broadcastViewers(ch: Channel) {
  broadcast(ch, 'viewers', { count: viewerCount(ch) })
}

async function pollScore(payload: Payload, matchId: number) {
  const ch = channels.get(matchId)
  if (!ch) return
  let payloadData: unknown
  try {
    const [state, timeline] = await Promise.all([buildMatchState(payload, matchId), buildTimeline(payload, matchId)])
    // Status + eindtijd bijhouden zodat het tribune-venster (live + 1u na) klopt.
    ch.status = state.match.status
    ch.finishedAt = state.match.finishedAt ?? null
    payloadData = { state, timeline }
  } catch {
    return // transiënt → overslaan
  }
  const s = JSON.stringify(payloadData)
  if (s === ch.lastScore) return
  ch.lastScore = s
  ch.lastId += 1
  broadcast(ch, 'update', payloadData, ch.lastId)
}

function flushReactions(matchId: number) {
  const ch = channels.get(matchId)
  if (!ch) return
  const keys = Object.keys(ch.reactions)
  if (keys.length === 0) return
  const delta = ch.reactions
  ch.reactions = {}
  // `delta` voedt de zwevende emoji's; `totals` voedt de zichtbare tellers per emoji.
  broadcast(ch, 'reactions', { delta, totals: ch.totals })
}

// Schrijf de cumulatieve tellers weg naar de wedstrijd (best-effort).
async function saveReactions(ch: Channel, matchId: number) {
  try {
    await ch.payload.update({ collection: 'matches', id: matchId, data: { liveReactions: ch.totals }, overrideAccess: true })
  } catch {
    /* best-effort: een mislukte save mag de live-werking niet breken */
  }
}

// Tellers gebundeld wegschrijven: plan één save, niet bij elke tik.
function scheduleSaveReactions(ch: Channel, matchId: number) {
  if (ch.saveTimer) return
  ch.saveTimer = setTimeout(() => {
    ch.saveTimer = null
    void saveReactions(ch, matchId)
  }, REACTION_SAVE_MS)
}

// Poll-stemmen gebundeld wegschrijven (debounce, best-effort).
async function savePoll(ch: Channel, matchId: number) {
  try {
    await ch.payload.update({ collection: 'matches', id: matchId, data: { livePoll: ch.pollVotes }, overrideAccess: true })
  } catch {
    /* best-effort */
  }
}
function scheduleSavePoll(ch: Channel, matchId: number) {
  if (ch.pollSaveTimer) return
  ch.pollSaveTimer = setTimeout(() => {
    ch.pollSaveTimer = null
    void savePoll(ch, matchId)
  }, REACTION_SAVE_MS)
}

// Shoutouts onmiddellijk wegschrijven (ze zijn schaars en mogen niet verloren gaan).
async function saveShoutouts(ch: Channel, matchId: number) {
  try {
    await ch.payload.update({ collection: 'matches', id: matchId, data: { liveShoutouts: ch.shoutouts }, overrideAccess: true })
  } catch {
    /* best-effort */
  }
}

// Laad de bewaarde tellers + shoutouts uit de DB in een vers kanaal en broadcast ze één keer.
async function hydrateChannel(ch: Channel, matchId: number) {
  if (ch.hydrated) return
  ch.hydrated = true
  try {
    const match = await ch.payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
    // Status + eindtijd meteen kennen (vóór de eerste poll) zodat het tribune-venster klopt.
    if (typeof match?.status === 'string') ch.status = match.status
    ch.finishedAt = (match?.finishedAt as string | null | undefined) ?? null
    const dbTotals = (match?.liveReactions ?? null) as Record<string, number> | null
    const dbShouts = (match?.liveShoutouts ?? null) as Shout[] | null
    const dbPoll = (match?.livePoll ?? null) as Record<string, number> | null
    let changed = false
    if (dbPoll && typeof dbPoll === 'object') {
      for (const [k, v] of Object.entries(dbPoll)) {
        if (POLL_SET.has(k) && typeof v === 'number' && v > 0) ch.pollVotes[k] = (ch.pollVotes[k] ?? 0) + v
      }
    }
    if (dbTotals && typeof dbTotals === 'object') {
      for (const [k, v] of Object.entries(dbTotals)) {
        if (ALLOWED_EMOJI.has(k) && typeof v === 'number' && v > 0) {
          ch.totals[k] = (ch.totals[k] ?? 0) + v
          changed = true
        }
      }
    }
    if (Array.isArray(dbShouts) && dbShouts.length) {
      const seen = new Set(ch.shoutouts.map((s) => s.id))
      const restored = dbShouts.filter(
        (s): s is Shout => Boolean(s) && typeof s.id === 'number' && typeof s.text === 'string' && !seen.has(s.id),
      )
      ch.shoutouts = [...restored, ...ch.shoutouts].slice(-MAX_SHOUTS)
      ch.shoutSeq = Math.max(ch.shoutSeq, ...ch.shoutouts.map((s) => s.id), 0)
      changed = true
    }
    if (Object.keys(ch.pollVotes).length) broadcast(ch, 'poll', { totals: ch.pollVotes })
    if (changed) {
      if (Object.keys(ch.totals).length) broadcast(ch, 'reactions', { delta: {}, totals: ch.totals })
      if (ch.shoutouts.length) broadcast(ch, 'shoutouts', ch.shoutouts)
    }
  } catch {
    /* hydrate is best-effort */
  }
}

/**
 * Sluit een SSE-verbinding aan op het kanaal van een wedstrijd. Retourneert een leave-functie.
 * `viewerKey`: stabiel per-browser id (telt als één kijker, ook met meerdere tabbladen);
 * null = passief scherm/tafel (telt niet mee); undefined = onbekend → telt als één verbinding.
 */
export function joinMatch(payload: Payload, matchId: number, send: Send, viewerKey?: string | null): () => void {
  let ch = channels.get(matchId)
  if (!ch) {
    ch = {
      payload,
      subs: new Set(),
      viewerKeys: new Map(),
      lastScore: '',
      lastId: 0,
      status: '',
      finishedAt: null,
      reactions: {},
      totals: {},
      shoutouts: [],
      shoutSeq: 0,
      pollVotes: {},
      pollSaveTimer: null,
      hydrated: false,
      saveTimer: null,
      poll: setInterval(() => void pollScore(payload, matchId), SCORE_POLL_MS),
      flush: setInterval(() => flushReactions(matchId), REACTION_FLUSH_MS),
      idle: null,
    }
    channels.set(matchId, ch)
    void pollScore(payload, matchId) // directe eerste score
    void hydrateChannel(ch, matchId) // bewaarde tribune (tellers + shoutouts) terugladen
  } else {
    // Bestaand kanaal: annuleer een lopende sloop-timer en herstart de polling als die stillag
    // (kanaal overleefde een korte leegte, bv. een refresh) — shoutouts/tellers blijven bewaard.
    if (ch.idle) {
      clearTimeout(ch.idle)
      ch.idle = null
    }
    if (!ch.poll) {
      ch.poll = setInterval(() => void pollScore(payload, matchId), SCORE_POLL_MS)
      void pollScore(payload, matchId)
    }
    if (!ch.flush) ch.flush = setInterval(() => flushReactions(matchId), REACTION_FLUSH_MS)
  }
  ch.subs.add(send)
  ch.viewerKeys.set(send, viewerKey === null ? null : viewerKey || `anon-${Math.random().toString(36).slice(2, 10)}`)
  if (ch.lastScore) send('update', JSON.parse(ch.lastScore), ch.lastId)
  send('viewers', { count: viewerCount(ch) })
  // Nieuwe kijker meteen de huidige tellers + recente shoutouts geven (niet 1 flush wachten).
  if (Object.keys(ch.totals).length) send('reactions', { delta: {}, totals: ch.totals })
  if (ch.shoutouts.length) send('shoutouts', ch.shoutouts)
  if (Object.keys(ch.pollVotes).length) send('poll', { totals: ch.pollVotes })
  broadcastViewers(ch)

  return () => {
    const c = channels.get(matchId)
    if (!c) return
    c.subs.delete(send)
    c.viewerKeys.delete(send)
    if (c.subs.size === 0) {
      // Stop het pollen (geen kijkers), maar bewaar het kanaal nog even: een refresh kan zo
      // opnieuw aansluiten zonder dat de shoutouts en tellers verloren gaan.
      if (c.poll) clearInterval(c.poll)
      if (c.flush) clearInterval(c.flush)
      c.poll = null
      c.flush = null
      // Schrijf de laatste tellerstand nog weg (de debounce kan nog openstaan), zodat niets
      // verloren gaat als het kanaal straks definitief opgeruimd wordt.
      if (c.saveTimer) {
        clearTimeout(c.saveTimer)
        c.saveTimer = null
      }
      void saveReactions(c, matchId)
      if (c.pollSaveTimer) {
        clearTimeout(c.pollSaveTimer)
        c.pollSaveTimer = null
      }
      void savePoll(c, matchId)
      if (c.idle) clearTimeout(c.idle)
      c.idle = setTimeout(() => {
        const cur = channels.get(matchId)
        if (cur && cur.subs.size === 0) channels.delete(matchId)
      }, IDLE_GRACE_MS)
    } else {
      broadcastViewers(c)
    }
  }
}

/** Registreer een emoji-tik (wordt geaggregeerd geflusht). Genegeerd als niemand kijkt. */
export function addReaction(matchId: number, emoji: string, count = 1): boolean {
  if (!ALLOWED_EMOJI.has(emoji)) return false
  const ch = channels.get(matchId)
  if (!ch) return false // geen actieve kijkers → niets te tonen
  if (!isTribuneOpen(ch.status, ch.finishedAt)) return false // gesloten (>1u na de match)
  const n = Math.max(1, Math.min(20, Math.floor(count) || 1)) // clamp tegen inflatie
  ch.reactions[emoji] = (ch.reactions[emoji] ?? 0) + n
  ch.totals[emoji] = (ch.totals[emoji] ?? 0) + n
  scheduleSaveReactions(ch, matchId) // gebundeld persisteren zodat de tellers blijven staan
  return true
}

/** Registreer een poll-stem (voorspelling). Sluit zodra de wedstrijd afgelopen is. */
export function addPollVote(matchId: number, option: string, count = 1): boolean {
  if (!POLL_SET.has(option)) return false
  const ch = channels.get(matchId)
  if (!ch) return false
  if (ch.status === 'finished') return false // voorspellen sluit bij de eindstand
  const n = Math.max(1, Math.min(5, Math.floor(count) || 1))
  ch.pollVotes[option] = (ch.pollVotes[option] ?? 0) + n
  scheduleSavePoll(ch, matchId)
  broadcast(ch, 'poll', { totals: ch.pollVotes })
  return true
}

/** Voeg een live shoutout toe en broadcast hem meteen. Null als niemand kijkt (geen kanaal). */
export function addShoutout(matchId: number, name: string, text: string): Shout | null {
  const ch = channels.get(matchId)
  if (!ch) return null
  if (!isTribuneOpen(ch.status, ch.finishedAt)) return null // gesloten (>1u na de match)
  ch.shoutSeq += 1
  const shout: Shout = { id: ch.shoutSeq, name, text, at: Date.now() }
  ch.shoutouts.push(shout)
  if (ch.shoutouts.length > MAX_SHOUTS) ch.shoutouts.splice(0, ch.shoutouts.length - MAX_SHOUTS)
  broadcast(ch, 'shoutout', shout)
  void saveShoutouts(ch, matchId) // meteen persisteren zodat het bericht blijft staan
  return shout
}

// Eén live foto-instant (vluchtige supporterfoto). De bron is de match-instants-collectie; het
// kanaal broadcast enkel nieuwe/verwijderde foto's naar de huidige kijkers (geen persistentie hier).
export type Instant = { id: number; url: string; authorName: string; at: number }

/** Broadcast een nieuwe foto-instant naar alle kijkers van deze wedstrijd. */
export function addInstant(matchId: number, instant: Instant): boolean {
  const ch = channels.get(matchId)
  if (!ch) return false
  if (!isTribuneOpen(ch.status, ch.finishedAt)) return false
  broadcast(ch, 'instant', instant)
  return true
}

/** Broadcast dat een foto-instant verdween (moderatie of verval). */
export function removeInstant(matchId: number, instantId: number): boolean {
  const ch = channels.get(matchId)
  if (!ch) return false
  broadcast(ch, 'instant_removed', { id: instantId })
  return true
}

/** Roep ALLE kijkers op om samen een foto te nemen: broadcast een 'photomoment'-event met het
 * tijdstip waarop iedereen tegelijk afdrukt (gesynchroniseerde aftelklok op elk toestel). */
export function addPhotoMoment(matchId: number, at: number): boolean {
  const ch = channels.get(matchId)
  if (!ch) return false
  if (!isTribuneOpen(ch.status, ch.finishedAt)) return false
  broadcast(ch, 'photomoment', { at })
  return true
}

export const REACTION_EMOJI = ['clap', 'fire', 'heart', 'goal', 'wow', 'rocket'] as const

/** Vuur een clubkleuren-viering af op ALLE schermen van deze wedstrijd. Null/false als niemand
 * kijkt of de tribune gesloten is. Dit is wat de vieringsknop bijzonder maakt: iedereen ziet ze. */
export function addBlast(matchId: number, side: 'home' | 'away'): boolean {
  if (side !== 'home' && side !== 'away') return false
  const ch = channels.get(matchId)
  if (!ch) return false
  if (!isTribuneOpen(ch.status, ch.finishedAt)) return false
  broadcast(ch, 'blast', { side })
  return true
}
