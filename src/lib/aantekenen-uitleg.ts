// Hoe je aan de tornooitafel een wedstrijd aantekent — één keer beschreven.
//
// Deze lijst voedt drie dingen tegelijk: het uitlegscherm, de oefenmodus waarin je de stappen
// écht kan doortikken, en de afdrukbare handleiding (PDF). Dat is met opzet één bron: een
// papieren handleiding die iets anders zegt dan het scherm is erger dan geen handleiding, en
// dat gebeurt gegarandeerd zodra je ze apart onderhoudt.
//
// De teksten beschrijven de knoppen zoals ze er écht staan aan de TORNOOITAFEL (zie
// `tornooi/[id]/aantekenen/[matchId]/TournamentScoresheet.tsx`). Dat is een ánder scherm dan de
// competitie-aantekentafel: hier staat een echte Start-knop in plaats van een klok waarop je
// tikt. Verandert daar een knop, dan hoort deze lijst mee te veranderen — vandaar dat de tests
// de belangrijkste knopnamen naast elkaar leggen, en dat de screenshots uit de echte app komen.
//
// LET OP bij het schrijven: `tekst`, `titel` en `letOp` gaan óók naar de PDF, en de
// standaardletters van pdf-lib (WinAnsi) kennen geen emoji of pijltjes. Zulke tekens horen in
// `icoon` of in `knop`, die enkel op het scherm gebruikt worden — `naarWinAnsi` hieronder is
// het vangnet, geen vrijbrief.

/** Wat de oefenmodus van de gebruiker verwacht om naar de volgende stap te gaan. */
export type OefenActie =
  | { soort: 'lees' } // niets te doen: lezen en verder
  | { soort: 'knop'; doel: string } // tik de knop met dit id in het nagebouwde scherm

export type UitlegStap = {
  nr: number
  /** Kort en herkenbaar; komt zo ook boven de PDF-stap. */
  titel: string
  /** Enkel voor het scherm — mag emoji bevatten. */
  icoon: string
  /** Eén zin, voor op papier. Kort en krachtig: de handleiding ligt naast een gsm, niet op
   *  een leestafel. Platte tekst. */
  kort: string
  /** De volledige uitleg voor het scherm. Platte tekst: mag ook naar papier. */
  tekst: string
  /** Waar het misloopt als je het verkeerd doet. Platte tekst. */
  letOp?: string
  /** De letterlijke knop op het scherm (mag pijltjes/emoji bevatten). */
  knop?: string
  /** Welk nagebouwd scherm er getoond wordt, en wat je erin moet doen. */
  scherm: 'inloggen' | 'dagprogramma' | 'klok' | 'score' | 'tellers' | 'helft' | 'einde'
  oefening: OefenActie
}

