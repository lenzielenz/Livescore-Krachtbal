// Pure logica voor veldschermen: één per fysiek veld bij een club, met een roterende 6-cijferige
// koppelcode waarmee een aantekenaar een gestarte wedstrijd aan dat scherm koppelt. Zolang niets
// gekoppeld is, toont het scherm de dagplanning van de club + de koppelcode (het "wachtscherm").
// Zie collections/FieldScreens.ts voor het datamodel en de motivatie; field-screens-data.ts voor
// het DB-werk. Puur en getest — geen DB hier.

export const MIN_VELDEN = 1
export const MAX_VELDEN = 8

const CODE_RE = /^\d{6}$/

/** Geldige koppelcode: exact 6 cijfers (spaties rondom worden genegeerd). */
export function isPairingCode(raw: string): boolean {
  return CODE_RE.test(raw.trim())
}

/** Nieuwe willekeurige 6-cijferige koppelcode, met voorloopnullen. */
export function randomPairingCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

/** Naam voor het n-de veld (1-gebaseerd): "Veld 1", "Veld 2", … */
export function veldNaam(volgnummer: number): string {
  return `Veld ${volgnummer}`
}

export type VeldRow = { id: number; naam: string; paired: boolean }

export type VeldenPlan = {
  /** Hoeveel nieuwe veldschermen aanmaken (genummerd vanaf het huidige aantal + 1). */
  toCreate: number
  /** Id's van bestaande veldschermen die mogen verdwijnen. */
  toRemove: number[]
  /** Kon niet tot het gevraagde aantal terug — deze velden zijn nog gekoppeld aan een lopende
   * wedstrijd en blijven daarom bestaan. */
  blockedByLive: string[]
}

/**
 * Bereken wat er moet gebeuren om van `existing` (oplopend volgnummer, dus in aanmaakvolgorde)
 * naar `target` velden te gaan. Verwijderen gebeurt van het hoogste volgnummer naar beneden, en
 * nooit een veld dat nu gekoppeld is — dat zou een tv midden in een wedstrijd laten dichtklappen.
 */
export function planVeldenSync(existing: VeldRow[], target: number): VeldenPlan {
  const t = Math.max(MIN_VELDEN, Math.min(MAX_VELDEN, Math.round(target)))
  if (existing.length <= t) {
    return { toCreate: t - existing.length, toRemove: [], blockedByLive: [] }
  }
  const excess = existing.length - t
  const toRemove: number[] = []
  const blockedByLive: string[] = []
  for (const v of [...existing].reverse()) {
    if (toRemove.length >= excess) break
    if (v.paired) {
      blockedByLive.push(v.naam)
      continue
    }
    toRemove.push(v.id)
  }
  return { toCreate: 0, toRemove, blockedByLive }
}
