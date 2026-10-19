// Gedeelde authenticatie/autorisatie voor de custom REST-routes onder /api/*.
//
// DECISION: de custom routes draaien de match-engine met overrideAccess:true (de server is
// vertrouwd), dus Payload's collection-access is hier GÉÉN vangnet. Elke muterende route MOET
// daarom hier eerst de beller verifiëren vóór ze de engine aanroept. Eén bron van waarheid.

import type { Payload } from 'payload'

import { canAnalyse, hasRole, isFederationLevel, userClubId, userOfficialId, type UserRole } from './access'
import { analyseEditOwners } from './analyse-access'
import { isSupportersMode } from './score-mode'
import { mayClaim, sanitizeTrust } from './score-trust'

export type AuthedUser = { id: number | string; roles?: UserRole[] | null } & Record<string, unknown>

/** Haal de ingelogde gebruiker op uit de request-headers; nooit gooien. */
export async function authUser(payload: Payload, req: Request): Promise<AuthedUser | null> {
  const { user } = await payload.auth({ headers: req.headers }).catch(() => ({ user: null }))
  return (user as AuthedUser | null) ?? null
}

/** 401 indien niet ingelogd, 403 indien rol ontbreekt; anders null (= ok). */
export function requireRole(user: AuthedUser | null, ...roles: UserRole[]): Response | null {
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (isFederationLevel(user)) return null
  if (!hasRole(user, ...roles)) return Response.json({ error: 'Geen rechten.' }, { status: 403 })
  return null
}

const relId = (rel: unknown): number | string | null => {
  if (rel == null) return null
  if (typeof rel === 'object') return (rel as { id: number | string }).id
  return rel as number | string
}

/** Club-id's van de thuis- en uitploeg van een wedstrijd (null als onbekend). */
export async function matchSideClubs(
  payload: Payload,
  matchId: number | string,
): Promise<{ home: number | string | null; away: number | string | null }> {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  if (!match) return { home: null, away: null }
  const clubOf = (teamRel: unknown) => {
    const team = typeof teamRel === 'object' && teamRel ? (teamRel as { club?: unknown }) : null
    return team ? relId(team.club) : null
  }
  return { home: clubOf(match.homeTeam), away: clubOf(match.awayTeam) }
}

/** Welke clubs zijn bij een wedstrijd betrokken (thuis + uit)? */
async function matchClubIds(payload: Payload, matchId: number | string): Promise<(number | string)[]> {
  const { home, away } = await matchSideClubs(payload, matchId)
  return [home, away].filter((c): c is number | string => c != null)
}

/**
 * Mag deze gebruiker de score van DEZE wedstrijd bedienen?
 * - demo: iedereen, ook zonder login (oefenmodus)
 * - globale supporters-modus: élke ingelogde gebruiker (login verplicht, analyse-opnames uitgezonderd)
 * - admin/federatie: altijd
 * - scorekeeper: ja (vertrouwde aantekenaar — strikte per-match-binding kan later via vrijgaveCode)
 * - scheidsrechter: gebonden aan de toewijzing — is er een toegewezen (backup-)SR op het blad, dan
 *   mag enkel die; staat er geen toewijzing, dan mag elke scheidsrechter (backwards compatible)
 * - club-beheerder: enkel als de eigen club bij de wedstrijd betrokken is
 */
export async function mayScoreMatch(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number | string,
): Promise<boolean> {
  // Gemachtigde aantekenaars mogen meteen — geen extra query nodig.
  if (user && (isFederationLevel(user) || hasRole(user, 'scorekeeper'))) return true
  // Demo-wedstrijden zijn vrij speelbaar, ook zonder login (oefenmodus).
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  // In supportersmodus staat de demo uit (zie demo/page.tsx).
  if (match && (match as { isDemo?: boolean }).isDemo) return !(await isSupportersMode(payload))
  // Globale supporters-modus (één knop voor alle wedstrijden): vrije livescore, losgekoppeld van de
  // federatie — élke INGELOGDE gebruiker mag de score doorgeven (geen scheidsrechter/aftekenen nodig).
  // Aanmelden is wél verplicht: anonieme wijzigingen laten we niet toe. Private analyse-opnames
  // blijven afgeschermd (die zijn geen publieke wedstrijd).
  if (user && match && !(match as { analyseOnly?: boolean }).analyseOnly && (await isSupportersMode(payload))) {
    // Vertrouwenslaag: heeft iemand deze wedstrijd geclaimd als official scorer en is die claim nog
    // levend, dan tekent enkel hij aan — de rest bevestigt of betwist de stand (zie score-trust.ts).
    // Zo krijg je het beste van beide: crowd voor de liveness, één vertrouwd persoon voor de uitslag.
    // Vóór de aftrap vervalt een claim bij lange stilte; op een lopende wedstrijd niet (claimHeld).
    return mayClaim(sanitizeTrust((match as { scoreTrust?: unknown }).scoreTrust), Number(user.id), Date.now(), match.status === 'live')
  }
  if (!user) return false
  // Analyse-opname: de eigenaar (met analyse-toegang) tekent z'n eigen analysewedstrijd aan —
  // of iemand aan wie de eigenaar "meedoen & aanpassen" toekende.
  if (match && (match as { analyseOnly?: boolean }).analyseOnly && canAnalyse(user)) {
    const ownerId = relId((match as { analyseOwner?: unknown }).analyseOwner)
    if (ownerId != null && analyseEditOwners(user).some((x) => String(x) === String(ownerId))) return true
  }
  if (hasRole(user, 'scheidsrechter')) return refereeMayHandleMatch(payload, user, matchId)
  if (hasRole(user, 'club-beheerder', 'club-medewerker')) {
    const clubId = userClubId(user)
    if (clubId == null) return false
    const clubs = await matchClubIds(payload, matchId)
    return clubs.some((c) => String(c) === String(clubId))
  }
  return false
}

