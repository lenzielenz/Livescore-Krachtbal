import type { Payload } from 'payload'

import { isTestOmgeving } from './omgeving'

// Globale aantekenmodus: één knop voor ALLE wedstrijden (staat op de settings-global).
//  - 'federatie' (standaard): de volledige flow — opstelling + scheidsrechtersakkoord vóór de
//    start, en aftekenen achteraf. Enkel gemachtigde aantekenaars muteren.
//  - 'supporters': vrije livescore voor alle wedstrijden. De hele keten opstelling →
//    scheidsrechter → aftekenen valt weg; élke INGELOGDE gebruiker opent een wedstrijd en geeft
//    gewoon de score door. Aanmelden blijft dus vereist (api-auth.ts weigert een anonieme
//    mutatie) — hier stond eerder "ook zonder login", en dat klopt niet.
//    Welke knoppen dat per scherm oplevert, staat in wedstrijddag-acties.ts.
export const SCORE_MODES = ['federatie', 'supporters'] as const
export type ScoreMode = (typeof SCORE_MODES)[number]

/**
 * Lees de globale aantekenmodus (standaard 'federatie'). In de federatie-testomgeving staat ze
 * altijd op 'federatie', wat er ook in de settings staat (zie omgeving.ts): daar test je net de
 * federatieflow, en een per ongeluk omgezette knop mag dat niet ongemerkt uitschakelen.
 */
export async function getScoreMode(payload: Payload): Promise<ScoreMode> {
  if (isTestOmgeving()) return 'federatie'
  const s = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  return (s as { scoreMode?: string } | null)?.scoreMode === 'supporters' ? 'supporters' : 'federatie'
}

/** Staat het hele platform in supporters-modus (vrije livescore voor alle wedstrijden)? */
export async function isSupportersMode(payload: Payload): Promise<boolean> {
  return (await getScoreMode(payload)) === 'supporters'
}
