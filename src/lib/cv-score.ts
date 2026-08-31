// Hoe goed doet het model het op jóuw wedstrijd?
//
// De reviewlaan alleen kan die vraag niet beantwoorden: bevestig je voorstellen, dan meet je
// hoeveel er kloppen (precisie), maar niet hoeveel worpen het model gemist heeft. Dat tweede
// getal — de recall — is nu net het interessantste, en daarvoor is een onafhankelijke lijst
// nodig van wat er écht gebeurd is.
//
// Die lijst is er al: elke worp die de aantekenaar tijdens de wedstrijd invoerde, met zijn
// helft en wedstrijdklok, en via de ijkpunten (videoOffsetH1/H2) omgerekend naar een tijdstip
// in de video. Dezelfde tijdlijn waarop de voorstellen staan. Twee lijsten met tijdstippen
// dus, en de vraag is welke bij elkaar horen.
//
// Koppelen gebeurt greedy op tijdsafstand binnen een venster: het dichtste paar eerst, en elke
// worp en elk voorstel hoogstens één keer. Twee voorstellen op dezelfde worp levert dus één
// treffer en één valse — precies wat je wil, anders scoort een detector die alles dubbel
// aanmeldt kunstmatig goed. Spiegelbeeld van cv/evaluate.py, zodat de cijfers in de app en aan
// de commandolijn dezelfde betekenis hebben.

/** Standaardvenster: binnen twee seconden hoort een voorstel bij die worp. */
export const VENSTER_S = 2.0

export type Koppeling = { worp: number; voorstel: number; verschil: number }

export type Scorekaart = {
  worpen: number
  voorstellen: number
  gevonden: number
  gemist: number
  vals: number
  /** Van de voorstellen: welk deel hoort bij een echte worp. */
  precisie: number | null
  /** Van de echte worpen: welk deel is gevonden. */
  recall: number | null
  f1: number | null
  /** Mediane afwijking van de gekoppelde paren (seconden). */
  medianeAfwijking: number | null
  koppelingen: Koppeling[]
  /** De gemiste worpen, op videotijd — daar kan je meteen naartoe springen. */
  gemisteTijden: number[]
}

