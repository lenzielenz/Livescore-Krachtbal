// Regels voor notities bij een analyse (collections/AnalyseNotities.ts). Puur, zonder database,
// zodat ze los te testen zijn; de routes onder /api/analyse/... passen ze toe.

export type Zichtbaarheid = 'prive' | 'gedeeld'

export interface NotitieInvoer {
  tekst: string
  tijdS: number | null
  zichtbaarheid: Zichtbaarheid
}

export interface NotitieDoc {
  id: number | string
  auteur?: unknown
  auteurNaam?: string | null
  tekst: string
  tijdS?: number | null
  zichtbaarheid: Zichtbaarheid
  createdAt?: string
  updatedAt?: string
}

export const MAX_TEKST = 2000

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
