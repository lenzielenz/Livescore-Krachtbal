// Het dagverloop op het kantinescherm: wat er schermvullend te zien is zodra ALLE wedstrijden van
// vandaag gespeeld zijn.
//
// Een scherm met enkel eindstanden is na vijf minuten uitgekeken. Daarom speelt het de dag
// opnieuw af, in de volgorde waarin hij gespeeld werd:
//
//   overzicht → wedstrijd 1 → foto's van wedstrijd 1 → wedstrijd 2 → … → overzicht → …
//
// Het overzicht (alle uitslagen van vandaag naast elkaar) komt telkens terug, zodat wie binnenkomt
// nooit lang moet wachten om te zien wie er won. Elke wedstrijd krijgt daarna even het hele scherm,
// gevolgd door een paar supportersfoto's van die wedstrijd. Per ronde schuiven de foto's door,
// zodat ze na een paar rondes allemaal aan bod kwamen in plaats van telkens dezelfde eerste twee.
//
// Puur: geen tijd, geen DOM, geen netwerk. Het scherm telt enkel op; wélk beeld daarbij hoort,
// wordt hier beslist en is dus te testen. Zelfde opzet als kantine-fotoshow.ts op het tornooischerm.

export type DagStap = { soort: 'overzicht' } | { soort: 'wedstrijd'; matchId: number } | { soort: 'foto'; fotoId: number; matchId: number }

export type DagFoto = { id: number; matchId: number }

/** Hoeveel foto's er na elke wedstrijd passeren (minder als er minder zijn). */
export const FOTOS_PER_WEDSTRIJD = 2

/** Lang genoeg om alle uitslagen te lezen van achter in de kantine. */
export const OVERZICHT_MS = 16_000
/** Eén wedstrijd in de schijnwerpers. */
export const WEDSTRIJD_MS = 9_000
/** Eén foto. */
export const FOTO_MS = 7_000

/**
 * De volledige beurtrol voor één ronde. `matchIds` staan in de volgorde waarin ze gespeeld werden;
 * `ronde` (0, 1, 2, …) bepaalt welke foto's van elke wedstrijd deze keer aan de beurt zijn.
 */
export function dagRol(matchIds: number[], fotos: DagFoto[], ronde = 0, perWedstrijd: number = FOTOS_PER_WEDSTRIJD): DagStap[] {
  const stappen: DagStap[] = [{ soort: 'overzicht' }]
  const per = Math.max(0, Math.floor(perWedstrijd))
  const r = Math.max(0, Math.floor(ronde))
  for (const matchId of matchIds) {
    stappen.push({ soort: 'wedstrijd', matchId })
    const eigen = fotos.filter((f) => f.matchId === matchId)
    if (eigen.length === 0 || per === 0) continue
    // Nooit meer foto's per beurt dan er zijn: met één foto zag je die anders twee keer na elkaar.
    const aantal = Math.min(per, eigen.length)
    const start = (r * aantal) % eigen.length
    for (let k = 0; k < aantal; k++) {
      const f = eigen[(start + k) % eigen.length]
      stappen.push({ soort: 'foto', fotoId: f.id, matchId })
    }
  }
  return stappen
}

/** Hoelang een stap in beeld blijft. */
export function duurVan(stap: DagStap): number {
  if (stap.soort === 'overzicht') return OVERZICHT_MS
  return stap.soort === 'wedstrijd' ? WEDSTRIJD_MS : FOTO_MS
}

/** Uitslag vanuit de thuisploeg: wie won er, of was het gelijk? */
export function winnaar(score: { home: number; away: number }): 'home' | 'away' | null {
  if (score.home > score.away) return 'home'
  if (score.away > score.home) return 'away'
  return null
}
