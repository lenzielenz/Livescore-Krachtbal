import type { Payload } from 'payload'

import {
  boekAantekenaar,
  sanitizeAantekenaars,
  sanitizeAfsluiter,
  veiligeNaam,
  type Aantekenaar,
  type AantekenaarRol,
  type Afsluiter,
} from './aantekenaars'

// Opslaglaag van het auditspoor op tornooiwedstrijden: leest en schrijft de json-kolommen
// `tournament_matches.aantekenaars` en `.afgesloten_door`. De regels zelf staan in aantekenaars.ts
// (puur, getest); hier zit enkel het heen-en-weer met Payload.
//
// Alles draait overrideAccess: de tornooi-engine muteert sowieso als systeem, en dit spoor moet
// geschreven kunnen worden ongeacht wat de aanroeper zelf mag lezen.

const COLL = 'tournament-matches'

export interface Aantekening {
  lijst: Aantekenaar[]
  afsluiter: Afsluiter | null
}

export async function readAantekening(payload: Payload, matchId: number): Promise<Aantekening> {
  const rij = await payload
    .findByID({ collection: COLL, id: matchId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!rij) return { lijst: [], afsluiter: null }
  return {
    lijst: sanitizeAantekenaars((rij as { aantekenaars?: unknown }).aantekenaars),
    afsluiter: sanitizeAfsluiter((rij as { afgeslotenDoor?: unknown }).afgeslotenDoor),
  }
}

/**
 * Boek één geslaagde aantekenactie.
 *
 * Roep dit aan NA de mutatie en binnen dezelfde lock als de mutatie zelf: het is een
 * lees-wijzig-schrijf op één json-kolom, en twee gelijktijdige acties zouden elkaars teller
 * overschrijven.
 *
 * `sluitAf` zet daarnaast de handtekening onder de eindstand. Die schrijven we maar één keer: is de
 * wedstrijd later heropend en opnieuw afgesloten, dan telt wie ze het laatst afsloot — vandaar dat
 * we overschrijven zodra er opnieuw afgesloten wordt.
 */
export async function boekAantekening(
  payload: Payload,
  matchId: number,
  wie: { id: number; naam: unknown; rol: AantekenaarRol },
  opties: { sluitAf?: boolean; nu?: number } = {},
): Promise<void> {
  const nu = opties.nu ?? Date.now()
  const huidig = await readAantekening(payload, matchId)
  const lijst = boekAantekenaar(huidig.lijst, wie, nu)
  const data: Record<string, unknown> = { aantekenaars: lijst }
  if (opties.sluitAf) {
    data.afgeslotenDoor = { id: wie.id, naam: veiligeNaam(wie.naam), op: nu } satisfies Afsluiter
  }
  await payload.update({ collection: COLL, id: matchId, data, overrideAccess: true })
}
