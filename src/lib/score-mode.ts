import type { Payload } from 'payload'

// Globale aantekenmodus: één knop voor ALLE wedstrijden (staat op de settings-global).
//  - 'federatie' (standaard): de volledige flow — opstelling + scheidsrechtersakkoord vóór de
//    start, en aftekenen achteraf. Enkel gemachtigde aantekenaars muteren.
//  - 'supporters': vrije livescore voor alle wedstrijden. De hele scheidsrechter-/aftekenflow
//    valt weg; iedereen kan een wedstrijd openen en gewoon de score doorgeven, ook zonder login.
export type ScoreMode = 'federatie' | 'supporters'

/** Lees de globale aantekenmodus (standaard 'federatie'). */
export async function getScoreMode(payload: Payload): Promise<ScoreMode> {
  const s = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  return (s as { scoreMode?: string } | null)?.scoreMode === 'supporters' ? 'supporters' : 'federatie'
}

/** Staat het hele platform in supporters-modus (vrije livescore voor alle wedstrijden)? */
export async function isSupportersMode(payload: Payload): Promise<boolean> {
  return (await getScoreMode(payload)) === 'supporters'
}
