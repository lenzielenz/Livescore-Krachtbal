// De reviewlaan als diavoorstelling: welke beelden horen bij een voorstel, en wat komt erna.
//
// Waarom dit bestaat. Een voorstel was tot nu toe een tíjdstip: je moest zelf in de video naar
// 04:21 scrubben om te zien waarover de vraag ging. Bij 21 voorstellen is dat 21 keer zoeken,
// en dan heb je nog niets beoordeeld. De vraag hoort mét het beeld te komen — en zodra je
// antwoordt, hoort het volgende vanzelf te verschijnen.
//
// Eén still volstaat daarvoor niet. Een worp ís beweging: op één beeld staat een speler met de
// bal, en of hij die nu loslaat of net ving, kan niemand zien. Een kort lusje van enkele beelden
// rond het moment beslist dat wél — daarom `beeldTijden`.
//
// Beide functies zijn puur: ze rekenen met getallen, niet met video of DOM, zodat de randen
// (het begin van de video, het laatste open voorstel) te testen zijn zonder browser.

/** Hoeveel beelden een lusje toont, en over hoeveel seconden ze gespreid liggen. */
export const BEELDEN = 5
export const SPREIDING_S = 0.8

/**
 * De tijdstippen van het lusje rond één voorstel, oplopend.
 *
 * Rond `t` en niet vanaf `t`: het model wijst het moment van de worp aan, dus de aanloop ligt
 * ervóór en het loslaten erna. Wie alleen vooruit kijkt, mist net de zwaai waar de vraag over
 * gaat.
 *
 * De reeks wordt naar binnen geschoven als hij buiten de video zou vallen (een worp in de eerste
 * seconde bestaat), en nooit korter dan één beeld: liever één stilstaand beeld dan geen.
 */
export function beeldTijden(
  t: number,
  duurS?: number | null,
  aantal: number = BEELDEN,
  spreidingS: number = SPREIDING_S,
): number[] {
  const n = Math.max(1, Math.floor(aantal))
  if (n === 1) return [Math.max(0, t)]
  const eind = duurS != null && Number.isFinite(duurS) && duurS > 0 ? duurS : null
  const halve = Math.max(0, spreidingS) / 2
  // Eerst het venster, dan het binnen de video schuiven — verschuiven en niet inkorten, zodat
  // het lusje even lang blijft en de beweging herkenbaar.
  let van = t - halve
  let tot = t + halve
  if (van < 0) {
    tot += -van
    van = 0
  }
  if (eind != null && tot > eind) {
    van = Math.max(0, van - (tot - eind))
    tot = eind
  }
  const stap = (tot - van) / (n - 1)
  return Array.from({ length: n }, (_, i) => Math.round((van + i * stap) * 1000) / 1000)
}

/** Het minimum dat een voorstel moet dragen om er de volgende in de rij uit te kiezen. */
export type RijVoorstel = { id: number; videoTimeS: number; verdict?: string | null }

/**
 * Het volgende nog openstaande voorstel na `huidigeId`, of null als er geen meer is.
 *
 * `behandeldId` is het voorstel dat zonet beoordeeld werd: dat staat in de lijst die deze
 * functie krijgt vaak nog als "open" (de optimistische update is nog niet rond), en zonder deze
 * uitzondering zou de diavoorstelling blijven hangen op wat je net beantwoordde.
 *
 * Bewust géén omloop naar het begin: aan het einde van de rij hoort het paneel te zeggen dat je
 * klaar bent, niet stilletjes opnieuw te beginnen — anders lijkt een tweede ronde op een eerste.
 */
export function volgendOpen<T extends RijVoorstel>(
  lijst: T[],
  huidigeId: number | null,
  behandeldId?: number | null,
): T | null {
  const open = lijst
    .filter((v) => v.verdict == null && v.id !== behandeldId)
    .sort((a, b) => a.videoTimeS - b.videoTimeS || a.id - b.id)
  if (open.length === 0) return null
  const huidig = lijst.find((v) => v.id === huidigeId)
  if (!huidig) return open[0]
  return (
    open.find((v) => v.videoTimeS > huidig.videoTimeS || (v.videoTimeS === huidig.videoTimeS && v.id > huidig.id))
    ?? null
  )
}
