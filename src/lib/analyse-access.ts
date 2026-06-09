import type { Where } from 'payload'

import { isFederationLevel } from './access'

// Analyse-data is privé per persoon: je ziet enkel je eigen analyse-opnames (analyseOnly), terwijl
// officiële (niet-analyseOnly) wedstrijden gedeeld blijven. Federatie/admin ziet álles en kan zo
// achteraf alle data samenbrengen/importeren.
//
// Retourneert een Where-fragment dat je in de `and` van een matches-query duwt, of `null` als er
// geen beperking nodig is (federatie/admin).
export function analyseMatchWhere(user: unknown): Where | null {
  if (isFederationLevel(user)) return null // admin/federatie: geen beperking
  const id = (user as { id?: number | string } | null)?.id
  if (id == null) {
    // Niet (her)kend: enkel officiële wedstrijden, nooit andermans analyse-opnames.
    return { analyseOnly: { not_equals: true } }
  }
  return {
    or: [{ analyseOnly: { not_equals: true } }, { analyseOwner: { equals: id } }],
  }
}

// Sinds de analyse-laag een eigen, losstaande database heeft (clubs/ploegen/spelers met
// analyseOnly + analyseOwner, net als matches) gebruiken we STRIKTE scoping i.p.v. het mengen van
// competitie + eigen analyse. De twee helpers hieronder zijn de bron van waarheid:
//
//   • analyseOwnWhere(user)  → enkel de eigen analyse-data (binnen de hele /analyse-sectie).
//   • competitionWhere()     → enkel competitie-data (overal BUITEN /analyse, om analyse te verbergen).

/**
 * Strikt eigen-analyse Where-fragment voor clubs/teams/players/matches: enkel records die als
 * analyse gemarkeerd zijn (`analyseOnly`) én van deze gebruiker (`analyseOwner`). Zonder herkende
 * gebruiker valt het terug op een onmogelijke eigenaar (-1) zodat er niets lekt. Admin/federatie
 * krijgen bewust óók enkel hun eigen analyse-data: iedereen bouwt zo zijn eigen afgeschermde set.
 */
export function analyseOwnWhere(user: unknown): Where {
  const id = (user as { id?: number | string } | null)?.id
  return {
    and: [{ analyseOnly: { equals: true } }, { analyseOwner: { equals: id ?? -1 } }],
  }
}

/**
 * Competitie-Where-fragment: sluit alle analyse-entiteiten uit. Voeg dit toe aan élke
 * clubs/teams/players/matches-query buiten de analyse-sectie (live, rangschikking, kantine, beheer,
 * import …) zodat analyse-eigen clubs/ploegen/spelers nooit in de competitie opduiken.
 */
export function competitionWhere(): Where {
  return { analyseOnly: { not_equals: true } }
}

/** Mag deze gebruiker deze specifieke (analyse-)wedstrijd bekijken? */
export function canViewAnalyseMatch(
  user: unknown,
  match: { analyseOnly?: boolean | null; analyseOwner?: unknown } | null,
): boolean {
  if (!match) return false
  if (isFederationLevel(user)) return true
  if (!match.analyseOnly) return true // officiële wedstrijd → gedeeld
  const ownerId = match.analyseOwner && typeof match.analyseOwner === 'object'
    ? (match.analyseOwner as { id?: number | string }).id
    : match.analyseOwner
  const me = (user as { id?: number | string } | null)?.id
  return me != null && ownerId != null && String(ownerId) === String(me)
}
