import type { Payload } from 'payload'

import { betrokkenen } from '@/lib/aftrap'
import { formatDateTimeBE } from '@/lib/datetime'
import { relId } from '@/lib/federatie-api'
import { meld } from '@/lib/meldingen'
import { sendPushToClubs } from '@/lib/push'

// Eén geplande wedstrijd naar een nieuw tijdstip brengen en iedereen verwittigen: de staf van beide
// clubs, de scheidsrechter (die meteen kan laten weten als hij dan niet kan) en de spelers op de
// selectie. Gedeeld door de losse verplaatsing (/api/federatie/verplaatsen) en de verplaatsing van
// een heel weekend (/api/federatie/weekend-verplaatsen), zodat beide hetzelfde doen en melden.

type Ploeg = { name?: unknown; club?: unknown } | null
const ploeg = (v: unknown): Ploeg => (v && typeof v === 'object' ? (v as Ploeg) : null)

export type Verplaatsing = { ok: true; verplaatst: boolean } | { ok: false; reden: string }

/**
 * Verplaatst een wedstrijd (opgehaald met depth ≥ 1) naar `datum`. Enkel geplande wedstrijden; een
 * lopende of afgelopen wedstrijd verplaats je niet. Een afgelaste wedstrijd krijgt zo haar nieuwe
 * datum en wordt weer speelbaar. `doorUser` krijgt zelf geen melding. `extraTekst` komt achter het
 * nieuwe tijdstip in de melding (bv. "Het hele speelweekend van week 43 is verplaatst.").
 */
export async function verplaatsWedstrijd(
  payload: Payload,
  match: { id: number | string; status?: unknown; date?: unknown; homeTeam?: unknown; awayTeam?: unknown },
  datum: Date,
  o: { doorUser: number; extraTekst?: string },
): Promise<Verplaatsing> {
  const matchId = Number(match.id)
  if (Number.isNaN(datum.getTime())) return { ok: false, reden: 'ongeldige datum' }
  if (match.status !== 'scheduled') return { ok: false, reden: match.status === 'live' ? 'is bezig' : 'is al gespeeld' }
  if (new Date(String(match.date)).getTime() === datum.getTime()) return { ok: true, verplaatst: false }
  await payload.update({ collection: 'matches', id: matchId, data: { date: datum.toISOString(), afgelast: false }, overrideAccess: true })
  const thuis = ploeg(match.homeTeam)
  const uit = ploeg(match.awayTeam)
  const titel = `${String(thuis?.name ?? '')} – ${String(uit?.name ?? '')}`
  const wie = (await betrokkenen(payload, { id: matchId, homeTeam: match.homeTeam, awayTeam: match.awayTeam }).catch(() => [] as number[])).filter((id) => id !== o.doorUser)
  await meld(payload, wie, {
    titel: `🔁 Verplaatst: ${titel}`,
    tekst: `Nieuw tijdstip: ${formatDateTimeBE(datum.toISOString())} (was ${formatDateTimeBE(String(match.date))}).${o.extraTekst ? ` ${o.extraTekst}` : ''} Scheidsrechter: kan je dan niet, laat het de federatie meteen weten.`,
    url: `/match/${matchId}`,
  }).catch(() => 0)
  void sendPushToClubs(payload, [relId(thuis?.club), relId(uit?.club)], {
    title: '🔁 Wedstrijd verplaatst',
    body: `${titel}: nu ${formatDateTimeBE(datum.toISOString())}`,
    url: `/match/${matchId}`,
    tag: `verplaatst-${matchId}`,
  }).catch(() => null)
  return { ok: true, verplaatst: true }
}
