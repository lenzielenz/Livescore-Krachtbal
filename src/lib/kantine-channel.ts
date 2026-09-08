import type { Payload } from 'payload'

import { recenteBlast } from './match-channel'
import { buildScoreboards } from './match-engine'
import { subscribe } from './sse-hub'

// ── Eén live-verbinding voor het hele kantinescherm ───────────────────────────────────────────
//
// Elk bord op de kantine-tv abonneerde zich op zijn eigen /api/match/<id>/stream. Met een dozijn
// wedstrijden op het scherm zijn dat een dozijn permanent open verbindingen uit één browser,
// terwijl een browser er maar een handvol tegelijk toelaat per server. Alles wat daarna nog moet,
// belandt in een wachtrij die nooit leegloopt — óók de verversing van het scherm zelf. Gevolg:
// de tv laadde één keer en bevroor daarna. Serverkant was het even scheef: twaalf borden waren
// twaalf pollers die elk anderhalve seconde de databank bevroegen, voor één kijker.
//
// Dus: één kanaal voor álle borden van dit scherm, precies zoals day-channel.ts dat voor de
// dagborden op / en /live doet. Eén gedeelde poller (sse-hub) bedient elke tv die dezelfde
// wedstrijden toont, en er gaat enkel het VERANDERLIJKE deel over de lijn — namen, logo's en
// kleuren staan al op het scherm en veranderen niet tijdens een wedstrijd.

/**
 * Hoe vaak de gedeelde poller kijkt.
 *
 * Trager dan een aantekentafel (1,5 s), sneller dan het dagbord (5 s): een kantine-tv is een
 * kijkscherm met een lopende klok, en dit is meteen de kost voor álle borden samen.
 */
export const KANTINE_POLL_MS = 3000

/** Zoveel wedstrijden mag één scherm live volgen. Boven dit aantal is een tv toch onleesbaar. */
export const MAX_KANTINE_IDS = 60

export interface KantineGoal {
  /** Stabiel per doelpunt: verandert enkel wanneer er écht eentje bij komt. */
  id: string
  side: 'home' | 'away'
  points: number
  scorer: string | null
}

/** Het veranderlijke deel van één bord. */
export interface KantineLive {
  id: number
  status: string
  score: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: number; away: number }
  refereeStops: number
  half: number
  /** Eerste helft afgefloten, tweede nog niet begonnen — het bord toont dan RUST. */
  atHalfTime: boolean
  clockSeconds: number
  clockRunning: boolean
  clockUpdatedAt: string | null
  /** Het laatste doelpunt, zodat de tegel kan vieren zonder een eigen tijdlijn op te halen. */
  goal: KantineGoal | null
  /** Een clubkleuren-viering die een supporter net afvuurde (zie match-channel.ts). */
  blast: { side: 'home' | 'away'; ts: number } | null
}

/**
 * Maak van ruwe invoer een nette, begrensde lijst wedstrijd-id's.
 *
 * Gesorteerd en ontdubbeld, want de lijst is meteen de sleutel van de gedeelde poller: twee tv's
 * die dezelfde wedstrijden tonen, horen dezelfde poller te delen in plaats van er elk één op te
 * starten.
 */
export function kantineIds(raw: unknown): number[] {
  const lijst = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : []
  const uit = new Set<number>()
  for (const v of lijst) {
    const n = Math.floor(Number(v))
    if (Number.isFinite(n) && n > 0) uit.add(n)
    if (uit.size >= MAX_KANTINE_IDS) break
  }
  return [...uit].sort((a, b) => a - b)
}

/** De sleutel waarop de poller gedeeld wordt. */
export function kantineSleutel(ids: number[]): string {
  return `kantine:${ids.join(',')}`
}

