// De fanshop in het virtuele stadion: de gouden krachtballen die je vindt, worden muntjes, en
// daarmee koop je kledij om je figuur (zie avatar.ts) anders aan te kleden. Wat je kocht en wat je
// draagt is afgeleid uit je sporen (lib/virtueel-sporen.ts): elke aankoop en elke outfitkeuze is
// één record; je saldo wordt nooit apart bijgehouden.

/** Hoeveel muntjes één gevonden gouden bal waard is. */
export const MUNTEN_PER_BAL = 50

/** Een prijs die je nooit bij elkaar spaart (alle gouden ballen samen = 1250 muntjes): enkel om te passen. */
export const ONBETAALBAAR = 1_000_000

export const KLEDIJ_SOORTEN = ['shirt', 'broek', 'pet', 'sjaal', 'schoenen', 'extra'] as const
export type KledijSoort = (typeof KLEDIJ_SOORTEN)[number]

export type Artikel = {
  id: string
  soort: KledijSoort
  naam: string
  icoon: string
  prijs: number
  /** Hoe het eruitziet (avatar.ts leest dit): kleuren, of 'club'/'club2' voor de clubkleuren. */
  stijl: {
    kleur?: string
    kleur2?: string
    patroon?: 'effen' | 'strepen' | 'banen' | 'ster' | 'retro' | 'hoops' | 'bloemen' | 'kerst' | 'rits' | 'ruit' | 'camo' | 'blokken' | 'regenboog'
    vorm?: string
  }
}

