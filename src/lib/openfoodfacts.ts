// ── Open Food Facts ─────────────────────────────────────────────────────────────────────────────
// Voedingsmiddelen opzoeken (op naam of via streepjescode) bij de gratis, open databank Open Food
// Facts — geen API-key nodig. De fetch gebeurt client-side (vanaf het toestel van de gebruiker), dus
// onafhankelijk van het server-netwerkbeleid. De pure mapping/schaling is los testbaar.

export interface FoodMacros { kcal: number; p: number; c: number; f: number }
export interface OffFood {
  id: string
  name: string
  brand: string | null
  /** Voedingswaarde per 100 g. */
  per100: FoodMacros
  /** Gewicht van één portie in gram (indien bekend). */
  servingGrams: number | null
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const r0 = (n: number) => Math.round(n)

/** Schaal voedingswaarde per 100 g naar een aantal gram. */
export function scalePer100(per100: FoodMacros, grams: number): FoodMacros {
  const k = Math.max(0, grams) / 100
  return { kcal: r0(per100.kcal * k), p: r0(per100.p * k), c: r0(per100.c * k), f: r0(per100.f * k) }
}

/** Zet een ruw Open Food Facts-product om naar een bruikbaar item, of null als er te weinig data is. */
export function mapProduct(raw: unknown): OffFood | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const n = (p.nutriments ?? {}) as Record<string, unknown>
  // kcal per 100 g — rechtstreeks of omgerekend uit kJ.
  let kcal = num(n['energy-kcal_100g'])
  if (kcal == null) {
    const kj = num(n['energy_100g'])
    if (kj != null) kcal = kj / 4.184
  }
  if (kcal == null) return null
  const name = String((p.product_name_nl as string) || (p.product_name as string) || '').trim()
  if (!name) return null
  const brandRaw = String((p.brands as string) || '').split(',')[0]?.trim()
  return {
    id: String((p.code as string) || (p._id as string) || name),
    name,
    brand: brandRaw || null,
    per100: {
      kcal: r0(kcal),
      p: r0(num(n['proteins_100g']) ?? 0),
      c: r0(num(n['carbohydrates_100g']) ?? 0),
      f: r0(num(n['fat_100g']) ?? 0),
    },
    servingGrams: num(p.serving_quantity),
  }
}

const FIELDS = 'code,product_name,product_name_nl,brands,nutriments,serving_quantity'

/** Zoek voedingsmiddelen op naam (max ~16 resultaten met genoeg data). */
export async function searchFoods(term: string, signal?: AbortSignal): Promise<OffFood[]> {
  const q = term.trim()
  if (q.length < 2) return []
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Zoeken mislukt')
  const data = (await res.json()) as { products?: unknown[] }
  const out: OffFood[] = []
  for (const raw of data.products ?? []) {
    const f = mapProduct(raw)
    if (f && f.per100.kcal > 0) out.push(f)
    if (out.length >= 16) break
  }
  return out
}

/** Haal één product op via de streepjescode. */
export async function productByBarcode(code: string, signal?: AbortSignal): Promise<OffFood | null> {
  const c = code.replace(/\D/g, '')
  if (c.length < 6) return null
  const url = `https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${FIELDS}`
  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const data = (await res.json()) as { status?: number; product?: unknown }
  if (data.status !== 1 || !data.product) return null
  return mapProduct(data.product)
}