/** De veranderlijke stand van alle borden op één kantinescherm. */
export async function loadKantineLive(payload: Payload, ids: number[]): Promise<KantineLive[]> {
  if (ids.length === 0) return []

  const matchRes = await payload.find({
    collection: 'matches',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const docs = matchRes.docs
  if (docs.length === 0) return []

  const [kaarten, rustRes] = await Promise.all([
    buildScoreboards(payload, docs),
    // Rust: de lopende helft is afgesloten maar de volgende nog niet begonnen. Eén query voor het
    // hele scherm in plaats van een count per wedstrijd.
    payload.find({
      collection: 'match-events',
      where: { and: [{ match: { in: ids } }, { type: { equals: 'half_end' } }] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
  ])

  // Welke helften zijn afgefloten, per wedstrijd?
  const rustPerMatch = new Map<number, Set<number>>()
  for (const e of rustRes.docs) {
    const rel = (e as { match?: unknown }).match
    const mId = Number(typeof rel === 'object' && rel ? (rel as { id?: unknown }).id : rel)
    if (!Number.isFinite(mId)) continue
    const set = rustPerMatch.get(mId) ?? new Set<number>()
    set.add(Number((e as { half?: unknown }).half) || 1)
    rustPerMatch.set(mId, set)
  }

  // De namen van de scorers in één keer erbij. buildScoreboards leest worpen op depth 0, dus daar
  // zit enkel een speler-id; een snelscore-doelpunt draagt zijn naam al mee.
  const spelerIds = [
    ...new Set(
      docs
        .map((m) => kaarten.get(m.id)?.lastGoal)
        .filter((g) => g && g.playerId != null && !g.scorerName)
        .map((g) => g!.playerId as number),
    ),
  ]
  const spelers = spelerIds.length
    ? await payload
        .find({ collection: 'players', where: { id: { in: spelerIds } }, depth: 0, pagination: false, overrideAccess: true })
        .catch(() => null)
    : null
  const naamVan = new Map<number, string>()
  for (const p of spelers?.docs ?? []) {
    const nr = (p as { shirtNumber?: unknown }).shirtNumber
    const naam = String((p as { name?: unknown }).name ?? '')
    if (naam) naamVan.set(Number(p.id), `#${nr ?? '?'} ${naam}`.trim())
  }

  const uit: KantineLive[] = []
  for (const m of docs) {
    const kaart = kaarten.get(m.id)
    if (!kaart) continue
    const half = Number((m as { currentHalf?: unknown }).currentHalf) || 1
    const g = kaart.lastGoal
    uit.push({
      id: m.id,
      status: kaart.status,
      score: kaart.score,
      crosses: kaart.crosses,
      timeouts: kaart.timeouts,
      refereeStops: kaart.refereeStops,
      half,
      atHalfTime: kaart.status === 'live' && half < 2 && Boolean(rustPerMatch.get(m.id)?.has(half)),
      clockSeconds: Number((m as { clockSeconds?: unknown }).clockSeconds) || 0,
      clockRunning: Boolean((m as { clockRunning?: unknown }).clockRunning),
      clockUpdatedAt: typeof (m as { clockUpdatedAt?: unknown }).clockUpdatedAt === 'string' ? ((m as { clockUpdatedAt?: string }).clockUpdatedAt as string) : null,
      goal: g
        ? {
            id: g.id,
            side: g.side,
            points: g.points,
            scorer: g.scorerName ?? (g.playerId != null ? (naamVan.get(g.playerId) ?? null) : null),
          }
        : null,
      // Ruim genomen: de viering moet minstens één frame overleven om het scherm te halen.
      blast: recenteBlast(m.id, KANTINE_POLL_MS * 3),
    })
  }
  return uit
}

/**
 * Sluit aan op het gedeelde kantinekanaal. Geeft een unsubscribe-functie terug; die stopt de
 * poller zodra de laatste tv weg is.
 */
export function joinKantine(
  payload: Payload,
  ids: number[],
  send: (event: string, data: unknown, id?: number) => void,
): () => void {
  return subscribe(
    kantineSleutel(ids),
    () => loadKantineLive(payload, ids),
    (frame) => send('update', frame.data, frame.id),
    KANTINE_POLL_MS,
  )
}
