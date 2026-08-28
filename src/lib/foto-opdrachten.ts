// Foto-opdrachten voor de tornooidag: een speelse prikkel bij het insturen van foto's.
// De opdracht wisselt telkens de supporter er één volbracht heeft (na elke geslaagde upload
// schuift de lijst één plek door). De startpositie is willekeurig per toestel, zodat elke
// gsm op het veld met een ándere opdracht begint — samen dekken de supporters zo de hele lijst.
// Vijftig opdrachten: genoeg voor een hele tornooidag, doorspekt met wat krachtbal eigen maakt
// (de balgewichten van 800 g tot 4 kg, kegeltjes, scheidsrechters, kunstgras, jeugd, water).

export const FOTO_OPDRACHTEN: readonly string[] = [
  '📸 Foto met het scorebord',
  '🤝 Foto met een tegenstander',
  '👕 Foto in het tenue van de tegenstander',
  '🏐 Foto met de wedstrijdbal',
  '📣 Foto van de luidste supporters',
  '🧑‍⚖️ Foto met de scheidsrechter',
  '🌭 Foto van je kantine-bestelling',
  '👟 Foto van de vuilste schoenen van de dag',
  '🎉 Foto van de mooiste viering',
  '👶 Foto met de jongste supporter van de dag',
  '🧤 Foto van de beste vangst (actie!)',
  '☀️ Foto van het hele veld in één beeld',
  '🏋️ Foto met de bal van 4 kg — wie houdt ’m het langst omhoog?',
  '🪶 Foto met het lichtste balletje van 800 gram',
  '⚖️ Foto met alle balgewichten op een rij: 800 g, 1, 2, 3 en 4 kg',
  '💪 Foto van de dikste spierballen naast een bal van 3 kg',
  '🧒 Foto met een jeugdspeler die vandaag zijn of haar eerste match speelt',
  '🌟 Foto van de jongste speler van de dag in actie',
  '🎓 Foto van een oud-speler die de jeugd tips geeft',
  '🔺 Foto van de hoogste toren kegeltjes',
  '🎩 Foto met een kegeltje als hoedje',
  '🎯 Foto van een perfect rechte rij kegeltjes',
  '🦺 Foto van de scheidsrechter met de beste glimlach',
  '🫡 Foto van de scheidsrechter die fluit (actie!)',
  '🟩 Foto liggend op het kunstgras',
  '🌱 Foto van de mooiste schuifsliding-strepen op het kunstgras',
  '💦 Foto van een verfrissende waterpauze',
  '🚰 Foto van de grootste drinkbus van de dag',
  '🌧️ Foto van een plas water waar toch in gespeeld wordt',
  '🤸 Foto van de opwarming',
  '🤾 Foto van een worp in volle actie',
  '🦘 Foto van een sprong tijdens het vangen',
  '🖐️ Foto van de handen van een werper, close-up',
  '🗣️ Foto van de coach die aanwijzingen roept',
  '📋 Foto van de aantekentafel in actie',
  '🙌 Foto van een high five na een doelpunt',
  '🤗 Foto van een knuffel tussen twee tegenstanders',
  '👵 Foto met de oudste supporter van de dag',
  '🌈 Foto met supporters van drie verschillende clubs samen',
  '🧣 Foto met een clubsjaal of clubvlag',
  '🎨 Foto van geschminkte supporters',
  '🤳 Selfie met vijf supporters in beeld',
  '🧢 Foto van de gekste pet of hoed langs het veld',
  '🧦 Foto van de opvallendste kousen',
  '🎒 Foto van de volste sporttas',
  '📏 Foto op de middellijn — één voet aan elke kant',
  '🥅 Foto in het doelgebied (enkel als er niet gespeeld wordt!)',
  '☕ Foto met een dampende koffie langs het veld',
  '😴 Foto van iemand die heerlijk uitrust tussen twee matchen',
  '🏆 Foto waarop je doet alsof je de beker al gewonnen hebt',
] as const

/** Willekeurige startpositie: elke gsm/browser krijgt zo een eigen eerste opdracht. */
export function willekeurigeStart(rnd: () => number = Math.random): number {
  return Math.floor(rnd() * FOTO_OPDRACHTEN.length) % FOTO_OPDRACHTEN.length
}

/** De opdracht op een positie (cycled door de lijst). */
export function opdrachtOp(index: number): string {
  const n = FOTO_OPDRACHTEN.length
  return FOTO_OPDRACHTEN[((index % n) + n) % n]
}
