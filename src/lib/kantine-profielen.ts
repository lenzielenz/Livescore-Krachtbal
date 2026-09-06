import { LEGE_SELECTIE, sanitizeKantineSelectie, selectieIsLeeg, type KantineSelectie } from './kantine-selectie'

// Meerdere kantineschermen per gebruiker.
//
// Eén keuze per account volstond niet: een club heeft vlot een tv in de kantine, één in de
// bestuurszaal en één bij de jeugdterreinen, en die willen elk iets anders zien. Daarom bewaart
// een gebruiker nu een lijstje PROFIELEN — elk met een eigen naam en een eigen vaste link, zodat
// je een scherm één keer instelt en er nooit meer naar omkijkt.
//
// Opslag: hetzelfde json-veld `users.kantineScherm`. Wat daar al stond (één kale selectie) blijft
// gewoon werken en wordt bij het lezen omgezet naar één profiel — geen migratie nodig, en een tv
// die al aan de muur hangt blijft ondertussen draaien.
//
// Puur en zonder database, zoals kantine-selectie.ts: de query's staan in de API-routes.

export interface KantineProfiel extends KantineSelectie {
  /** Stabiele sleutel in de link naar het scherm. Alleen letters, cijfers en koppeltekens. */
  id: string
  naam: string
}

/** Meer dan dit heeft niemand nodig, en het houdt het json-veld klein. */
export const MAX_PROFIELEN = 8

/** Langer dan dit past op geen enkel scherm netjes in de kop. */
export const MAX_PROFIELNAAM = 40

/** Naam van het profiel dat ontstaat uit een keuze van vóór de profielen bestonden. */
export const EERSTE_PROFIELNAAM = 'Kantinescherm'

/** Maak van vrije invoer een naam die op een tv past. */
export function veiligeProfielnaam(ruw: unknown, terugval = EERSTE_PROFIELNAAM): string {
  if (typeof ruw !== 'string') return terugval
  const naam = ruw.replace(/\s+/g, ' ').trim()
  if (!naam) return terugval
  // Per letterteken knippen, niet per UTF-16-eenheid: anders sneuvelt een emoji halverwege en
  // weigert Postgres de string in de jsonb-kolom.
  const letters = [...naam]
  if (letters.length <= MAX_PROFIELNAAM) return naam
  return `${letters.slice(0, MAX_PROFIELNAAM - 1).join('').trimEnd()}…`
}

/** Slug voor in de link: kleine letters, cijfers en koppeltekens. */
function slug(naam: string): string {
  const basis = naam
    .normalize('NFD')
    // Accenten wegnemen (é → e) zodat "Café" een leesbare slug geeft in plaats van een lege.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return basis || 'scherm'
}

/** Een id dat nog niet in gebruik is (de link mag nooit twee schermen aanwijzen). */
export function nieuwProfielId(bestaand: { id: string }[], naam: string): string {
  const basis = slug(naam)
  const gebruikt = new Set(bestaand.map((p) => p.id))
  if (!gebruikt.has(basis)) return basis
  for (let n = 2; n < 100; n += 1) {
    const kandidaat = `${basis}-${n}`
    if (!gebruikt.has(kandidaat)) return kandidaat
  }
  return `${basis}-${gebruikt.size + 1}`
}

/**
 * Lees het json-veld uit. Slikt drie vormen:
 *   • { profielen: [...] } — de huidige vorm
 *   • { clubIds, teamIds, matchIds } — de oude, enkelvoudige keuze → wordt één profiel
 *   • rommel/leeg → een lege lijst
 *
 * Nooit gooien: een tv die wit blijft omdat er iets raars in een profiel staat, is erger dan een
 * scherm dat één profiel mist.
 */
export function sanitizeProfielen(raw: unknown): KantineProfiel[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>

  const lijst = Array.isArray(o.profielen) ? o.profielen : null
  if (!lijst) {
    // Oude vorm: één keuze zonder naam. Ze mag niet verdwijnen — er hangt een tv aan.
    const keuze = sanitizeKantineSelectie(raw)
    if (selectieIsLeeg(keuze)) return []
    return [{ id: 'scherm', naam: EERSTE_PROFIELNAAM, ...keuze }]
  }

  const uit: KantineProfiel[] = []
  for (const rij of lijst) {
    if (!rij || typeof rij !== 'object') continue
    const naam = veiligeProfielnaam((rij as { naam?: unknown }).naam)
    const ruweId = (rij as { id?: unknown }).id
    const id = typeof ruweId === 'string' && /^[a-z0-9-]{1,32}$/.test(ruweId) ? ruweId : nieuwProfielId(uit, naam)
    if (uit.some((p) => p.id === id)) continue
    uit.push({ id, naam, ...sanitizeKantineSelectie(rij) })
    if (uit.length >= MAX_PROFIELEN) break
  }
  return uit
}

/** Vorm om weg te schrijven — altijd de nieuwe vorm, ook wanneer er één profiel is. */
export function bewaarVorm(profielen: KantineProfiel[]): { profielen: KantineProfiel[] } {
  return { profielen: profielen.slice(0, MAX_PROFIELEN) }
}

/**
 * Welk profiel hoort bij deze link? Zonder id (of bij een onbekend id) het eerste — een tv die op
 * een oude link staat mag niet plots leeg lopen omdat er hernoemd werd.
 */
export function kiesProfiel(profielen: KantineProfiel[], id?: string | null): KantineProfiel | null {
  if (profielen.length === 0) return null
  if (id) {
    const gevonden = profielen.find((p) => p.id === id)
    if (gevonden) return gevonden
  }
  return profielen[0]
}

/** Een vers, leeg profiel met een unieke naam ("Kantinescherm", "Kantinescherm 2", …). */
export function nieuwProfiel(bestaand: KantineProfiel[]): KantineProfiel {
  let naam = EERSTE_PROFIELNAAM
  for (let n = 2; bestaand.some((p) => p.naam === naam); n += 1) naam = `${EERSTE_PROFIELNAAM} ${n}`
  return { id: nieuwProfielId(bestaand, naam), naam, ...LEGE_SELECTIE }
}
