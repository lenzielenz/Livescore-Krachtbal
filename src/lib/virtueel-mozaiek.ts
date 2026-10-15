// De mozaïek van de photobooth in het virtuele stadion: alle selfies van je club samen vormen het
// clublogo. Elke tegel is een foto, licht gekleurd naar de kleur van het logo op die plek: van
// dichtbij zie je de mensen, en wie achteruit wandelt ziet het logo verschijnen.
//
// Puur: welke foto op welke tegel komt, en welke kleur elke tegel krijgt. Getest.

export const MOZAIEK = {
  /** Tegels in de breedte en de hoogte. */
  kol: 36,
  rij: 18,
  /** Vanaf zoveel foto's verschijnt de mozaïek (daarvoor hangen ze enkel als polaroid). */
  min: 12,
  /** Hoeveel foto's we hoogstens laden (de recentste). */
  max: 240,
  /** Grootte van een mozaïektegel (px, staand zoals de foto). */
  tegelB: 64,
  tegelH: 80,
} as const

/** Voorspelbaar toeval (zodat iedereen dezelfde mozaïek ziet). */
function rnd(zaad: number): () => number {
  let a = zaad >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Welke foto (index) op elke tegel komt. Elke foto komt ongeveer even vaak voor, en buren (links
 * en boven) zijn zo veel mogelijk verschillend. Zonder foto's: allemaal -1.
 */
export function tegelVolgorde(fotos: number, kol: number, rij: number, zaad = 7): number[] {
  const n = kol * rij
  if (fotos <= 0) return Array(n).fill(-1)
  const r = rnd(zaad)
  // Een zak met elke foto even vaak, geschud.
  const zak: number[] = []
  for (let i = 0; i < n; i++) zak.push(i % fotos)
  for (let i = zak.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[zak[i], zak[j]] = [zak[j], zak[i]]
  }
  // Dezelfde foto naast of boven zichzelf? Wissel met een verderop gelegen tegel.
  const uit = zak.slice()
  for (let i = 0; i < n; i++) {
    const botst = (k: number, v: number) => (k % kol > 0 && uit[k - 1] === v) || (k >= kol && uit[k - kol] === v)
    if (fotos < 3 || !botst(i, uit[i])) continue
    for (let j = i + 1; j < n; j++) {
      if (!botst(i, uit[j]) && !botst(j, uit[i])) {
        ;[uit[i], uit[j]] = [uit[j], uit[i]]
        break
      }
    }
  }
  return uit
}

/**
 * De kleur per tegel uit een afbeelding van het logo op het rooster (kol × rij pixels, RGBA).
 * Doorzichtige stukken krijgen de achtergrondkleur.
 */
export function tegelKleuren(data: ArrayLike<number>, kol: number, rij: number, achtergrond: [number, number, number]): [number, number, number][] {
  const uit: [number, number, number][] = []
  for (let i = 0; i < kol * rij; i++) {
    const a = data[i * 4 + 3] / 255
    uit.push([0, 1, 2].map((c) => Math.round(data[i * 4 + c] * a + achtergrond[c] * (1 - a))) as [number, number, number])
  }
  return uit
}