export const ARTIKELEN: Artikel[] = [
  // Shirts
  { id: 'shirt-thuis', soort: 'shirt', naam: 'Thuisshirt', icoon: '👕', prijs: 0, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'effen' } },
  { id: 'shirt-uit', soort: 'shirt', naam: 'Uitshirt', icoon: '👕', prijs: 60, stijl: { kleur: 'club2', kleur2: 'club', patroon: 'effen' } },
  { id: 'shirt-strepen', soort: 'shirt', naam: 'Gestreept supportersshirt', icoon: '👕', prijs: 90, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'strepen' } },
  { id: 'shirt-retro', soort: 'shirt', naam: 'Retro shirt (jaren 80)', icoon: '🧥', prijs: 140, stijl: { kleur: '#f5f5dc', kleur2: 'club', patroon: 'retro' } },
  { id: 'shirt-goud', soort: 'shirt', naam: 'Gouden kampioenenshirt', icoon: '🏆', prijs: 250, stijl: { kleur: '#d4a63a', kleur2: '#fff3c4', patroon: 'ster' } },
  { id: 'shirt-derde', soort: 'shirt', naam: 'Derde shirt (zwart)', icoon: '👕', prijs: 70, stijl: { kleur: '#111827', kleur2: 'club', patroon: 'effen' } },
  { id: 'shirt-hoops', soort: 'shirt', naam: 'Shirt met dwarse banden', icoon: '👕', prijs: 90, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'hoops' } },
  { id: 'shirt-hawaii', soort: 'shirt', naam: 'Hawaïhemd', icoon: '🌺', prijs: 80, stijl: { kleur: '#0ea5e9', kleur2: '#fde047', patroon: 'bloemen' } },
  { id: 'shirt-keeper', soort: 'shirt', naam: 'Fluo keepersshirt', icoon: '🧤', prijs: 75, stijl: { kleur: '#a3e635', kleur2: '#111827', patroon: 'banen' } },
  { id: 'shirt-hoodie', soort: 'shirt', naam: 'Hoodie met kap', icoon: '🧥', prijs: 110, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'effen', vorm: 'hoodie' } },
  { id: 'shirt-kerst', soort: 'shirt', naam: 'Foute kersttrui', icoon: '🎄', prijs: 95, stijl: { kleur: '#b91c1c', kleur2: '#f8fafc', patroon: 'kerst' } },
  { id: 'shirt-vest', soort: 'shirt', naam: 'Trainingsvest met rits', icoon: '🧥', prijs: 85, stijl: { kleur: '#1f2937', kleur2: 'club', patroon: 'rits' } },
  { id: 'shirt-regenjas', soort: 'shirt', naam: 'Gele regenjas', icoon: '🌧️', prijs: 120, stijl: { kleur: '#facc15', kleur2: '#ca8a04', patroon: 'effen', vorm: 'jas' } },
  { id: 'shirt-wit', soort: 'shirt', naam: 'Wit poloshirt', icoon: '👔', prijs: 45, stijl: { kleur: '#f8fafc', kleur2: 'club', patroon: 'effen' } },
  // Broeken
  { id: 'broek-jeans', soort: 'broek', naam: 'Jeans', icoon: '👖', prijs: 0, stijl: { kleur: '#2c3e63' } },
  { id: 'broek-short', soort: 'broek', naam: 'Sportshort in clubkleur', icoon: '🩳', prijs: 40, stijl: { kleur: 'club', vorm: 'kort' } },
  { id: 'broek-jogging', soort: 'broek', naam: 'Jogging met banen', icoon: '👖', prijs: 70, stijl: { kleur: '#111827', kleur2: 'club', patroon: 'banen' } },
  { id: 'broek-wit', soort: 'broek', naam: 'Witte broek', icoon: '👖', prijs: 45, stijl: { kleur: '#f1f5f9' } },
  { id: 'broek-ruit', soort: 'broek', naam: 'Geruite broek', icoon: '🏴', prijs: 85, stijl: { kleur: '#7f1d1d', kleur2: '#facc15', patroon: 'ruit' } },
  { id: 'broek-camo', soort: 'broek', naam: 'Camouflagebroek', icoon: '🪖', prijs: 70, stijl: { kleur: '#4d5b3a', kleur2: '#2f3a24', patroon: 'camo' } },
  { id: 'broek-goud', soort: 'broek', naam: 'Gouden glitterbroek', icoon: '✨', prijs: 160, stijl: { kleur: '#d4a63a' } },
  { id: 'broek-bermuda', soort: 'broek', naam: 'Bermuda in tweede kleur', icoon: '🩳', prijs: 40, stijl: { kleur: 'club2', vorm: 'kort' } },
  // Petten en hoeden
  { id: 'pet-club', soort: 'pet', naam: 'Pet in clubkleur', icoon: '🧢', prijs: 0, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'pet' } },
  { id: 'pet-muts', soort: 'pet', naam: 'Muts met pompon', icoon: '🧶', prijs: 50, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'muts' } },
  { id: 'pet-hoed', soort: 'pet', naam: 'Supportershoed', icoon: '🎩', prijs: 110, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'hoed' } },
  { id: 'pet-kroon', soort: 'pet', naam: 'Gouden kroon', icoon: '👑', prijs: 220, stijl: { kleur: '#facc15', vorm: 'kroon' } },
  { id: 'pet-achter', soort: 'pet', naam: 'Pet achterstevoren', icoon: '🧢', prijs: 30, stijl: { kleur: 'club2', kleur2: 'club', vorm: 'petachter' } },
  { id: 'pet-bucket', soort: 'pet', naam: 'Vissershoedje', icoon: '👒', prijs: 55, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'bucket' } },
  { id: 'pet-viking', soort: 'pet', naam: 'Vikinghelm', icoon: '⚔️', prijs: 130, stijl: { kleur: '#9ca3af', kleur2: '#f5f5dc', vorm: 'viking' } },
  { id: 'pet-band', soort: 'pet', naam: 'Zweetband', icoon: '🎽', prijs: 25, stijl: { kleur: 'club', vorm: 'band' } },
  { id: 'pet-pruik', soort: 'pet', naam: 'Pruik in clubkleur', icoon: '🦁', prijs: 100, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'pruik' } },
  { id: 'pet-koptelefoon', soort: 'pet', naam: 'Koptelefoon', icoon: '🎧', prijs: 90, stijl: { kleur: '#111827', kleur2: 'club', vorm: 'koptelefoon' } },
  { id: 'pet-cowboy', soort: 'pet', naam: 'Cowboyhoed', icoon: '🤠', prijs: 120, stijl: { kleur: '#8b5a2b', kleur2: '#3f2a14', vorm: 'cowboy' } },
  { id: 'pet-feest', soort: 'pet', naam: 'Feesthoedje', icoon: '🥳', prijs: 35, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'feest' } },
  { id: 'pet-geen', soort: 'pet', naam: 'Niets op je hoofd', icoon: '🙅', prijs: 0, stijl: { vorm: 'geen' } },
  // Sjaals
  { id: 'sjaal-club', soort: 'sjaal', naam: 'Clubsjaal', icoon: '🧣', prijs: 0, stijl: { kleur: 'club', kleur2: 'club2', patroon: 'strepen' } },
  { id: 'sjaal-goud', soort: 'sjaal', naam: 'Gouden sjaal', icoon: '🧣', prijs: 80, stijl: { kleur: '#d4a63a', kleur2: '#1f2937', patroon: 'strepen' } },
  { id: 'sjaal-blokken', soort: 'sjaal', naam: 'Blokjessjaal', icoon: '🧣', prijs: 60, stijl: { kleur: 'club', kleur2: '#f8fafc', patroon: 'blokken' } },
  { id: 'sjaal-regenboog', soort: 'sjaal', naam: 'Regenboogsjaal', icoon: '🌈', prijs: 70, stijl: { patroon: 'regenboog' } },
  { id: 'sjaal-retro', soort: 'sjaal', naam: 'Retro sjaal', icoon: '🧣', prijs: 50, stijl: { kleur: '#f5f5dc', kleur2: '#7f1d1d', patroon: 'strepen' } },
  { id: 'sjaal-das', soort: 'sjaal', naam: 'Stropdas in clubkleur', icoon: '👔', prijs: 45, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'das' } },
  { id: 'sjaal-medaille', soort: 'sjaal', naam: 'Gouden medaille', icoon: '🥇', prijs: 150, stijl: { kleur: '#facc15', kleur2: 'club', vorm: 'medaille' } },
  { id: 'sjaal-ketting', soort: 'sjaal', naam: 'Gouden ketting', icoon: '📿', prijs: 120, stijl: { kleur: '#facc15', vorm: 'ketting' } },
  { id: 'sjaal-geen', soort: 'sjaal', naam: 'Geen sjaal', icoon: '🙅', prijs: 0, stijl: { vorm: 'geen' } },
  // Schoenen
  { id: 'schoenen-wit', soort: 'schoenen', naam: 'Witte sneakers', icoon: '👟', prijs: 0, stijl: { kleur: '#f8fafc' } },
  { id: 'schoenen-club', soort: 'schoenen', naam: 'Sneakers in clubkleur', icoon: '👟', prijs: 60, stijl: { kleur: 'club' } },
  { id: 'schoenen-goud', soort: 'schoenen', naam: 'Gouden schoenen', icoon: '✨', prijs: 160, stijl: { kleur: '#facc15' } },
  { id: 'schoenen-zwart', soort: 'schoenen', naam: 'Zwarte sneakers', icoon: '👟', prijs: 30, stijl: { kleur: '#111827' } },
  { id: 'schoenen-rood', soort: 'schoenen', naam: 'Rode sneakers', icoon: '👟', prijs: 45, stijl: { kleur: '#dc2626' } },
  { id: 'schoenen-neon', soort: 'schoenen', naam: 'Fluo sportschoenen', icoon: '⚡', prijs: 65, stijl: { kleur: '#a3e635' } },
  { id: 'schoenen-laarzen', soort: 'schoenen', naam: 'Leren laarzen', icoon: '🥾', prijs: 90, stijl: { kleur: '#6b4423', vorm: 'laars' } },
  { id: 'schoenen-regen', soort: 'schoenen', naam: 'Regenlaarzen in clubkleur', icoon: '🥾', prijs: 70, stijl: { kleur: 'club', vorm: 'laars' } },
  // Extra's
  { id: 'extra-geen', soort: 'extra', naam: 'Geen extra', icoon: '🙅', prijs: 0, stijl: { vorm: 'geen' } },
  { id: 'extra-vlag', soort: 'extra', naam: 'Clubvlag op je rug', icoon: '🚩', prijs: 90, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'vlag' } },
  { id: 'extra-toeter', soort: 'extra', naam: 'Supporterstoeter', icoon: '📯', prijs: 70, stijl: { kleur: 'club', vorm: 'toeter' } },
  { id: 'extra-zonnebril', soort: 'extra', naam: 'Zonnebril', icoon: '🕶️', prijs: 50, stijl: { kleur: '#111827', vorm: 'bril' } },
  { id: 'extra-trommel', soort: 'extra', naam: 'Supporterstrommel', icoon: '🥁', prijs: 120, stijl: { kleur: 'club', kleur2: '#f8fafc', vorm: 'trommel' } },
  { id: 'extra-schmink', soort: 'extra', naam: 'Schmink in clubkleuren', icoon: '🎨', prijs: 30, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'schmink' } },
  { id: 'extra-ballon', soort: 'extra', naam: 'Ballon', icoon: '🎈', prijs: 25, stijl: { kleur: 'club', vorm: 'ballon' } },
  { id: 'extra-vinger', soort: 'extra', naam: 'Schuimvinger "#1"', icoon: '☝️', prijs: 60, stijl: { kleur: 'club', kleur2: 'club2', vorm: 'vinger' } },
  { id: 'extra-rugzak', soort: 'extra', naam: 'Rugzak', icoon: '🎒', prijs: 55, stijl: { kleur: 'club2', kleur2: 'club', vorm: 'rugzak' } },
  { id: 'extra-cape', soort: 'extra', naam: 'Superheldencape', icoon: '🦸', prijs: 140, stijl: { kleur: 'club', kleur2: '#facc15', vorm: 'cape' } },
  { id: 'extra-krachtbal', soort: 'extra', naam: 'Krachtbal onder de arm', icoon: '🏐', prijs: 80, stijl: { kleur: '#f97316', vorm: 'krachtbal' } },
  // De volledige tenue van Bakman, de held van Sint-Michiels: passen mag, kopen kan niemand.
  { id: 'extra-bakman', soort: 'extra', naam: 'Volledige Bakman-tenue', icoon: '🦸', prijs: ONBETAALBAAR, stijl: { kleur: '#1f3fb4', kleur2: '#d4202a', vorm: 'bakman' } },
  { id: 'extra-megafoon', soort: 'extra', naam: 'Megafoon', icoon: '📣', prijs: 75, stijl: { kleur: '#f8fafc', kleur2: 'club', vorm: 'megafoon' } },
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
