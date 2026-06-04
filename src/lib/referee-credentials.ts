// Stateloze QR-/code-credentials voor het vrijgeven van een wedstrijd door de scheidsrechter.
//
// DECISION: i.p.v. een nieuwe tabel/kolom bewaren we niets in de database. Een credential is
// een korte string met een HMAC-handtekening over het official-id (en, voor 'ziek'-delegaties,
// een vervaltijd). De server hertekent en vergelijkt — geldig of niet. Dit vermijdt een migratie
// en houdt de tijdelijke codes vanzelf vervallend. Enkel server-side te gebruiken (node:crypto).

import { createHmac } from 'node:crypto'

const PERSONAL_PREFIX = 'KBSR1'
const DELEGATION_PREFIX = 'KBDG1'

function sig(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16)
}

/** Persoonlijke QR-waarde van een scheidsrechter (uniek per official, stateless). */
export function personalQrValue(secret: string, officialId: number | string): string {
  const id = String(officialId)
  return `${PERSONAL_PREFIX}.${id}.${sig(secret, `${PERSONAL_PREFIX}:${id}`)}`
}

/** Korte, typbare persoonlijke backup-code (8 tekens) — afgeleid, dus stateless. */
export function personalCode(secret: string, officialId: number | string): string {
  const id = String(officialId)
  return sig(secret, `${PERSONAL_PREFIX}code:${id}`).slice(0, 8).toUpperCase()
}

/** Tijdelijke 'ziek'-delegatie: QR-waarde met ingebakken vervaltijd (unix-seconden). */
export function delegationQrValue(
  secret: string,
  officialId: number | string,
  expiresAtMs: number,
): string {
  const id = String(officialId)
  const exp = Math.floor(expiresAtMs / 1000)
  return `${DELEGATION_PREFIX}.${id}.${exp}.${sig(secret, `${DELEGATION_PREFIX}:${id}:${exp}`)}`
}

export type Credential =
  | { kind: 'personal'; officialId: string }
  | { kind: 'delegation'; officialId: string; expiresAt: number; expired: boolean }

/** Verifieert een gescande/ingetikte credential-string. Geeft null bij ongeldige handtekening. */
export function verifyCredential(secret: string, raw: string, now = Date.now()): Credential | null {
  const parts = raw.trim().split('.')
  if (parts[0] === PERSONAL_PREFIX && parts.length === 3) {
    const [, id, mac] = parts
    return mac === sig(secret, `${PERSONAL_PREFIX}:${id}`) ? { kind: 'personal', officialId: id } : null
  }
  if (parts[0] === DELEGATION_PREFIX && parts.length === 4) {
    const [, id, expStr, mac] = parts
    const exp = Number(expStr)
    if (!Number.isFinite(exp)) return null
    if (mac !== sig(secret, `${DELEGATION_PREFIX}:${id}:${exp}`)) return null
    return { kind: 'delegation', officialId: id, expiresAt: exp * 1000, expired: now > exp * 1000 }
  }
  return null
}

/** Matcht een ingetikte korte code tegen de persoonlijke code van één van de kandidaat-officials. */
export function matchPersonalCode(
  secret: string,
  code: string,
  candidateIds: (number | string)[],
): string | null {
  const norm = code.trim().toUpperCase()
  if (!norm) return null
  for (const id of candidateIds) {
    if (norm === personalCode(secret, id)) return String(id)
  }
  return null
}
