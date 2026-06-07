import type { Payload } from 'payload'

import { buildMatchState, buildTimeline } from './match-engine'

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
  lastScore: string
  lastId: number
  reactions: Record<string, number> // delta sinds de laatste flush (zwevende emoji's)
  totals: Record<string, number> // cumulatief deze wedstrijd (zichtbare tellers)
  shoutouts: Shout[] // ringbuffer van recente berichten
  shoutSeq: number
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

function broadcast(ch: Channel, event: string, data: unknown, id?: number) {
  for (const send of ch.subs) {
    try {
      send(event, data, id)
    } catch {
      /* kapotte subscriber mag de rest niet breken */
    }
  }
}

function broadcastViewers(ch: Channel) {
  broadcast(ch, 'viewers', { count: ch.subs.size })
}

async function pollScore(payload: Payload, matchId: number) {
  const ch = channels.get(matchId)
  if (!ch) return
  let payloadData: unknown
  try {
    const [state, timeline] = await Promise.all([buildMatchState(payload, matchId), buildTimeline(payload, matchId)])
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
    const dbTotals = (match?.liveReactions ?? null) as Record<string, number> | null
    const dbShouts = (match?.liveShoutouts ?? null) as Shout[] | null
    let changed = false
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
    if (changed) {
      if (Object.keys(ch.totals).length) broadcast(ch, 'reactions', { delta: {}, totals: ch.totals })
      if (ch.shoutouts.length) broadcast(ch, 'shoutouts', ch.shoutouts)
    }
  } catch {
    /* hydrate is best-effort */
  }
}

/** Sluit een SSE-verbinding aan op het kanaal van een wedstrijd. Retourneert een leave-functie. */
export function joinMatch(payload: Payload, matchId: number, send: Send): () => void {
  let ch = channels.get(matchId)
  if (!ch) {
    ch = {
      payload,
      subs: new Set(),
      lastScore: '',
      lastId: 0,
      reactions: {},
      totals: {},
      shoutouts: [],
      shoutSeq: 0,
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
  if (ch.lastScore) send('update', JSON.parse(ch.lastScore), ch.lastId)
  send('viewers', { count: ch.subs.size })
  // Nieuwe kijker meteen de huidige tellers + recente shoutouts geven (niet 1 flush wachten).
  if (Object.keys(ch.totals).length) send('reactions', { delta: {}, totals: ch.totals })
  if (ch.shoutouts.length) send('shoutouts', ch.shoutouts)
  broadcastViewers(ch)

  return () => {
    const c = channels.get(matchId)
    if (!c) return
    c.subs.delete(send)
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
  const n = Math.max(1, Math.min(20, Math.floor(count) || 1)) // clamp tegen inflatie
  ch.reactions[emoji] = (ch.reactions[emoji] ?? 0) + n
  ch.totals[emoji] = (ch.totals[emoji] ?? 0) + n
  scheduleSaveReactions(ch, matchId) // gebundeld persisteren zodat de tellers blijven staan
  return true
}

/** Voeg een live shoutout toe en broadcast hem meteen. Null als niemand kijkt (geen kanaal). */
export function addShoutout(matchId: number, name: string, text: string): Shout | null {
  const ch = channels.get(matchId)
  if (!ch) return null
  ch.shoutSeq += 1
  const shout: Shout = { id: ch.shoutSeq, name, text, at: Date.now() }
  ch.shoutouts.push(shout)
  if (ch.shoutouts.length > MAX_SHOUTS) ch.shoutouts.splice(0, ch.shoutouts.length - MAX_SHOUTS)
  broadcast(ch, 'shoutout', shout)
  void saveShoutouts(ch, matchId) // meteen persisteren zodat het bericht blijft staan
  return shout
}

export const REACTION_EMOJI = ['clap', 'fire', 'heart', 'goal', 'wow', 'rocket'] as const