/**
 * Mag deze gebruiker een VERGISSING rechtzetten (een wedstrijd heropenen of terugzetten op
 * niet-gestart)? Dat is zwaarder dan gewoon aantekenen: het raakt een vastgelegde eindstand.
 * Daarom valt de losse supporters-modus hier weg — enkel wie een echte aantekenrol draagt
 * (federatie, aantekenaar, de scheidsrechter van dienst of de staf van een betrokken club) komt
 * erdoor. Een demo-wedstrijd blijft vrij: daar valt niets te beschermen.
 */
export async function mayCorrectMatch(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number | string,
): Promise<boolean> {
  if (!user) return false
  if (isFederationLevel(user) || hasRole(user, 'scorekeeper')) return true
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (match && (match as { isDemo?: boolean }).isDemo) return true
  if (hasRole(user, 'scheidsrechter')) {
    // Zelfde regel als bij aantekenen: staat er niemand op het blad, dan mag elke
    // scheidsrechter. Vóór 2026-09-06 stond hier `isAssignedReferee`, die bij een
    // wedstrijd zónder toewijzing (of zonder wedstrijdblad) false gaf. Gevolg: een
    // scheidsrechter kon zo'n wedstrijd wél aantekenen maar niet terugzetten, en las
    // dan een foutmelding die zei dat hij aantekenaar moest zijn — terwijl hij dat
    // was. Twee vragen die hetzelfde blad lezen horen hetzelfde antwoord te geven.
    return refereeMayHandleMatch(payload, user, matchId)
  }
  if (hasRole(user, 'club-beheerder', 'club-medewerker')) {
    const clubId = userClubId(user)
    if (clubId == null) return false
    const clubs = await matchClubIds(payload, matchId)
    return clubs.some((c) => String(c) === String(clubId))
  }
  return false
}

/**
 * Waarom mag deze gebruiker de wedstrijd niet rechtzetten? Geeft null wanneer het wél mag.
 *
 * Bestaat omdat de oude melding ("Enkel de aantekenaar, de scheidsrechter of de federatie
 * kan …") een rollijst opsomde in plaats van te zeggen wat er in dít geval scheelt. Wie de
 * wedstrijd op dat moment zat aan te tekenen las daarin een tegenspraak: hij ís aantekenaar,
 * en toch mag het niet. Nu benoemt de melding de eigen situatie en de weg vooruit.
 */
export async function correctionBlockedReason(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number | string,
  werkwoord: 'heropenen',
): Promise<string | null> {
  if (await mayCorrectMatch(payload, user, matchId)) return null
  if (!user) return 'Meld je eerst aan.'
  // Kan hij de wedstrijd wél aantekenen? Dan komt dat recht uit de open livescore-modus (of uit
  // een analyse-opname), en niet uit een aantekenrol. Precies dat verschil moet de melding zeggen.
  if (await mayScoreMatch(payload, user, matchId)) {
    return (
      `Je tekent deze wedstrijd aan via de open livescore, en dat is niet hetzelfde als de ` +
      `aantekenaar van dienst zijn. Heropenen raakt een vastgelegde eindstand, dus dat mag alleen ` +
      `de scheidsrechter van dienst, iemand van de clubstaf of de federatie. Vraag het aan hen — ` +
      `of geef hier door wat er moet wijzigen.`
    )
  }
  return `Je hebt geen rechten om deze wedstrijd te ${werkwoord}.`
}

/**
 * Mag deze scheidsrechter deze wedstrijd bedienen? Staat er een (backup-)SR op het wedstrijdblad,
 * dan enkel die; staat er niemand, dan elke scheidsrechter (backwards compatible — veel
 * jeugdwedstrijden krijgen nooit een toewijzing).
 *
 * Eén functie voor aantekenen én rechtzetten: dat die twee ooit uit elkaar liepen was de oorzaak
 * van "ik mag wel aantekenen maar niet terugzetten".
 */
export async function refereeMayHandleMatch(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number | string,
): Promise<boolean> {
  if (!user) return false
  const sheets = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1 })
    .catch(() => null)
  const sheet = sheets?.docs?.[0]
  const assigned = [sheet?.assignedReferee, sheet?.backupReferee]
    .map((r) => (typeof r === 'object' && r ? (r as { id: number }).id : r))
    .filter((x) => x != null)
  if (assigned.length === 0) return true // geen toewijzing → elke SR mag
  const own = userOfficialId(user)
  return own != null && assigned.some((id) => String(id) === String(own))
}

/** Is deze gebruiker (niet-federatie) de toegewezen/backup-scheidsrechter van deze wedstrijd? */
export async function isAssignedReferee(
  payload: Payload,
  user: AuthedUser | null,
  matchId: number | string,
): Promise<boolean> {
  if (!user) return false
  if (isFederationLevel(user)) return true
  const ownOfficial = userOfficialId(user)
  if (ownOfficial == null) return false
  const sheets = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1 })
    .catch(() => null)
  const sheet = sheets?.docs?.[0]
  if (!sheet) return false
  const ids = [sheet.assignedReferee, sheet.backupReferee]
    .map((r) => (typeof r === 'object' && r ? (r as { id: number }).id : r))
    .filter((x) => x != null)
  return ids.some((id) => String(id) === String(ownOfficial))
}

export { isFederationLevel, hasRole, userClubId, userOfficialId }
