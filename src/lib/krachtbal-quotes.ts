// Roterende krachtbal-quotes voor de startpagina (LTT-stijl: elk bezoek een ander
// lijntje). Mix van feiten, wist-je-datjes en grappige/gekke oneliners — allemaal
// kloppend met het reglement (rugworp +2, nekworp +1, klok telt op, 3e kruisje, …).
export const KRACHTBAL_QUOTES: string[] = [
  // — Feiten & regels —
  'Een rugworp telt dubbel. Twee punten voor wie durft achteruit te kijken.',
  'Een nekworp is één punt, een rugworp twee. Lef wordt beloond.',
  'De klok telt óp vanaf 0:00 — hier vliegt de tijd letterlijk vooruit.',
  'Vier veldspelers, vier wissels, één coach en nul plaats voor twijfel.',
  'Drie kruisjes en de bal gaat naar de overkant. Sparen is hier niet slim.',
  'Senioren spelen 2×25 minuten. Op het einde voelt elke worp als een marathon.',
  'Wist je dat een gevangen bal het spel meteen omdraait? Twee tikken en alles keert.',
  'Wist je dat de scheidsrechter de klok kan stoppen zonder dat het een time-out kost?',
  'De tweede worp moet de middellijn raken — anders krijgt de tegenstander de bal cadeau.',
  'Krachtbal is door en door Belgisch, uitgevonden tussen de friet en de pintjes.',

  // — Grappig & gek —
  'Achteruit werpen voor dubbele punten. Logisch? Nee. Geniaal? Absoluut.',
  'Krachtbal: omdat gewoon vangen veel te makkelijk was.',
  'De bal weegt meer dan je geweten na een gemiste worp.',
  'Time-out: zestig seconden om te doen alsof er een plan is.',
  'Hier wordt niet gedribbeld — hier wordt geránseld.',
  'Je rug doet pijn? Mooi, dan heb je goed gescoord.',
  'In krachtbal is “gewoon keihard gooien” een volwaardige tactiek.',
  'Coach roept, ploeg knikt, bal beslist.',
  'Krachtbal kijken zonder de regels te kennen is als friet zonder zout: kan, maar waarom?',

  // — Speelse taglines —
  'Welkom in de worpzone, kampioen.',
  'Zet je schrap. Het wordt zwaar — letterlijk.',
  'Vandaag is een goeie dag om iets dubbel te scoren.',
  'Minder scrollen, meer worpen volgen.',
  'Vier tegen vier, bal tegen zwaartekracht.',
  'De beste verdediging? De bal voorbij de middellijn rammen.',
]

// Een willekeurige quote. Server-side aangeroepen op een force-dynamic pagina,
// dus elk paginabezoek levert (meestal) een ander lijntje.
export function randomQuote(): string {
  return KRACHTBAL_QUOTES[Math.floor(Math.random() * KRACHTBAL_QUOTES.length)]
}
