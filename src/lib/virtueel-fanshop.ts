// De fanshop in het virtuele stadion: de gouden krachtballen die je vindt, worden muntjes, en
// daarmee koop je kledij om je figuur (zie avatar.ts) anders aan te kleden. Wat je kocht en wat je
// draagt is afgeleid uit je sporen (lib/virtueel-sporen.ts): elke aankoop en elke outfitkeuze is
// één record; je saldo wordt nooit apart bijgehouden.

/** Hoeveel muntjes één gevonden gouden bal waard is. */
export const MUNTEN_PER_BAL = 50

export const KLEDIJ_SOORTEN = ['shirt', 'broek', 'pet', 'sjaal', 'schoenen', 'extra'] as const
export type KledijSoort = (typeof KLEDIJ_SOORTEN)[number]

export type Artikel = {
  id: string
  soort: KledijSoort
  naam: string
  icoon: string
  prijs: number
  /** Hoe het eruitziet (avatar.ts leest dit): kleuren, of 'club'/'club2' voor de clubkleuren. */
  stijl: { kleur?: string; kleur2?: string; patroon?: 'effen' | 'strepen' | 'banen' | 'ster' | 'retro'; vorm?: string }
}

export const ARTIKELEN: Artikel[] = [
  // Shirts
  { id: 'shirt-thuis', soort: 'shirt', naam: 'Thuisshirt', icoon: '👕', prijs: 0, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'effen' } },
  { id: 'shirt-uit', soort: 'shirt', naam: 'Uitshirt', icoon: '👕', prijs: 60, stijl: { kleur: 'club2', kleur2: 'club', patroon: 'effen' } },
  { id: 'shirt-strepen', soort: 'shirt', naam: 'Gestreept supportersshirt', icoon: '👕', prijs: 90, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'strepen' } },
  { id: 'shirt-retro', soort: 'shirt', naam: 'Retro shirt (jaren 80)', icoon: '🧥', prijs: 140, stijl: { kleur: '#f5f5dc', kleur2: 'club', patroon: 'retro' } },
  { id: 'shirt-goud', soort: 'shirt', naam: 'Gouden kampioenenshirt', icoon: '🏆', prijs: 250, stijl: { kleur: '#d4a63a', kleur2: '#fff3c4', patroon: 'ster' } },
  // Broeken
  { id: 'broek-jeans', soort: 'broek', naam: 'Jeans', icoon: '👖', prijs: 0, stijl: { kleur: '#2c3e63' } },
  { id: 'broek-short', soort: 'broek', naam: 'Sportshort in clubkleur', icoon: '🩳', prijs: 40, stijl: { kleur: 'club', vorm: 'kort' } },
  { id: 'broek-jogging', soort: 'broek', naam: 'Jogging met banen', icoon: '👖', prijs: 70, stijl: { kleur: '#111827', kleur2: 'club', patroon: 'banen' } },
  // Petten en hoeden
  { id: 'pet-club', soort: 'pet', naam: 'Pet in clubkleur', icoon: '🧢', prijs: 0, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'pet' } },
  { id: 'pet-muts', soort: 'pet', naam: 'Muts met pompon', icoon: '🧶', prijs: 50, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'muts' } },
  { id: 'pet-hoed', soort: 'pet', naam: 'Supportershoed', icoon: '🎩', prijs: 110, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'hoed' } },
  { id: 'pet-kroon', soort: 'pet', naam: 'Gouden kroon', icoon: '👑', prijs: 220, stijl: { kleur: '#facc15', vorm: 'kroon' } },
  { id: 'pet-geen', soort: 'pet', naam: 'Niets op je hoofd', icoon: '🙅', prijs: 0, stijl: { vorm: 'geen' } },
  // Sjaals
  { id: 'sjaal-club', soort: 'sjaal', naam: 'Clubsjaal', icoon: '🧣', prijs: 0, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'strepen' } },
  { id: 'sjaal-goud', soort: 'sjaal', naam: 'Gouden sjaal', icoon: '🧣', prijs: 80, stijl: { kleur: '#d4a63a', kleur2: '#1f2937', patroon: 'strepen' } },
  { id: 'sjaal-geen', soort: 'sjaal', naam: 'Geen sjaal', icoon: '🙅', prijs: 0, stijl: { vorm: 'geen' } },
  // Schoenen
  { id: 'schoenen-wit', soort: 'schoenen', naam: 'Witte sneakers', icoon: '👟', prijs: 0, stijl: { kleur: '#f8fafc' } },
  { id: 'schoenen-club', soort: 'schoenen', naam: 'Sneakers in clubkleur', icoon: '👟', prijs: 60, stijl: { kleur: 'club' } },
  { id: 'schoenen-goud', soort: 'schoenen', naam: 'Gouden schoenen', icoon: '✨', prijs: 160, stijl: { kleur: '#facc15' } },
  // Extra's
  { id: 'extra-geen', soort: 'extra', naam: 'Geen extra', icoon: '🙅', prijs: 0, stijl: { vorm: 'geen' } },
  { id: 'extra-vlag', soort: 'extra', naam: 'Clubvlag op je rug', icoon: '🚩', prijs: 90, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'vlag' } },
  { id: 'extra-toeter', soort: 'extra', naam: 'Supporterstoeter', icoon: '📯', prijs: 70, stijl: { kleur: 'club', vorm: 'toeter' } },
  { id: 'extra-zonnebril', soort: 'extra', naam: 'Zonnebril', icoon: '🕶️', prijs: 50, stijl: { kleur: '#111827', vorm: 'bril' } },
]

