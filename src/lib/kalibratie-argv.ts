// De kalibratiepunten omzetten naar argumenten voor cv/calibrate.py.
//
// Er zijn twee soorten punten, en ze gaan langs een andere vlag:
//
//   • een LIJNKRUISING van het veldmodel — die kent calibrate.py bij naam, dus volstaat het label
//     (`--punt "px,py=doellijn_thuis_links"`);
//   • een ANKERPUNT buiten het veldmodel — de hoek van de omheining, een paal, de hoek van de
//     kantine. Zo'n punt staat nergens in het model, dus gaan zijn veldcoördinaten mee
//     (`--anker "px,py=x_m,y_m:naam"`). Die coördinaten komen van een luchtfoto (lib/luchtfoto.ts).
//
// Waarom dit een eigen module is: dezelfde omzetting gebeurt op twee plekken in cv-analyse.ts (de
// vaste kalibratie en de ijkbeelden voor een bewegende camera). Twee kopieën die uit elkaar
// groeien is precies hoe een ankerpunt stil verdwijnt uit de ene weg en niet uit de andere.

export type KalibratiePunt = {
  label: string
  x: number
  y: number
  /** Veldcoördinaten in meters. Aanwezig = dit is een ankerpunt, geen lijnkruising. */
  veldM?: [number, number] | null
}

/** Is dit een vrij ankerpunt (met eigen veldcoördinaten) in plaats van een lijnkruising? */
export function isAnker(p: KalibratiePunt): boolean {
  const v = p.veldM
  return Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])
}

/** Een naam die veilig door de `--anker`-vlag past (geen dubbele punt, geen komma). */
export function veiligAnkerNaam(label: string): string {
  const schoon = String(label)
    .replace(/[:,="\n\r]+/g, ' ')
    // De vervanging laat dubbele spaties achter ("hoek: kantine" → "hoek  kantine"); die trekken
    // we samen, anders staat er een slordige naam in het bestand.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
  return schoon || 'anker'
}

/** De volledige argumentenlijst voor één beeld: lijnkruisingen én ankerpunten. */
export function puntArgumenten(punten: KalibratiePunt[]): string[] {
  return punten.flatMap((p) => {
    const px = Math.round(p.x)
    const py = Math.round(p.y)
    if (!isAnker(p)) return ['--punt', `${px},${py}=${p.label}`]
    const [xm, ym] = p.veldM as [number, number]
    return ['--anker', `${px},${py}=${xm},${ym}:${veiligAnkerNaam(p.label)}`]
  })
}
