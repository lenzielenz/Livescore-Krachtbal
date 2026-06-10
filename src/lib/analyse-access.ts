import type { Where } from 'payload'

import { isFederationLevel } from './access'

// Analyse-data is privé per persoon: je ziet enkel je eigen analyse-opnames (analyseOnly), terwijl
// officiële (niet-analyseOnly) wedstrijden gedeeld blijven. Federatie/admin ziet álles en kan zo
// achteraf alle data samenbrengen/importeren.
//
// Delen: een eigenaar kan zijn analyses delen met gekozen accounts (users.analyseDeeltMet). De
// inverse (users.analyseToegangTot — wiens analyses mag IK zien) wordt automatisch bijgehouden en
// zit mee in het ingelogde user-object, dus alle Where-helpers hieronder kunnen ze zonder extra
// opzoeking meenemen.

const relIds = (raw: unknown): (number | string)[] =>
  Array.isArray(raw)
    ? raw
        .map((x) => (x && typeof x === 'object' ? (x as { id?: number | string }).id : (x as number | string)))
        .filter((x): x is number | string => x != null)
    : []

/** Alle analyse-eigenaars die deze gebruiker mag ZIEN: zichzelf + wie met hem/haar deelt
 * (alleen-lezen én meedoen — meedoeners zien uiteraard ook). */
export function analyseOwners(user: unknown): (number | string)[] {
  const own = (user as { id?: number | string } | null)?.id
  const kijken = relIds((user as { analyseToegangTot?: unknown } | null)?.analyseToegangTot)
  const bewerken = relIds((user as { analyseBewerkTot?: unknown } | null)?.analyseBewerkTot)
  const gedeeld = [...new Set([...kijken, ...bewerken])]
  return own != null ? [own, ...gedeeld.filter((x) => String(x) !== String(own))] : gedeeld
}

/** De analyse-eigenaars wiens data deze gebruiker mag BEWERKEN: zichzelf + wie "meedoen &
 * aanpassen" toekende. Alleen-lezen-delers horen hier bewust NIET bij. */
export function analyseEditOwners(user: unknown): (number | string)[] {
  const own = (user as { id?: number | string } | null)?.id
  const bewerken = relIds((user as { analyseBewerkTot?: unknown } | null)?.analyseBewerkTot)
  return own != null ? [own, ...bewerken.filter((x) => String(x) !== String(own))] : bewerken
}

// Retourneert een Where-fragment dat je in de `and` van een matches-query duwt, of `null` als er
// geen beperking nodig is (federatie/admin).
export function analyseMatchWhere(user: unknown): Where | null {
  if (isFederationLevel(user)) return null // admin/federatie: geen beperking
  const owners = analyseOwners(user)
  if (owners.length === 0) {
    // Niet (her)kend: enkel officiële wedstrijden, nooit andermans analyse-opnames.
    return { analyseOnly: { not_equals: true } }
  }
  return {
    or: [{ analyseOnly: { not_equals: true } }, { analyseOwner: { in: owners } }],
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
 * analyse gemarkeerd zijn (`analyseOnly`) én van deze gebruiker (`analyseOwner`) — of van iemand
 * die zijn analyses met deze gebruiker deelt. Zonder herkende gebruiker valt het terug op een
 * onmogelijke eigenaar (-1) zodat er niets lekt. Admin/federatie krijgen bewust óók enkel hun
 * eigen (+ gedeelde) analyse-data: iedereen bouwt zo zijn eigen afgeschermde set.
 */
export function analyseOwnWhere(user: unknown): Where {
  const owners = analyseOwners(user)
  return {
    and: [{ analyseOnly: { equals: true } }, { analyseOwner: { in: owners.length ? owners : [-1] } }],
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
  if (ownerId == null) return false
  return analyseOwners(user).some((x) => String(x) === String(ownerId))
}
