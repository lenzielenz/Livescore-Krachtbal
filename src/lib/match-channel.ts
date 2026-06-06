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

// Eén live shoutout (ingelogde supporter). Bewust EFEMEER: enkel in-memory zolang het kanaal
// leeft (≥1 kijker), nooit in de DB — geen opslag = geen moderatie-/privacyschuld voor v1.
export type Shout = { id: number; name: string; text: string; at: number }

type Channel = {
  subs: Set<Send>
  lastScore: string
  lastId: number
  reactions: Record<string, number> // delta sinds de laatste flush (zwevende emoji's)
  totals: Record<string, number> // cumulatief deze wedstrijd (zichtbare tellers)
  shoutouts: Shout[] // ringbuffer van recente berichten
  shoutSeq: number
  poll: ReturnType<typeof setInterval>
  flush: ReturnType<typeof setInterval>
}

const channels = new Map<number, Channel>()

const SCORE_POLL_MS = 1500
const REACTION_FLUSH_MS = 300 // geaggregeerd venster (~3 flushes/sec)
const ALLOWED_EMOJI = new Set(['clap', 'fire', 'heart', 'goal', 'wow', 'rocket'])
const MAX_SHOUTS = 40 // hou enkel de recentste berichten in het geheugen

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

/** Sluit een SSE-verbinding aan op het kanaal van een wedstrijd. Retourneert een leave-functie. */
export function joinMatch(payload: Payload, matchId: number, send: Send): () => void {
  let ch = channels.get(matchId)
  if (!ch) {
    ch = {
      subs: new Set(),
      lastScore: '',
      lastId: 0,
      reactions: {},
      totals: {},
      shoutouts: [],
      shoutSeq: 0,
      poll: setInterval(() => void pollScore(payload, matchId), SCORE_POLL_MS),
      flush: setInterval(() => flushReactions(matchId), REACTION_FLUSH_MS),
    }
    channels.set(matchId, ch)
    void pollScore(payload, matchId) // directe eerste score
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
      clearInterval(c.poll)
      clearInterval(c.flush)
      channels.delete(matchId)
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
  return shout
}

export const REACTION_EMOJI = ['clap', 'fire', 'heart', 'goal', 'wow', 'rocket'] as const
