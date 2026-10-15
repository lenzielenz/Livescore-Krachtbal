// Foto's van spelers die een referendumprijs wonnen, voor hun portretbord in de hall of fame van
// het virtuele stadion (erezaal.ts). De foto's staan in public/virtueel/spelers/ (600 × 800,
// zonder metadata). Zonder foto krijgt het bord een silhouet.
//
// De naam in het archief kan "Voornaam Achternaam" of "Achternaam Voornaam" zijn, met of zonder
// accenten: we vergelijken op de woorden, los van volgorde en hoofdletters.

const FOTOS: { naam: string; bestand: string }[] = [
  { naam: 'Hannes Timmerman', bestand: 'hannes-timmerman.jpg' },
  { naam: 'Natalie Lievens', bestand: 'natalie-lievens.jpg' },
  { naam: 'Jason Devooght', bestand: 'jason-devooght.jpg' },
]

/** Een naam als sleutel: kleine letters, zonder accenten of leestekens, woorden alfabetisch. */
export function naamSleutel(naam: string): string {
  return naam
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')
}

const PER_SLEUTEL = new Map(FOTOS.map((f) => [naamSleutel(f.naam), `/virtueel/spelers/${f.bestand}`]))

/** De foto van deze speler (een pad onder /virtueel/spelers/), of null. */
export function spelersfoto(naam: string): string | null {
  return PER_SLEUTEL.get(naamSleutel(naam)) ?? null
}
