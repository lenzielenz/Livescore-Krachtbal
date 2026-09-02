// De stand van het oefenscherm: wat staat er op het nagebouwde aantekenscherm, en wat doet een
// tik ermee.
//
// Waarom dit apart staat en niet in de component. Twee fouten die hier gevonden zijn, waren
// allebei van hetzelfde soort: een knop die niets deed (+2 voor de uitploeg had geen afhandeling)
// en een stap die niet te voltooien viel (bij "einde eerste helft" stond de wedstrijd al op de
// tweede helft, dus de gevraagde knop bestond niet meer — en dan loopt de oefening dood).
//
// Allebei zijn ze te vangen met een test, maar enkel als de logica los van de opmaak staat.
// Vandaar: een stand, een lijst knoppen die bij die stand hoort, en één functie die zegt wat een
// tik ermee doet. De test controleert dan voor élke stap dat de gevraagde knop er ook echt is.

export type Ploeg = 0 | 1

export type OefenStand = {
  gestart: boolean
  gedaan: boolean
  helft: 1 | 2
  klokLoopt: boolean
  /** Stand van de klok in seconden. Hoort erbij omdat de rust er juist aan te herkennen valt:
   *  helft 2, nul op de klok, klok stil. Stond die tijd hier niet, dan bleef het oefenscherm na
   *  "einde 1e helft" gewoon 03:12 tonen — en dan leert de oefening iets aan wat niet klopt. */
  klok: number
  score: [number, number]
  kruisjes: [number, number]
  minuten: [number, number]
  /** Wat "Ondoen" zou wegnemen; null = niets te ondoen. */
  laatste: { ploeg: Ploeg; punten: 1 | 2 } | null
}

const LEEG: OefenStand = {
  gestart: false,
  gedaan: false,
  helft: 1,
  klokLoopt: false,
  klok: 0,
  score: [0, 0],
  kruisjes: [0, 0],
  minuten: [0, 0],
  laatste: null,
}

/**
 * Waar het oefenscherm staat wanneer je aan een stap begint.
 *
 * Elke stap begint bij zijn eigen beginstand in plaats van verder te bouwen op wat je in de
 * vorige stap deed. Dat is niet om het simpel te houden: wie in stap 6 al naar de tweede helft
 * ging, vond in stap 7 de knop "2e helft" niet meer terug en kwam niet verder. Een oefening die
 * kan doodlopen, leert niemand iets.
 */
export function beginstandVoor(stapNr: number): OefenStand {
  if (stapNr <= 4) return { ...LEEG }
  if (stapNr === 5) return { ...LEEG, gestart: true, klokLoopt: true, klok: 192 }
  if (stapNr === 6) {
    return { ...LEEG, gestart: true, klokLoopt: true, klok: 296, score: [1, 0], laatste: { ploeg: 0, punten: 1 } }
  }
  if (stapNr === 7) {
    // De eerste helft, bijna om: precies de toestand waarin je haar afsluit.
    return {
      ...LEEG, gestart: true, klokLoopt: true, klok: 583, score: [3, 1], kruisjes: [1, 0],
      laatste: { ploeg: 0, punten: 2 },
    }
  }
  if (stapNr === 8) {
    // De rust: tweede helft aangebroken, klok op nul en stil.
    return { ...LEEG, gestart: true, helft: 2, klok: 0, score: [3, 1], kruisjes: [1, 0] }
  }
  if (stapNr === 9) {
    return {
      ...LEEG, gestart: true, klokLoopt: true, helft: 2, klok: 561, score: [5, 3], kruisjes: [1, 2],
      laatste: { ploeg: 1, punten: 1 },
    }
  }
  return { ...LEEG, gestart: true, gedaan: true, helft: 2, klok: 600, score: [5, 4], kruisjes: [1, 2] }
}

/**
 * Welke knoppen staan er bij deze stand op het scherm?
 *
 * Spiegelt de echte tornooitafel (`TournamentScoresheet`): vóór de aftrap enkel Start, tijdens
 * de wedstrijd de score- en tellerknoppen plus Pauze/Klok, "2e helft" enkel in de eerste helft,
 * en "Einde" enkel zolang de wedstrijd loopt. Na afloop blijft er niets meer te tikken.
 */
