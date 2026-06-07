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
