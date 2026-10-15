// Foto's van spelers die een referendumprijs wonnen, voor hun portretbord in de hall of fame van
// het virtuele stadion (erezaal.ts). De foto's staan in public/virtueel/spelers/ (600 × 800,
// zonder metadata). Zonder foto krijgt het bord een silhouet.
//
// De naam in het archief kan "Voornaam Achternaam" of "Achternaam Voornaam" zijn, met of zonder
// accenten, en een tussenvoegsel los of vast ("De Vooght" of "Devooght"): we vergelijken op de
// woorden, los van volgorde en hoofdletters, met het tussenvoegsel aan de achternaam geplakt.

const FOTOS: { naam: string; bestand: string }[] = [
  { naam: 'Hannes Timmerman', bestand: 'hannes-timmerman.jpg' },
  { naam: 'Natalie Lievens', bestand: 'natalie-lievens.jpg' },
  { naam: 'Jason Devooght', bestand: 'jason-devooght.jpg' },
  { naam: "Charlotte D'Hoore", bestand: 'charlotte-dhoore.jpg' },
]

/** Tussenvoegsels die bij de achternaam horen ("De Vooght" = "Devooght", "Van den Berghe"). */
const TUSSENVOEGSELS = new Set(['de', 'den', 'der', 'van', 'vande', 'vanden', 'vander', 'ver', 'le', 'la', 'du', 'des', 'd', 't', 'ten', 'ter', 'op', 'in'])

/** Een naam als sleutel: kleine letters, zonder accenten of leestekens, woorden alfabetisch. */
export function naamSleutel(naam: string): string {
  const woorden = naam
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  // Plak tussenvoegsels aan het woord erna: "de vooght" → "devooght".
  const samen: string[] = []
  let voor = ''
  for (const w of woorden) {
    if (TUSSENVOEGSELS.has(w)) voor += w
    else {
      samen.push(voor + w)
      voor = ''
    }
  }
  if (voor) samen.push(voor)
  return samen.sort().join(' ')
}

const PER_SLEUTEL = new Map(FOTOS.map((f) => [naamSleutel(f.naam), `/virtueel/spelers/${f.bestand}`]))

/** De foto van deze speler (een pad onder /virtueel/spelers/), of null. */
export function spelersfoto(naam: string): string | null {
  return PER_SLEUTEL.get(naamSleutel(naam)) ?? null
}