export const AANTEKEN_STAPPEN: UitlegStap[] = [
  {
    nr: 1,
    titel: 'Meld je aan',
    icoon: '🔑',
    kort: 'Log in met je clubaccount.',
    tekst:
      'Log in met je clubaccount. Zonder aanmelding zie je het dagprogramma wel, maar staat er geen '
      + 'knop om aan te tekenen — de knop verschijnt pas als de app weet wie je bent.',
    letOp: 'Weet je je wachtwoord niet meer? Vraag een nieuw aan via de inlogpagina; wachten tot aan de aftrap is te laat.',
    knop: 'Inloggen',
    scherm: 'inloggen',
    oefening: { soort: 'knop', doel: 'inloggen' },
  },
  {
    nr: 2,
    titel: 'Ga naar het dagprogramma',
    icoon: '📋',
    kort: 'Open het tornooi en kies Dagprogramma.',
    tekst:
      'Open het tornooi en kies het dagprogramma. Daar staan alle wedstrijden van vandaag, met het '
      + 'uur, het veld, de categorie en de speelduur.',
    scherm: 'dagprogramma',
    oefening: { soort: 'lees' },
  },
  {
    nr: 3,
    titel: 'Druk op Aantekenen bij jouw wedstrijd',
    icoon: '👆',
    kort: 'Zoek jouw wedstrijd en druk op Aantekenen.',
    tekst:
      'Zoek de rij van jouw wedstrijd en tik rechts op Aantekenen. Controleer eerst het uur, het veld '
      + 'en de twee ploegen: op een tornooi staan er vaak twee wedstrijden vlak na elkaar op hetzelfde veld.',
    letOp:
      'Zit je toch in de verkeerde wedstrijd? Ga terug en kies de juiste. Zolang je niets gestart hebt, is er niets gebeurd.',
    knop: 'Aantekenen',
    scherm: 'dagprogramma',
    oefening: { soort: 'knop', doel: 'aantekenen' },
  },
  {
    nr: 4,
    titel: 'Start bij de aftrap',
    icoon: '▶',
    kort: 'Druk op Start en bevestig met Ja, starten.',
    tekst:
      'Druk onderaan op Start en bevestig met Ja, starten. De klok begint te lopen en de wedstrijd '
      + 'gaat live.',
    letOp:
      'Start pas wanneer er echt afgetrapt wordt. Te vroeg gestart? Onderaan staat Terugzetten naar niet-gestart.',
    knop: '▶ Start',
    scherm: 'klok',
    oefening: { soort: 'knop', doel: 'start' },
  },
  {
    nr: 5,
    titel: 'Tel de doelpunten',
    icoon: '🏐',
    kort: 'Nekworp = +1, rugworp = +2, bij de ploeg die scoorde.',
    tekst:
      'Bij elke ploeg staan twee knoppen: +1 voor een nekworp en +2 voor een rugworp. Druk bij de ploeg '
      + 'die scoorde. De stand volgt meteen, ook op het kantinescherm en bij de supporters thuis.',
    letOp:
      'Verkeerd getikt? Gebruik Ondoen onderaan; die knop zegt er ook bij wat ze wegneemt.',
    knop: '+1 nekworp · +2 rugworp',
    scherm: 'score',
    oefening: { soort: 'knop', doel: 'score-thuis-nek' },
  },
  {
    nr: 6,
    titel: 'Kruisjes, minuten en de klok',
    icoon: '⏱',
    kort: 'Kruisjes en minuten met - en +. Klok stil? Pauze.',
    tekst:
      'Onder de stand staan per ploeg twee tellers: Kruisjes en Minuten (de minuten die de '
      + 'scheidsrechter toekende). Zet ze bij met de min- en plusknoppen. Moet de klok even stil, '
      + 'druk dan op Pauze; met Klok loopt hij weer verder.',
    knop: '⏸ Pauze · ▶ Klok',
    scherm: 'tellers',
    oefening: { soort: 'knop', doel: 'kruisje-thuis-plus' },
  },
  {
    nr: 7,
    titel: 'Einde eerste helft',
    icoon: '⏭',
    kort: 'Rust? Druk op Einde 1e helft.',
    tekst:
      'Is de eerste helft gedaan, druk dan op Einde 1e helft en bevestig. De klok springt terug op '
      + 'nul en blijft stil staan: dat is de rust. De stand blijft gewoon staan.',
    letOp:
      'De klok op nul is geen fout — de tweede helft begint opnieuw bij nul. De tijd van de eerste '
      + 'helft is bewaard in de wedstrijd.',
    knop: '\u23ed Einde 1e helft',
    scherm: 'helft',
    oefening: { soort: 'knop', doel: 'einde-helft' },
  },
  {
    nr: 8,
    titel: 'Start de tweede helft',
    icoon: '\u25b6',
    kort: 'Ploegen op het veld? Start de 2e helft.',
    tekst:
      'Tijdens de rust staat de klok stil. Staan de ploegen weer klaar, druk dan op Start 2e helft — '
      + 'pas dan begint de tijd te lopen. Zo telt de rust niet mee als speeltijd.',
    knop: '\u25b6 Start 2e helft',
    scherm: 'helft',
    oefening: { soort: 'knop', doel: 'start-helft' },
  },
  {
    nr: 9,
    titel: 'Einde wedstrijd',
    icoon: '⏹',
    kort: 'Gedaan? Druk op Einde en bevestig.',
    tekst:
      'Na de tweede helft druk je op Einde en bevestig je. De eindstand wordt vastgelegd en de winnaar '
      + 'schuift door in het schema.',
    letOp:
      'Per ongeluk beëindigd? De wedstrijd kan heropend worden — je verliest niets van wat je ingevoerd hebt.',
    knop: '⏹ Einde',
    scherm: 'einde',
    oefening: { soort: 'knop', doel: 'einde-wedstrijd' },
  },
  {
    nr: 10,
    titel: 'Klaar — en dan?',
    icoon: '✅',
    kort: 'De uitslag staat er meteen. Terug naar het dagprogramma.',
    tekst:
      'De uitslag staat meteen in het klassement en op het kantinescherm. Ga terug naar het dagprogramma '
      + 'voor de volgende wedstrijd aan jouw tafel.',
    scherm: 'einde',
    oefening: { soort: 'lees' },
  },
]

/** Waar de uitleg (en de knop op de tornooipagina) naartoe wijst. */
export const UITLEG_PAD = '/uitleg/aantekenen'
/** Waar de afdrukbare handleiding vandaan komt. */
export const UITLEG_PDF_PAD = '/api/uitleg/aantekenen'

/**
 * Tekst geschikt maken voor de standaardletters van pdf-lib.
 *
 * Die kennen enkel WinAnsi. Eén emoji of één gedachtestreepje-te-veel laat het genereren van de
 * hele handleiding klappen — en dan staat er niets in plaats van een tekentje minder. Vandaar
 * dat de bekende gevallen vertaald worden (aanhalingstekens, streepjes, pijltjes) en de rest
 * eruit gaat.
 */
export function naarWinAnsi(tekst: string): string {
  const vervang: Record<string, string> = {
    '—': '-', '–': '-', '‑': '-', '−': '-',
    '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
    '…': '...', '→': '->', '←': '<-',
    // Speeltekens uit knopnamen: op papier leest "Einde wedstrijd" beter dan "[stop] Einde
    // wedstrijd". Ze komen enkel in `knop` en `icoon` voor, nooit in een zin.
    '⏭': '', '⏹': '', '▶': '', '↶': '', '⏱': '', '✖': '',
    '×': 'x', '·': '-', ' ': ' ',
  }
  let uit = ''
  for (const teken of tekst) {
    const vervanging = vervang[teken]
    if (vervanging !== undefined) {
      uit += vervanging
      continue
    }
    const code = teken.codePointAt(0) ?? 0
    // WinAnsi dekt latin-1 plus wat leestekens; alles daarbuiten (emoji, symbolen) valt weg.
    if (code >= 32 && code <= 255) uit += teken
  }
  return uit.replace(/ {2,}/g, ' ').trim()
}
