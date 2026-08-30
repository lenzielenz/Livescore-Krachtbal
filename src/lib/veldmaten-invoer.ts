import { FIELD } from './field'

// Invoer van de échte terreinmaten (breedte, speelveld tussen de doellijnen, diepte van het
// doelgebied) — pure lezing en validatie, los van de route zodat ze apart getest kan worden.
// Grenzen identiek aan de Matches-collectie: een waarde die de admin weigert, mag de app niet
// aannemen. Leeg (null of '') = terug naar reglementair.

export const MATEN_GRENZEN = {
  veldBreedte: { min: 6, max: 20, label: 'De veldbreedte' },
  veldSpeelveld: { min: 10, max: 30, label: 'Het speelveld tussen de doellijnen' },
  goalAreaDepth: { min: 5, max: 25, label: 'De diepte van het doelgebied' },
} as const

export type MaatVeld = keyof typeof MATEN_GRENZEN

/** Wat er op de wedstrijd bewaard wordt. Breedte en speelveld mogen leeg (= reglementair);
 *  de doelgebiedsdiepte is een verplicht veld, dus daar is "leeg" de reglementaire waarde. */
export type MatenData = {
  veldBreedte?: number | null
  veldSpeelveld?: number | null
  goalAreaDepth?: number
}

export type MatenResultaat = { ok: true; data: MatenData } | { ok: false; error: string }

/** Eén maat: getal binnen de grenzen, of null om leeg te maken. Komma mag als decimaalteken. */
export function leesMaat(waarde: unknown, veld: MaatVeld): { ok: true; value: number | null } | { ok: false; error: string } {
  if (waarde === null || waarde === '') return { ok: true, value: null }
  const n = typeof waarde === 'string' ? Number(waarde.replace(',', '.')) : Number(waarde)
  const { min, max, label } = MATEN_GRENZEN[veld]
  if (!Number.isFinite(n)) return { ok: false, error: `${label} moet een getal in meters zijn.` }
  if (n < min || n > max) return { ok: false, error: `${label} moet tussen ${min} en ${max} m liggen.` }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/**
 * De hele body → de velden die op de wedstrijd bewaard mogen worden.
 * Enkel meegestuurde velden worden aangeraakt; de doelgebiedsdiepte is verplicht op de
 * wedstrijd, dus leegmaken betekent daar: terug naar de reglementaire waarde.
 */
export function leesVeldmaten(body: Record<string, unknown>): MatenResultaat {
  const data: MatenData = {}
  for (const veld of Object.keys(MATEN_GRENZEN) as MaatVeld[]) {
    if (!(veld in body)) continue
    const gelezen = leesMaat(body[veld], veld)
    if (!gelezen.ok) return { ok: false, error: gelezen.error }
    if (veld === 'goalAreaDepth') data.goalAreaDepth = gelezen.value ?? FIELD.defaultGoalAreaDepthM
    else data[veld] = gelezen.value
  }
  if (Object.keys(data).length === 0) return { ok: false, error: 'Geef minstens één maat mee.' }
  return { ok: true, data }
}
