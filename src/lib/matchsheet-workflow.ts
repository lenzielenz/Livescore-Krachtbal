// State-machine voor het digitale wedstrijdblad (WEDSTRIJDBLAD-PROMPT §De workflow).
// Strikte volgorde van statussen; elke overgang heeft toegelaten bronstatussen en rollen.
// Na 'ingediend' is niets meer wijzigbaar (reglement Item 37).

import { hasRole, isFederationLevel, type UserRole } from './access'

export const MATCHSHEET_STATUSES = [
  'concept', // clubs vullen eigen opstelling in
  'vrijgegeven', // ~1u voor aanvang: scheidsrechter ziet beide opstellingen
  'wedstrijdklaar', // scheidsrechter heeft gecontroleerd; clubs kunnen niet meer wijzigen
  'bezig', // wedstrijd loopt; live-scoring voedt het blad
  'af_te_tekenen', // na de wedstrijd: kapiteins + scheidsrechter tekenen af
  'ingediend', // PDF + mail + upload; onwijzigbaar
] as const

export type MatchSheetStatus = (typeof MATCHSHEET_STATUSES)[number]

export const MATCHSHEET_STATUS_OPTIONS: { label: string; value: MatchSheetStatus }[] = [
  { label: 'Concept', value: 'concept' },
  { label: 'Vrijgegeven', value: 'vrijgegeven' },
  { label: 'Wedstrijdklaar', value: 'wedstrijdklaar' },
  { label: 'Bezig', value: 'bezig' },
  { label: 'Af te tekenen', value: 'af_te_tekenen' },
  { label: 'Ingediend', value: 'ingediend' },
]

// Toegelaten voorwaartse overgangen (van → naar). De state-machine is lineair, maar de
// scheidsrechter/federatie mag (zolang ≠ ingediend) ook terugzetten via override.
const FORWARD: Record<MatchSheetStatus, MatchSheetStatus | null> = {
  concept: 'vrijgegeven',
  vrijgegeven: 'wedstrijdklaar',
  wedstrijdklaar: 'bezig',
  bezig: 'af_te_tekenen',
  af_te_tekenen: 'ingediend',
  ingediend: null,
}

export function nextStatus(status: MatchSheetStatus): MatchSheetStatus | null {
  return FORWARD[status]
}

export function isFinal(status: MatchSheetStatus): boolean {
  return status === 'ingediend'
}

/** Wie mag clubs-velden (opstelling) nog wijzigen? Enkel in concept. */
export function clubsMayEditLineup(status: MatchSheetStatus): boolean {
  return status === 'concept'
}

/**
 * Mag de scheidsrechter de opstellingen al zien? Vanaf `releaseMinutesBefore` vóór het
 * aanvangsuur (WEDSTRIJDBLAD-PROMPT §workflow vrijgegeven). Configureerbaar via Settings.
 */
export function isReleaseTime(
  matchDate: string | Date,
  releaseMinutesBefore: number,
  now: Date,
): boolean {
  const start = matchDate instanceof Date ? matchDate : new Date(matchDate)
  if (Number.isNaN(start.getTime())) return false
  const releaseAt = start.getTime() - releaseMinutesBefore * 60_000
  return now.getTime() >= releaseAt
}

export type TransitionCheck = { allowed: boolean; reason?: string }

/**
 * Mag `user` de status wijzigen van `from` naar `to`?
 * Regels (WEDSTRIJDBLAD-PROMPT):
 * - Na 'ingediend' kan niets meer (Item 37).
 * - Voorwaartse overgang met één stap is de normale weg.
 * - Federatie/admin én de toegewezen scheidsrechter mogen altijd manueel overschrijven
 *   (ook terug) zolang status ≠ 'ingediend'. Dit gaat in de override-log.
 * - Een gewone voorwaartse stap mag door de bevoegde rol voor die fase.
 */
export function canTransition(
  from: MatchSheetStatus,
  to: MatchSheetStatus,
  opts: { roles: UserRole[]; isAssignedReferee: boolean },
): TransitionCheck {
  if (from === to) return { allowed: true }
  if (isFinal(from)) {
    return { allowed: false, reason: 'Het blad is ingediend en kan niet meer gewijzigd worden (Item 37).' }
  }

  const user = { roles: opts.roles }
  const federation = isFederationLevel(user)
  const referee = opts.isAssignedReferee || hasRole(user, 'scheidsrechter')

  // Federatie/admin en (toegewezen) scheidsrechter mogen vrij schakelen zolang niet ingediend.
  if (federation || referee) return { allowed: true }

  // Club-beheerder mag het blad enkel van concept → vrijgegeven brengen (eigen opstelling klaar).
  if (hasRole(user, 'club-beheerder') && from === 'concept' && to === 'vrijgegeven') {
    return { allowed: true }
  }

  return { allowed: false, reason: 'Je rol mag deze statusovergang niet uitvoeren.' }
}
