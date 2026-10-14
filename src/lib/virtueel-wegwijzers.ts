// Bewegwijzering in de gangen van het virtuele stadion. De gangen vormen een ring rond de
// tribunes; een bestemming ligt dus "langs de ring", links- of rechtsom. Per bord rekenen we uit
// welke kant de kortste weg is, welke pijl dat is voor wie naar het bord kijkt, en hoe ver het is.
// Puur: de 3D-kant geeft de positie op de ring (s, in meter), de kijkrichting en de raaklijn mee.

export type Doel = { naam: string; icoon: string; s: number }
/** '↓' = je bent er (onder dit bord); 'terug' = achter je (staat op de andere kant van het bord). */
export type Pijl = '↑' | '←' | '→' | '↓' | 'terug'
export type Wijzer = { naam: string; icoon: string; pijl: Pijl; meter: number }

type Vec = { x: number; z: number }

/** Kortste afstand langs de ring van s naar doel, met teken (+ = in de richting van stijgende s). */
export function ringAfstand(s: number, doel: number, omtrek: number): number {
  return ((((doel - s + omtrek / 2) % omtrek) + omtrek) % omtrek) - omtrek / 2
}

/**
 * De pijlen voor één kant van een bord.
 * @param plek s = positie op de ring, kijk = de richting waarin de lezer kijkt (naar het bord),
 *   raak = de richting van stijgende s op die plek. Beide genormaliseerd, in het xz-vlak.
 */
export function wegwijzer(plek: { s: number; omtrek: number; kijk: Vec; raak: Vec }, doelen: Doel[], hier = 8): Wijzer[] {
  // Rechts van wie in richting `kijk` kijkt (y omhoog): (-kijk.z, kijk.x).
  const rechts = { x: -plek.kijk.z, z: plek.kijk.x }
  return doelen
    .map((d): Wijzer => {
      const delta = ringAfstand(plek.s, d.s, plek.omtrek)
      const meter = Math.round(Math.abs(delta) / 5) * 5
      if (Math.abs(delta) < hier) return { naam: d.naam, icoon: d.icoon, pijl: '↓', meter: 0 }
      const t = { x: plek.raak.x * Math.sign(delta), z: plek.raak.z * Math.sign(delta) }
      const vooruit = t.x * plek.kijk.x + t.z * plek.kijk.z
      const opzij = t.x * rechts.x + t.z * rechts.z
      const pijl: Pijl = Math.abs(vooruit) >= Math.abs(opzij) ? (vooruit > 0 ? '↑' : 'terug') : opzij > 0 ? '→' : '←'
      return { naam: d.naam, icoon: d.icoon, pijl, meter }
    })
    .sort((a, b) => Number(b.pijl === '↓') - Number(a.pijl === '↓') || a.meter - b.meter)
    // Een bestemming op twee plaatsen (bv. de fotogalerij oost én west): enkel de dichtste.
    .filter((w, i, alle) => alle.findIndex((x) => x.naam === w.naam) === i)
}
