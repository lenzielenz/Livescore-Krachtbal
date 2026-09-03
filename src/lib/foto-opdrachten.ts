// Foto-opdrachten voor de tornooidag: een speelse prikkel bij het insturen van foto's.
//
// Elke deelnemer krijgt álle vijftig opdrachten, maar in een EIGEN volgorde. Die volgorde wordt
// geschud met de deelnemer zelf als zaad, en dat heeft drie gevolgen die je alle drie wil:
//
//   • Twee supporters naast elkaar jagen zelden op dezelfde foto — de opdrachten lopen door
//     elkaar over het hele veld.
//   • Dezelfde deelnemer krijgt op zijn tablet exact dezelfde reeks als op zijn gsm, want er
//     wordt niets bewaard: dezelfde deelnemer + hetzelfde tornooi geeft altijd dezelfde volgorde.
//   • Een ander tornooi geeft een andere volgorde, dus wie vaker meedoet krijgt niet elke keer
//     hetzelfde rijtje.
//
// De vorige aanpak lootte enkel een STARTPOSITIE per toestel en liep daarna de vaste lijst af.
// Twee supporters die toevallig gelijk begonnen, bleven de hele dag dezelfde opdracht houden, en
// wie zijn browsergeschiedenis wiste begon opnieuw vooraan.
//
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

/** De opdracht op een positie in de ongeschudde lijst (cycled). */
export function opdrachtOp(index: number): string {
  const n = FOTO_OPDRACHTEN.length
  return FOTO_OPDRACHTEN[((index % n) + n) % n]
}

/** Het zaad van een deelnemer op een tornooidag: dezelfde persoon, ander tornooi = andere reeks. */
export function zaadVoor(deelnemerId: number | string, groep: string): string {
  return `${deelnemerId}·${groep}`
}

/**
 * Tekst → getal. Een gewone FNV-1a: we hebben geen cryptografie nodig, wel dat twee zaden die
 * één teken schelen ("gebruiker 11" en "gebruiker 12") volstrekt verschillende volgordes geven.
 */
function hash(tekst: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: klein, snel en — het enige wat hier telt — overal exact hetzelfde. */
function generator(zaad: number): () => number {
  let s = zaad >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * De volgorde waarin één deelnemer de vijftig opdrachten krijgt: een schudbeurt van 0…49.
 *
 * `ronde` telt mee in het zaad, zodat iemand die alle vijftig volbracht heeft aan een nieuw
 * geschud rijtje begint in plaats van exact hetzelfde nog eens te krijgen.
 */
export function volgordeVoor(zaad: string, ronde = 0): number[] {
  const rnd = generator(hash(`${zaad}#${ronde}`))
  const uit = FOTO_OPDRACHTEN.map((_, i) => i)
  // Fisher-Yates, van achter naar voor: elke volgorde is even waarschijnlijk.
  for (let i = uit.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[uit[i], uit[j]] = [uit[j], uit[i]]
  }
  return uit
}

export type Opdracht = {
  /** De opdrachttekst zoals de deelnemer ze te zien krijgt. */
  tekst: string
  /** Het hoeveelste van de vijftig (1-based) — puur om te tonen. */
  nummer: number
  totaal: number
}

/**
 * De opdracht die nu aan de beurt is.
 *
 * `volbracht` is het aantal opdrachten dat deze deelnemer op deze tornooidag al ingestuurd heeft.
 * Voorbij de vijftig begint een volgende ronde, opnieuw geschud.
 */
export function opdrachtVoor(zaad: string, volbracht: number): Opdracht {
  const totaal = FOTO_OPDRACHTEN.length
  const n = Math.max(0, Math.floor(volbracht))
  const ronde = Math.floor(n / totaal)
  const positie = n % totaal
  const index = volgordeVoor(zaad, ronde)[positie]
  return { tekst: FOTO_OPDRACHTEN[index], nummer: positie + 1, totaal }
}
