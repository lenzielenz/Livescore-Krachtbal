import type { Payload } from 'payload'

import { getScoreMode } from './score-mode'
import {
  applyMatchOutcome,
  claimHeld,
  claimScorer,
  emptyTrust,
  markSettled,
  needsSettling,
  noteAanwezig,
  overneemWeigering,
  recordContribution,
  sanitizeTrust,
  sanitizeUserTrust,
  trustLabel,
  trustScore,
  VOTE_WINDOW_MS,
  type MatchTrust,
  type UserTrust,
} from './score-trust'

// Opslaglaag van de vertrouwenslaag: leest/schrijft de json-kolommen `matches.scoreTrust` en
// `users.scoreTrust`. De regels zelf staan in score-trust.ts (puur, getest); hier zit enkel het
// heen-en-weer met Payload. Alles draait overrideAccess: `users.scoreTrust` is voor de gebruiker
// zelf afgeschermd (onzichtbare trust-score), de server moet er wél bij kunnen.

/**
 * Waar een vertrouwensstaat staat: op een gewone wedstrijd of op een tornooiwedstrijd.
 *
 * De regels zijn identiek (score-trust.ts weet van geen collecties), enkel de rij verschilt.
 * Tornooiwedstrijden leven in een eigen collectie omdat hun ploegen vrije namen zijn en hun
 * score event-sourced in `goals` staat — maar "wie telde mee en klopt de stand" is precies
 * dezelfde vraag, dus dezelfde laag.
 */
export type TrustCollectie = 'matches' | 'tournament-matches'

export async function readMatchTrust(
  payload: Payload,
  matchId: number,
  collection: TrustCollectie = 'matches',
): Promise<MatchTrust> {
  const match = await payload
    .findByID({ collection, id: matchId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!match) return emptyTrust()
  return sanitizeTrust((match as { scoreTrust?: unknown }).scoreTrust)
}

export async function writeMatchTrust(
  payload: Payload,
  matchId: number,
  trust: MatchTrust,
  collection: TrustCollectie = 'matches',
): Promise<void> {
  await payload.update({
    collection,
    id: matchId,
    data: { scoreTrust: trust as unknown as Record<string, unknown> },
    overrideAccess: true,
  })
}

export async function readUserTrust(payload: Payload, userId: number): Promise<UserTrust> {
  const user = await payload
    .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
    .catch(() => null)
  return sanitizeUserTrust((user as { scoreTrust?: unknown } | null)?.scoreTrust)
}

export async function writeUserTrust(payload: Payload, userId: number, trust: UserTrust): Promise<void> {
  await payload.update({
    collection: 'users',
    id: userId,
    data: { scoreTrust: trust as unknown as Record<string, unknown> },
    overrideAccess: true,
  })
}

/** De trust-score (0..1) van een gebruiker — bepaalt zijn stemgewicht en of zijn invoer meteen telt. */
export async function userTrustScore(payload: Payload, userId: number): Promise<number> {
  return trustScore(await readUserTrust(payload, userId))
}

/**
 * Is de stand "officieel"? Dat is ze in de federatieflow: opstelling + scheidsrechtersakkoord vóór
 * de start en aftekenen achteraf, en enkel gemachtigde aantekenaars muteren (zie score-mode.ts).
 * Een vrije supporters-score is dat per definitie niet — die moet zijn vertrouwen verdienen.
 */
export async function isOfficialScore(payload: Payload): Promise<boolean> {
  return (await getScoreMode(payload)) === 'federatie'
}

/**
 * Sluit de vertrouwenslaag van afgelopen wedstrijden af: zodra het bevestigingsvenster dicht is,
 * boekt het eindoordeel (bevestigd/betwist) eenmalig op de trust-historiek van de official scorer.
 * Wie herhaaldelijk bevestigd wordt, klimt zo naar 'vertrouwd' en krijgt meer gewicht. Wordt door
 * het cron-endpoint aangeroepen; geeft terug hoeveel wedstrijden afgehandeld zijn.
 */
export async function settleFinishedMatches(payload: Payload, limit = 200): Promise<number> {
  if (await isOfficialScore(payload)) return 0
  const cutoff = new Date(Date.now() - VOTE_WINDOW_MS).toISOString()
  const res = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { status: { equals: 'finished' } },
          { finishedAt: { less_than: cutoff } },
          { analyseOnly: { not_equals: true } },
          { isDemo: { not_equals: true } },
        ],
      },
      sort: '-finishedAt',
      depth: 0,
      limit,
      overrideAccess: true,
    })
    .catch(() => null)

  let settled = 0
  for (const match of res?.docs ?? []) {
    const trust = sanitizeTrust((match as { scoreTrust?: unknown }).scoreTrust)
    const finishedAt = (match as { finishedAt?: string | null }).finishedAt ?? null
    if (!needsSettling(trust, match.status as string, finishedAt)) continue
    const label = trustLabel(trust, { official: false })
    const scorerId = trust.scorerId as number
    const current = await readUserTrust(payload, scorerId)
    await writeUserTrust(payload, scorerId, applyMatchOutcome(current, label))
    await writeMatchTrust(payload, match.id as number, markSettled(trust))
    settled += 1
  }
  return settled
}

