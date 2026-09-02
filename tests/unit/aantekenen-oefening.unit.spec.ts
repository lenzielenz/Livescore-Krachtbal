import { describe, it, expect } from 'vitest'

import {
  beginstandVoor,
  knopBeschikbaar,
  knoppenVoor,
  naTik,
  type OefenStand,
} from '@/lib/aantekenen-oefening'
import { AANTEKEN_STAPPEN } from '@/lib/aantekenen-uitleg'

// Het oefenscherm van de aantekenuitleg.
//
// Twee fouten die hier écht gevonden zijn, staan aan de basis van deze tests:
//   1. "de knop einde eerste helft werkt niet" — je kwam bij stap 7 aan terwijl het scherm al op
//      de tweede helft stond, dus die knop bestond niet meer en de oefening liep dood;
//   2. "de +2 voor Lissewege werkt niet" — die knop stond er wel, maar er hing geen enkele
//      afhandeling aan.
//
// Allebei onzichtbaar in een typecheck en allebei fataal voor wie leert. Vandaar: elke stap moet
// zijn eigen knop kúnnen tonen, en elke knop die getoond wordt moet iets dóen.

describe('elke stap is te voltooien', () => {
  it('toont in elke stap de knop die gevraagd wordt', () => {
    for (const stap of AANTEKEN_STAPPEN) {
      if (stap.oefening.soort !== 'knop') continue
      // De eerste drie stappen spelen op het inlog- en dagprogrammascherm; die knoppen horen
      // niet bij de tafelstand.
      if (stap.scherm === 'inloggen' || stap.scherm === 'dagprogramma') continue
      const stand = beginstandVoor(stap.nr)
      expect(
        knopBeschikbaar(stand, stap.oefening.doel),
        `stap ${stap.nr} (${stap.titel}) vraagt "${stap.oefening.doel}", maar die knop staat er niet`,
      ).toBe(true)
    }
  })

  it('zet elke stap terug naar zijn eigen begin', () => {
    // Precies de doodloper: wie in stap 6 al naar de tweede helft ging, moet in stap 7 tóch weer
    // een eerste helft voor zich krijgen.
    expect(beginstandVoor(7).helft).toBe(1)
    expect(beginstandVoor(8).helft).toBe(2)
    // Stap 8 is de rust: tweede helft, klok op nul en stil. Precies de toestand waarin je
    // "Start 2e helft" moet vinden.
    expect(beginstandVoor(8).klok).toBe(0)
    expect(beginstandVoor(8).klokLoopt).toBe(false)
    expect(beginstandVoor(4).gestart).toBe(false)
    expect(beginstandVoor(5).gestart).toBe(true)
  })
})

describe('naTik', () => {
  const live = beginstandVoor(5)

  it('laat élke zichtbare knop iets doen', () => {
    // De +2 van de uitploeg deed niets: de knop stond er, maar er hing geen afhandeling aan.
    // Zoiets voelt als een kapotte app — het tegenovergestelde van wat een oefenscherm moet doen.
    //
    // Met tellers op één, anders kán een min-knop niets doen (onder nul gaan we niet) en zou de
    // test een terechte grens als fout aanrekenen.
    const vol: OefenStand = {
      ...live, kruisjes: [1, 1], minuten: [1, 1], laatste: { ploeg: 0, punten: 1 },
    }
    for (const doel of knoppenVoor(vol)) {
      expect(naTik(vol, doel), `"${doel}" verandert niets aan het scherm`).not.toEqual(vol)
    }
  })

  it('telt de punten bij de juiste ploeg', () => {
    expect(naTik(live, 'score-thuis-nek').score).toEqual([1, 0])
    expect(naTik(live, 'score-thuis-rug').score).toEqual([2, 0])
    expect(naTik(live, 'score-uit-nek').score).toEqual([0, 1])
    expect(naTik(live, 'score-uit-rug').score).toEqual([0, 2])
  })

  it('draait met Ondoen de laatste tik terug', () => {
    const na = naTik(naTik(live, 'score-uit-rug'), 'ondoen')
    expect(na.score).toEqual([0, 0])
    expect(na.laatste).toBeNull()
  })

  it('laat tellers niet onder nul zakken', () => {
    expect(naTik(live, 'kruisje-thuis-min').kruisjes).toEqual([0, 0])
  })

  it('gaat bij einde eerste helft naar de rust: klok op nul en stil', () => {
    // De melding: "einde 1ste helft is vreemd dat je 2de helft moet aanklikken, want als je drukt
    // 2de helft dan start de tijd opnieuw." De klok hóórt op nul te springen — dat is de rust —
    // maar het oefenscherm bleef gewoon doortellen alsof de wedstrijd verder liep, en dat leert
    // iets aan wat aan de echte tafel niet gebeurt.
    const eindeH1 = { ...live, klok: 583 }
    const rust = naTik(eindeH1, 'einde-helft')
    expect(rust.helft).toBe(2)
    expect(rust.klok).toBe(0)
    expect(rust.klokLoopt).toBe(false)
    // En dan staat er geen kale "Klok" maar een knop die zegt wát je start.
    expect(knopBeschikbaar(rust, 'start-helft')).toBe(true)
    expect(knopBeschikbaar(rust, 'klok')).toBe(false)
    // De stand blijft staan — dat is precies wat de handleiding belooft.
    expect(rust.score).toEqual(eindeH1.score)
    // Starten laat de tijd weer lopen.
    expect(naTik(rust, 'start-helft').klokLoopt).toBe(true)
  })

  it('negeert een knop die nu niet op het scherm staat', () => {
    // In de tweede helft bestaat "2e helft" niet meer; een tik daarop hoort niets te doen in
    // plaats van de stand stiekem te veranderen.
    const tweede: OefenStand = { ...live, helft: 2 }
    expect(naTik(tweede, 'einde-helft')).toEqual(tweede)
  })

  it('sluit de wedstrijd af en laat dan niets meer toe', () => {
    const af = naTik(live, 'einde-wedstrijd')
    expect(af.gedaan).toBe(true)
    expect(knoppenVoor(af)).toEqual([])
    expect(naTik(af, 'score-thuis-nek')).toEqual(af)
  })
})

describe('knoppenVoor', () => {
  it('toont vóór de aftrap enkel Start', () => {
    expect(knoppenVoor(beginstandVoor(4))).toEqual(['start'])
  })

  it('wisselt Pauze en Klok met de klok mee', () => {
    const lopend = beginstandVoor(5)
    expect(knoppenVoor(lopend)).toContain('pauze')
    expect(knoppenVoor(naTik(lopend, 'pauze'))).toContain('klok')
  })
})
