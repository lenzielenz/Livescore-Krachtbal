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

  // — Compleet absurd (citroenen, kometen, totale onzin — maar altijd krachtbal) —
  'Werp de bal als een vliegende citroen richting het doelgebied — easy peasy lemon squeeze.',
  'Een rugworp zo snel dat hij een komeet inhaalt. Twee punten, één staartster.',
  'Als citroenen konden vliegen, speelden ze krachtbal. Met rugworp, uiteraard.',
  'De bal is een citroen met ambitie; het doelgebied is z’n bestemming.',
  'Drie kruisjes en het regent vliegende citroenen aan de overkant.',
  'Rugworp = komeetinslag in het doelgebied. De krater telt dubbel.',
  'Easy peasy lemon squeeze, zei niemand ooit vóór een doelworp in de slotseconde.',
  'Sneller dan een komeet, zuurder dan een citroen, dubbel zoals een rugworp.',
  'Wist je dat? Geen enkele komeet miste ooit een nekworp. Bron: het heelal.',
  'Squeeze de citroen, ram de bal, scoor de rug — in ongeveer die volgorde.',
  'Time-out: zelfs kometen pauzeren even. Eén minuut citroensap.',
  'Het doelgebied is klein, het heelal is groot — jouw rugworp overbrugt beide.',
  'Gooi met de kracht van duizend citroenen en de precisie van één komeet.',
  'Een gevangen bal keert het spel, net als een citroen die plots besluit te vliegen.',
  'Krachtbal: waar citroenen vliegen, kometen scoren en de zwaartekracht toekijkt.',
  'De middellijn raken is easy peasy; de lemon squeeze komt bij de tweede worp.',
]

// Een willekeurige quote. Server-side aangeroepen op een force-dynamic pagina,
// dus elk paginabezoek levert (meestal) een ander lijntje.
export function randomQuote(): string {
  return KRACHTBAL_QUOTES[Math.floor(Math.random() * KRACHTBAL_QUOTES.length)]
}

// Vaste quote voor één dag (deterministisch op basis van een seed, bv. de datum van vandaag).
// Zo blijft de slogan stabiel tijdens het browsen — hij verandert niet telkens je van datum wisselt —
// maar levert elke dag een vers lijntje op.
export function quoteForDay(daySeed: string): string {
  let h = 0
  for (let i = 0; i < daySeed.length; i++) h = (h * 31 + daySeed.charCodeAt(i)) >>> 0
  return KRACHTBAL_QUOTES[h % KRACHTBAL_QUOTES.length]
}
