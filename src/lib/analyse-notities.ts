// Regels voor notities bij een analyse (collections/AnalyseNotities.ts). Puur, zonder database,
// zodat ze los te testen zijn; de routes onder /api/analyse/... passen ze toe.

export type Zichtbaarheid = 'prive' | 'gedeeld'

export type Tekening = {
  pijlen: { van: { x: number; y: number }; naar: { x: number; y: number }; kleur: string }[]
  [k: string]: unknown
}

export interface NotitieInvoer {
  tekst: string
  tijdS: number | null
  zichtbaarheid: Zichtbaarheid
  tekening: Tekening | null
}

export interface NotitieDoc {
  id: number | string
  auteur?: unknown
  auteurNaam?: string | null
  tekst: string
  tijdS?: number | null
  zichtbaarheid: Zichtbaarheid
  tekening?: Tekening | null
  createdAt?: string
  updatedAt?: string
}

export const MAX_TEKST = 2000
export const MAX_PIJLEN = 40
const KLEUR_RE = /^#[0-9a-f]{6}$/i

/** Een tekening nakijken: hoogstens MAX_PIJLEN pijlen, punten in (de buurt van) het veld, een kleurcode. */
export function valideerTekening(t: unknown): { ok: true; waarde: Tekening | null } | { ok: false; fout: string } {
  if (t == null) return { ok: true, waarde: null }
  const pijlen = (t as { pijlen?: unknown }).pijlen
  if (!Array.isArray(pijlen)) return { ok: false, fout: 'Ongeldige tekening.' }
  if (pijlen.length > MAX_PIJLEN) return { ok: false, fout: `Hoogstens ${MAX_PIJLEN} pijlen per notitie.` }
  const punt = (p: unknown) => {
    const x = Number((p as { x?: unknown })?.x)
    const y = Number((p as { y?: unknown })?.y)
    return Number.isFinite(x) && Number.isFinite(y) && x >= -10 && x <= 80 && y >= -10 && y <= 40
      ? { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
      : null
  }
  const uit: Tekening['pijlen'] = []
  for (const p of pijlen) {
    const van = punt((p as { van?: unknown })?.van)
    const naar = punt((p as { naar?: unknown })?.naar)
    const kleur = String((p as { kleur?: unknown })?.kleur ?? '')
    if (!van || !naar || !KLEUR_RE.test(kleur)) return { ok: false, fout: 'Ongeldige pijl in de tekening.' }
    uit.push({ van, naar, kleur })
  }
  return { ok: true, waarde: uit.length ? { pijlen: uit } : null }
}

const relId = (rel: unknown): string | null => {
  if (rel == null) return null
  if (typeof rel === 'object') {
    const id = (rel as { id?: unknown }).id
    return id == null ? null : String(id)
  }
  return String(rel)
}

/** Invoer van de client nakijken. Bij een wijziging (deels=true) mogen velden ontbreken. */
export function valideerNotitie(
  body: unknown,
  deels = false,
): { ok: true; waarde: Partial<NotitieInvoer> } | { ok: false; fout: string } {
  if (!body || typeof body !== 'object') return { ok: false, fout: 'Ongeldige notitie.' }
  const b = body as Record<string, unknown>
  const waarde: Partial<NotitieInvoer> = {}
  if (b.tekst !== undefined || !deels) {
    const tekst = typeof b.tekst === 'string' ? b.tekst.trim() : ''
    if (!tekst) return { ok: false, fout: 'Een notitie mag niet leeg zijn.' }
    if (tekst.length > MAX_TEKST) return { ok: false, fout: `Hoogstens ${MAX_TEKST} tekens.` }
    waarde.tekst = tekst
  }
  if (b.tijdS !== undefined || !deels) {
    if (b.tijdS == null || b.tijdS === '') waarde.tijdS = null
    else {
      const t = Number(b.tijdS)
      if (!Number.isFinite(t) || t < 0 || t > 6 * 3600) return { ok: false, fout: 'Ongeldig moment in de video.' }
      waarde.tijdS = Math.round(t * 10) / 10
    }
  }
  if (b.tekening !== undefined || !deels) {
    const t = valideerTekening(b.tekening ?? null)
    if (!t.ok) return t
    waarde.tekening = t.waarde
  }
  if (b.zichtbaarheid !== undefined || !deels) {
    const z = b.zichtbaarheid ?? 'prive'
    if (z !== 'prive' && z !== 'gedeeld') return { ok: false, fout: "Zichtbaarheid is 'prive' of 'gedeeld'." }
    waarde.zichtbaarheid = z
  }
  return { ok: true, waarde }
}

/** Ziet deze lezer deze notitie? Privé: enkel de schrijver. Gedeeld: iedereen die de analyse ziet. */
export function zichtbaarVoor(n: NotitieDoc, lezerId: string | number | null): boolean {
  if (n.zichtbaarheid === 'gedeeld') return true
  return lezerId != null && relId(n.auteur) === String(lezerId)
}

/** Mag deze gebruiker de notitie aanpassen? Enkel de schrijver. */
export function magAanpassen(n: NotitieDoc, userId: string | number | null): boolean {
  return userId != null && relId(n.auteur) === String(userId)
}

/** Mag deze gebruiker de notitie verwijderen? De schrijver, of de beheerder van de analyse
 *  (zijn opname, zijn notities — ook een ongepaste gedeelde notitie van iemand anders). */
export function magVerwijderen(n: NotitieDoc, userId: string | number | null, beheertAnalyse: boolean): boolean {
  return magAanpassen(n, userId) || (beheertAnalyse && n.zichtbaarheid === 'gedeeld')
}

/** Wat de client van een notitie te zien krijgt. */
export function voorClient(n: NotitieDoc, userId: string | number | null, beheertAnalyse: boolean) {
  return {
    id: n.id,
    tekst: n.tekst,
    tijdS: n.tijdS ?? null,
    zichtbaarheid: n.zichtbaarheid,
    tekening: n.tekening ?? null,
    auteurNaam: n.auteurNaam || 'Onbekend',
    gemaakt: n.createdAt ?? null,
    eigen: magAanpassen(n, userId),
    magVerwijderen: magVerwijderen(n, userId, beheertAnalyse),
  }
}

export type ClientNotitie = ReturnType<typeof voorClient>

/** Op volgorde: eerst de notities met een moment (chronologisch in de video), dan de rest (nieuwste eerst). */
export function sorteer<T extends { tijdS: number | null; gemaakt: string | null }>(lijst: T[]): T[] {
  return [...lijst].sort((a, b) => {
    if (a.tijdS != null && b.tijdS != null) return a.tijdS - b.tijdS
    if (a.tijdS != null) return -1
    if (b.tijdS != null) return 1
    return String(b.gemaakt ?? '').localeCompare(String(a.gemaakt ?? ''))
  })
}