export function knoppenVoor(stand: OefenStand): string[] {
  if (stand.gedaan) return []
  if (!stand.gestart) return ['start']
  const knoppen = [
    'score-thuis-nek', 'score-thuis-rug', 'score-uit-nek', 'score-uit-rug',
    'kruisje-thuis-min', 'kruisje-thuis-plus', 'kruisje-uit-min', 'kruisje-uit-plus',
    'minuut-thuis-min', 'minuut-thuis-plus', 'minuut-uit-min', 'minuut-uit-plus',
    stand.klokLoopt ? 'pauze' : inRust(stand) ? 'start-helft' : 'klok',
    'ondoen',
    'einde-wedstrijd',
    'terugzetten',
  ]
  if (stand.helft === 1) knoppen.push('einde-helft')
  return knoppen
}

/**
 * Staat het oefenscherm in de rust?
 *
 * Dezelfde regel als de echte tafels (`lib/helft-overgang.ts`): tweede helft, klok op nul, klok
 * stil. Dan heet de klokknop "Start 2e helft" in plaats van een kale "Klok".
 */
export function inRust(stand: OefenStand): boolean {
  return stand.gestart && !stand.gedaan && stand.helft === 2 && !stand.klokLoopt && stand.klok === 0
}

/** Staat deze knop nu op het scherm? */
export function knopBeschikbaar(stand: OefenStand, doel: string): boolean {
  return knoppenVoor(stand).includes(doel)
}

const bij = (paar: [number, number], ploeg: Ploeg, delta: number): [number, number] => {
  const uit: [number, number] = [...paar]
  uit[ploeg] = Math.max(0, uit[ploeg] + delta)
  return uit
}

/**
 * Wat een tik met de stand doet.
 *
 * Élke knop uit `knoppenVoor` hoort hier een gevolg te hebben. Een knop die niets doet, voelt op
 * een oefenscherm als een kapotte app — en dat is precies het tegenovergestelde van wat deze
 * uitleg moet bereiken.
 */
export function naTik(stand: OefenStand, doel: string): OefenStand {
  if (!knopBeschikbaar(stand, doel)) return stand
  switch (doel) {
    case 'start':
      return { ...stand, gestart: true, klokLoopt: true }
    case 'score-thuis-nek':
      return { ...stand, score: bij(stand.score, 0, 1), laatste: { ploeg: 0, punten: 1 } }
    case 'score-thuis-rug':
      return { ...stand, score: bij(stand.score, 0, 2), laatste: { ploeg: 0, punten: 2 } }
    case 'score-uit-nek':
      return { ...stand, score: bij(stand.score, 1, 1), laatste: { ploeg: 1, punten: 1 } }
    case 'score-uit-rug':
      return { ...stand, score: bij(stand.score, 1, 2), laatste: { ploeg: 1, punten: 2 } }
    case 'kruisje-thuis-min':
      return { ...stand, kruisjes: bij(stand.kruisjes, 0, -1) }
    case 'kruisje-thuis-plus':
      return { ...stand, kruisjes: bij(stand.kruisjes, 0, 1) }
    case 'kruisje-uit-min':
      return { ...stand, kruisjes: bij(stand.kruisjes, 1, -1) }
    case 'kruisje-uit-plus':
      return { ...stand, kruisjes: bij(stand.kruisjes, 1, 1) }
    case 'minuut-thuis-min':
      return { ...stand, minuten: bij(stand.minuten, 0, -1) }
    case 'minuut-thuis-plus':
      return { ...stand, minuten: bij(stand.minuten, 0, 1) }
    case 'minuut-uit-min':
      return { ...stand, minuten: bij(stand.minuten, 1, -1) }
    case 'minuut-uit-plus':
      return { ...stand, minuten: bij(stand.minuten, 1, 1) }
    case 'pauze':
      return { ...stand, klokLoopt: false }
    case 'klok':
    case 'start-helft':
      return { ...stand, klokLoopt: true }
    case 'ondoen':
      return stand.laatste
        ? { ...stand, score: bij(stand.score, stand.laatste.ploeg, -stand.laatste.punten), laatste: null }
        : stand
    case 'einde-helft':
      // Precies wat de echte tafels doen: helft 2, klok terug op nul, klok stil. Dát is de rust.
      return { ...stand, helft: 2, klok: 0, klokLoopt: false }
    case 'einde-wedstrijd':
      return { ...stand, gedaan: true, klokLoopt: false }
    case 'terugzetten':
      return { ...LEEG }
    default:
      return stand
  }
}