function mediaan(waarden: number[]): number | null {
  if (!waarden.length) return null
  const s = [...waarden].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Vergelijk de voorstellen van het model met de worpen die een mens invoerde.
 *
 * Beide lijsten zijn videotijden in seconden. Geeft een scorekaart met precisie, recall en de
 * gemiste momenten. Ontbreekt een van beide lijsten, dan blijven de verhoudingen null — een
 * recall van 0% melden terwijl er niets getagd is, zou onzin zijn.
 */
export function vergelijk(worpen: number[], voorstellen: number[], venster = VENSTER_S): Scorekaart {
  const paren: Koppeling[] = []
  for (let w = 0; w < worpen.length; w++) {
    for (let v = 0; v < voorstellen.length; v++) {
      const verschil = Math.abs(worpen[w] - voorstellen[v])
      if (verschil <= venster) paren.push({ worp: w, voorstel: v, verschil })
    }
  }
  paren.sort((a, b) => a.verschil - b.verschil)

  const worpGebruikt = new Set<number>()
  const voorstelGebruikt = new Set<number>()
  const koppelingen: Koppeling[] = []
  for (const p of paren) {
    if (worpGebruikt.has(p.worp) || voorstelGebruikt.has(p.voorstel)) continue
    worpGebruikt.add(p.worp)
    voorstelGebruikt.add(p.voorstel)
    koppelingen.push(p)
  }

  const gevonden = koppelingen.length
  const gemist = worpen.length - gevonden
  const vals = voorstellen.length - gevonden
  const precisie = voorstellen.length ? gevonden / voorstellen.length : null
  const recall = worpen.length ? gevonden / worpen.length : null
  const f1 =
    precisie != null && recall != null && precisie + recall > 0
      ? (2 * precisie * recall) / (precisie + recall)
      : null

  return {
    worpen: worpen.length,
    voorstellen: voorstellen.length,
    gevonden,
    gemist,
    vals,
    precisie,
    recall,
    f1,
    medianeAfwijking: mediaan(koppelingen.map((k) => k.verschil)),
    koppelingen,
    gemisteTijden: worpen.filter((_t, i) => !worpGebruikt.has(i)).sort((a, b) => a - b),
  }
}

/**
 * Hoeveel liggen de voorstellen er stelselmatig naast?
 *
 * Nul overlap kan twee dingen betekenen: het model vond niets, óf de ijking van de video staat
 * scheef en de ingevoerde worpen staan op een heel ander tijdstip. Dat verschil is te zien: bij
 * een scheve ijking liggen álle voorstellen even ver van hun worp, bij een blinde detector
 * liggen ze willekeurig.
 *
 * Daarom niet "het dichtstbijzijnde voorstel per worp" (dat onderschat een grote verschuiving —
 * aan de randen ligt de buurworp dichter dan het eigen voorstel), maar de klassieke aanpak voor
 * een constante verschuiving: van álle paren het verschil nemen en kijken waar de meeste paren
 * het over eens zijn. Die klomp is de verschuiving.
 *
 * Geeft null als er geen twee paren op hetzelfde verschil uitkomen — dan is er geen patroon en
 * valt er niets te beweren.
 */
export function verschuiving(
  worpen: number[],
  voorstellen: number[],
  tolerantie = VENSTER_S / 2,
): number | null {
  if (worpen.length < 1 || voorstellen.length < 1) return null
  const verschillen: number[] = []
  for (const w of worpen) for (const v of voorstellen) verschillen.push(v - w)

  let besteAantal = 0
  let besteKlomp: number[] = []
  for (const d of verschillen) {
    const klomp = verschillen.filter((x) => Math.abs(x - d) <= tolerantie)
    // Bij een gelijk aantal wint de kleinste verschuiving: die verklaart hetzelfde met minder.
    if (klomp.length > besteAantal
        || (klomp.length === besteAantal && besteKlomp.length > 0
            && Math.abs(d) < Math.abs(mediaan(besteKlomp) as number))) {
      besteAantal = klomp.length
      besteKlomp = klomp
    }
  }
  if (besteAantal < 2) return null
  return mediaan(besteKlomp)
}

export type Voorstel = {
  videoTimeS: number
  reviewed?: boolean
  verdict?: 'bevestigd' | 'afgewezen' | null
  xM?: number | null
  yM?: number | null
}

export type Videoscore = {
  voorstellen: number
  van: number | null
  tot: number | null
  metLanding: number
  beoordeeld: number
  bevestigd: number
  afgewezen: number
  /** Van wat je beoordeeld hebt: welk deel klopte. Null zolang je niets beoordeeld hebt. */
  precisie: number | null
}

/**
 * Wat het model in de vídeo vond, en wat jij daarvan bevestigde.
 *
 * Dit is de enige maat die niets van de ijking van de wedstrijdklok hoeft te weten: elk
 * voorstel draagt zijn eigen tijdstip in de opname, en je oordeel hangt aan datzelfde
 * voorstel. Klopt de ijking van helft 1 of 2 niet, dan verandert er hier niets.
 *
 * Wat het níét kan zeggen: hoeveel worpen het model gemist heeft. Je beoordeelt alleen wat het
 * aandroeg — over wat het nooit aandroeg zegt geen enkele review iets.
 */
export function videoscore(voorstellen: Voorstel[]): Videoscore {
  const tijden = voorstellen.map((v) => v.videoTimeS).filter((t) => Number.isFinite(t))
  const beoordeeld = voorstellen.filter((v) => v.verdict === 'bevestigd' || v.verdict === 'afgewezen')
  const bevestigd = beoordeeld.filter((v) => v.verdict === 'bevestigd').length
  return {
    voorstellen: voorstellen.length,
    van: tijden.length ? Math.min(...tijden) : null,
    tot: tijden.length ? Math.max(...tijden) : null,
    metLanding: voorstellen.filter((v) => v.xM != null && v.yM != null).length,
    beoordeeld: beoordeeld.length,
    bevestigd,
    afgewezen: beoordeeld.length - bevestigd,
    precisie: beoordeeld.length ? bevestigd / beoordeeld.length : null,
  }
}

/** De scorekaart in één zin, zoals ze in de app staat. */
export function inWoorden(kaart: Scorekaart): string {
  if (!kaart.worpen) return 'Er zijn nog geen worpen ingevoerd om mee te vergelijken.'
  if (!kaart.voorstellen) return `Nog geen voorstellen om te vergelijken met ${kaart.worpen} ingevoerde worpen.`
  const pct = (w: number | null) => (w == null ? '—' : `${Math.round(w * 100)}%`)
  return (
    `Van de ${kaart.worpen} ingevoerde worpen vond het model er ${kaart.gevonden} (${pct(kaart.recall)}). ` +
    `Van de ${kaart.voorstellen} voorstellen hoorden er ${kaart.gevonden} bij een echte worp (${pct(kaart.precisie)}).`
  )
}