export const artikelVan = (id: string) => ARTIKELEN.find((a) => a.id === id) ?? null

export type Outfit = Record<KledijSoort, string>
export const STANDAARD_OUTFIT: Outfit = { shirt: 'shirt-thuis', broek: 'broek-jeans', pet: 'pet-club', sjaal: 'sjaal-club', schoenen: 'schoenen-wit', extra: 'extra-geen' }
/** Gratis artikelen heb je altijd. */
export const GRATIS = ARTIKELEN.filter((a) => a.prijs === 0).map((a) => a.id)

export type Kast = { munten: number; verdiend: number; gekocht: string[]; outfit: Outfit }

/**
 * Je kast: je saldo (muntjes van je gevonden ballen min wat je uitgaf), wat je bezit en wat je
 * draagt. `ballen` = hoeveel verschillende gouden ballen je vond; `aankopen` en `outfits` in
 * volgorde (oudste eerst).
 */
export function maakKast(ballen: number, aankopen: string[], outfits: Partial<Outfit>[]): Kast {
  const verdiend = ballen * MUNTEN_PER_BAL
  const gekocht = new Set(GRATIS)
  let uitgegeven = 0
  for (const id of aankopen) {
    const a = artikelVan(id)
    if (!a || gekocht.has(id) || uitgegeven + a.prijs > verdiend) continue
    gekocht.add(id)
    uitgegeven += a.prijs
  }
  const outfit: Outfit = { ...STANDAARD_OUTFIT }
  for (const o of outfits)
    for (const s of KLEDIJ_SOORTEN) {
      const id = o[s]
      const a = id ? artikelVan(id) : null
      if (a && a.soort === s && gekocht.has(a.id)) outfit[s] = a.id
    }
  return { munten: verdiend - uitgegeven, verdiend, gekocht: [...gekocht], outfit }
}

/** Mag je dit kopen? Geeft een foutmelding, of null als het mag. */
export function magKopen(kast: Kast, id: string): string | null {
  const a = artikelVan(id)
  if (!a) return 'Dat verkopen we hier niet.'
  if (kast.gekocht.includes(id)) return 'Dat heb je al.'
  if (a.prijs > kast.munten) return `Daarvoor heb je ${a.prijs - kast.munten} muntjes te weinig. Zoek nog gouden ballen!`
  return null
}

/** Een outfit opschonen: enkel bestaande artikelen van de juiste soort die je bezit. */
export function leesOutfit(ruw: unknown, gekocht: string[]): Partial<Outfit> {
  const w = (ruw && typeof ruw === 'object' ? ruw : {}) as Record<string, unknown>
  const uit: Partial<Outfit> = {}
  for (const s of KLEDIJ_SOORTEN) {
    const id = w[s]
    if (typeof id !== 'string') continue
    const a = artikelVan(id)
    if (a && a.soort === s && gekocht.includes(id)) uit[s] = id
  }
  return uit
}
