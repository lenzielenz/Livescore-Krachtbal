// De overgang tussen de twee helften, zoals de aantekentafels hem tonen.
//
// Onder de motorkap doen alle drie de motoren (competitie, vereenvoudigd, tornooi) hetzelfde bij
// het afsluiten van een helft: helft +1, klok terug op 0, klok stil. Dat is de rust. De schérmen
// vertelden dat niet:
//
//   • aan de tornooitafel heette de knop "⏭ 2e helft" — alsof je de tweede helft start, terwijl
//     je de eerste afsluit. Wie erop drukte, zag de klok op nul springen en dacht dat hij iets
//     kapot had gemaakt;
//   • daarna stond er enkel een kale "▶ Klok". Nergens stond dat het rust was, en niets zei dat
//     de tweede helft nog moest beginnen.
//
// Dus: hier staat wat een scherm op elk moment hoort te tonen, en alle tafels lezen ervan.
// Eén plek, één waarheid, en te testen zonder een scherm te openen.

export type HelftStand = {
  status: 'pending' | 'live' | 'finished'
  /** 1 = eerste helft, 2 = tweede. */
  helft: number
  klokLoopt: boolean
  /** Stand van de klok in seconden. */
  klokSeconden: number
}

/**
 * Mag de eerste helft nu afgesloten worden?
 *
 * Enkel tijdens een lopende eerste helft. Na de rust is er niets meer af te sluiten behalve de
 * wedstrijd zelf.
 */
export function magHelftAfsluiten(s: HelftStand): boolean {
  return s.status === 'live' && s.helft === 1
}

/**
 * Staat de wedstrijd in de rust?
 *
 * Dat is: de tweede helft is aangebroken, maar er is nog geen seconde van gespeeld. Precies de
 * toestand waar de aantekenaar even niets hoeft te doen — en waar het scherm dat ook mag zeggen
 * in plaats van een stilstaande klok te tonen zonder uitleg.
 */
export function inRust(s: HelftStand): boolean {
  return s.status === 'live' && s.helft >= 2 && !s.klokLoopt && s.klokSeconden === 0
}

/** Wat er op de knop staat die de eerste helft afsluit. */
export const EINDE_HELFT_KNOP = '⏭ Einde 1e helft'

/**
 * Wat er op de klokknop staat.
 *
 * In de rust is dat niet "Klok" maar "Start 2e helft": dát is wat de aantekenaar op dat moment
 * doet, en het is meteen het antwoord op "en nu?".
 */
export function klokKnopLabel(s: HelftStand): string {
  if (s.klokLoopt) return '⏸ Pauze'
  if (inRust(s)) return `▶ Start ${s.helft}e helft`
  return '▶ Klok'
}

/** De bevestiging bij het afsluiten van de eerste helft (dezelfde tekst op elke tafel). */
export const EINDE_HELFT_BEVESTIGING = {
  titel: 'Eerste helft afsluiten?',
  tekst:
    'De klok gaat naar de rust: hij springt terug op 0 en blijft stil staan. De stand blijft '
    + 'gewoon staan. Daarna start je zelf de tweede helft.',
  knop: '⏭ Ja, einde eerste helft',
}
