// De worpen groeperen per werper, zodat je één keer per speler zegt wie het is.
//
// Waarom dit bestaat. Het model leest geen rugnummers van truitjes — op dertig meter is zo'n
// nummer een handvol pixels. Wat het wél kan: dezelfde persoon van beeld tot beeld volgen zolang
// die zichtbaar blijft (cv/houding.py koppelt personen op hun heuppositie). Elke worp draagt zo
// het volgnummer van de werper die hem maakte.
//
// Daarmee wordt "wie wierp wat" een handvol keuzes in plaats van er één per worp: acht spelers
// op zestig worpen. Breekt een spoor — de speler liep even uit beeld — dan komt diezelfde speler
// als tweede werper terug. Dat is geen fout maar iets wat je gewoon nog eens toewijst; twee
// werpers aan dezelfde speler koppelen mag.
//
// Puur: geen database, geen React. Zo ligt de groepering vast zonder een video te draaien.

import { CAMERA2_BASIS } from './cv-samenvoegen'

export type Voorstelwerper = {
  videoTimeS: number
  werper?: number | null
  side?: 'home' | 'away' | null
  verdict?: 'bevestigd' | 'afgewezen' | null
  xM?: number | null
  yM?: number | null
}

export type Werpergroep = {
  /** Het volgnummer uit de videoanalyse. */
  werper: number
  worpen: number
  /** Hoeveel daarvan je al bevestigd hebt — die tellen straks echt mee. */
  bevestigd: number
  eerste: number
  laatste: number
  /** De ploeg die het model bij deze werper zag (null = niet eenduidig). */
  side: 'home' | 'away' | null
  /** Waar deze werper gemiddeld op het veld stond, als dat gemeten is. */
  gemiddeldeY: number | null
}

/**
 * De werpers uit een reeks voorstellen, met het meeste werk bovenaan.
 *
 * Gesorteerd op aantal worpen: wie het vaakst wierp, wijs je eerst toe — dat is de grootste hap
 * uit de wedstrijd. Voorstellen zonder werper (het model kon niemand volgen) blijven buiten de
 * lijst; die worden hier niet stilzwijgend bij iemand geteld.
 */
export function groepeerWerpers(voorstellen: Voorstelwerper[]): Werpergroep[] {
  const kaart = new Map<number, Voorstelwerper[]>()
  for (const v of voorstellen) {
    if (v.verdict === 'afgewezen') continue
    if (typeof v.werper !== 'number' || !Number.isFinite(v.werper)) continue
    const lijst = kaart.get(v.werper) ?? []
    lijst.push(v)
    kaart.set(v.werper, lijst)
  }

  const groepen: Werpergroep[] = []
  for (const [werper, lijst] of kaart) {
    const tijden = lijst.map((v) => v.videoTimeS).sort((a, b) => a - b)
    const kanten = lijst.map((v) => v.side).filter((s): s is 'home' | 'away' => s === 'home' || s === 'away')
    const thuis = kanten.filter((s) => s === 'home').length
    const ys = lijst.map((v) => v.yM).filter((y): y is number => typeof y === 'number')
    groepen.push({
      werper,
      worpen: lijst.length,
      bevestigd: lijst.filter((v) => v.verdict === 'bevestigd').length,
      eerste: tijden[0],
      laatste: tijden[tijden.length - 1],
      // Eén afwijkende meting mag de ploeg van een werper niet omgooien: de meerderheid wint,
      // en bij gelijkspel weten we het niet.
      side: !kanten.length || thuis * 2 === kanten.length ? null : thuis * 2 > kanten.length ? 'home' : 'away',
      gemiddeldeY: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null,
    })
  }
  return groepen.sort((a, b) => b.worpen - a.worpen || a.eerste - b.eerste)
}

/**
 * De naam van een werper-volgnummer op het scherm.
 *
 * Nummers vanaf CAMERA2_BASIS (cv-samenvoegen.ts) komen uit de tweede camera; "werper 1003"
 * zegt niemand iets, "camera 2 · werper 3" wel — en het verklapt meteen in welk beeld je moet
 * kijken om te zien wie het is.
 */
export function werperLabel(werper: number): string {
  return werper >= CAMERA2_BASIS ? `camera 2 · werper ${werper - CAMERA2_BASIS}` : `werper ${werper}`
}

/** De toewijzing zoals ze op de wedstrijd bewaard wordt: werper-volgnummer → speler-id. */
export type Werpertoewijzing = Record<string, number>

export function leesToewijzing(ruw: unknown): Werpertoewijzing {
  const uit: Werpertoewijzing = {}
  if (!ruw || typeof ruw !== 'object') return uit
  for (const [sleutel, waarde] of Object.entries(ruw as Record<string, unknown>)) {
    const werper = Number(sleutel)
    const speler = Number(waarde)
    if (Number.isFinite(werper) && Number.isInteger(speler) && speler > 0) uit[String(werper)] = speler
  }
  return uit
}

/**
 * Hoeveel van de worpen weten straks wie ze maakte?
 *
 * Het getal dat telt vóór je overzet: staan er zestig worpen klaar en zijn er twee werpers
 * toegewezen, dan weet je dat de rest op een gok terechtkomt.
 */
export function dekking(groepen: Werpergroep[], toewijzing: Werpertoewijzing): {
  worpen: number
  toegewezen: number
  deel: number
} {
  const worpen = groepen.reduce((n, g) => n + g.worpen, 0)
  const toegewezen = groepen.reduce((n, g) => n + (toewijzing[String(g.werper)] ? g.worpen : 0), 0)
  return { worpen, toegewezen, deel: worpen ? toegewezen / worpen : 0 }
}