/**
 * Boekt één aantekenactie op de vertrouwensstaat van de wedstrijd:
 *  - wie nog niemand claimde, wordt zelf official scorer (wie effectief aantekent, ís de scorer —
 *    zo hoeft niemand eerst een knop te zoeken);
 *  - anders houdt de actie de bestaande claim levend;
 *  - en we onthouden wie meetekende, zodat die persoon zijn eigen werk niet kan bevestigen.
 * Best effort en losgekoppeld — het aantekenen zelf mag hier nooit op stuklopen of vertragen.
 *
 * Ook in de federatieflow (waar de confirm/dispute-laag niet bestaat, zie isOfficialScore): de
 * claim/lastActiveAt hier bijgehouden is precies wat "iemand tekent deze wedstrijd al aan" elders
 * (wedstrijddag-acties.ts, scorekeeper/[id]/page.tsx) laat zien, zodat een tweede aantekenaar niet
 * per ongeluk dubbel begint. Dat staat los van de publieke 🟢/🟡-badge, die blijft `official` tonen.
 */
export function noteContribution(matchId: number, user: { id: number; name: string }): void {
  setTimeout(() => {
    void run(matchId, user).catch(() => {})
  }, 0)
}

async function run(matchId: number, user: { id: number; name: string }): Promise<void> {
  const { getPayloadClient } = await import('./payload-client')
  const { withLock } = await import('./async-mutex')
  const payload = await getPayloadClient()
  // Serialiseer op een eigen sleutel: twee gelijktijdige bijdragen mogen elkaars teller niet
  // overschrijven (lees-wijzig-schrijf op één json-kolom).
  await withLock(`trust:${matchId}`, async () => {
    const match = await payload
      .findByID({ collection: 'matches', id: matchId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!match) return
    // Demo's en privé-analyseopnames hebben geen publiek vertrouwen te winnen.
    if ((match as { isDemo?: boolean }).isDemo || (match as { analyseOnly?: boolean }).analyseOnly) return
    let trust = sanitizeTrust((match as { scoreTrust?: unknown }).scoreTrust)
    if (!claimHeld(trust, (match as { status?: string }).status === 'live')) {
      trust = claimScorer(trust, { ...user, trust: await userTrustScore(payload, user.id) })
    }
    await writeMatchTrust(payload, matchId, recordContribution(trust, user))
  })
}

/**
 * Hartslag van het aantekenscherm: de houder is er nog (ook als er even niet gescoord wordt).
 * Zonder dit zou een rustige fase in de wedstrijd lijken op een uitgevallen toestel.
 */
export async function aanwezigMelden(payload: Payload, matchId: number, userId: number): Promise<void> {
  const { withLock } = await import('./async-mutex')
  await withLock(`trust:${matchId}`, async () => {
    const trust = await readMatchTrust(payload, matchId)
    if (trust.scorerId !== userId) return
    await writeMatchTrust(payload, matchId, noteAanwezig(trust, userId))
  })
}

/**
 * Neem een lopende wedstrijd over (zie overneemWeigering in score-trust.ts). Geeft `null` bij
 * succes, anders de reden. De vorige houder krijgt bij zijn volgende tik de gewone blokkade
 * ("X tekent deze wedstrijd al aan"), zodat er nooit twee tafels door elkaar scoren.
 */
export async function wedstrijdOvernemen(
  payload: Payload,
  matchId: number,
  user: { id: number; name: string },
  rol: { scheidsrechter: boolean; federatie: boolean },
): Promise<string | null> {
  const { withLock } = await import('./async-mutex')
  return withLock(`trust:${matchId}`, async () => {
    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0, overrideAccess: true }).catch(() => null)
    if (!match) return 'Wedstrijd niet gevonden.'
    const trust = sanitizeTrust((match as { scoreTrust?: unknown }).scoreTrust)
    const weigering = overneemWeigering(trust, { userId: user.id, live: match.status === 'live', ...rol })
    if (weigering) return weigering
    if (trust.scorerId === user.id) return null
    console.info(`aantekenen overgenomen: wedstrijd ${matchId}, van ${trust.scorerName ?? '—'} (${trust.scorerId ?? '—'}) naar ${user.name} (${user.id})`)
    await writeMatchTrust(payload, matchId, claimScorer(trust, { ...user, trust: await userTrustScore(payload, user.id) }))
    return null
  })
}
