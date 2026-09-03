'use client'

import { useEffect } from 'react'

// Markeert de pagina als een SCHERM: een tv die uren aan één stuk hetzelfde toont.
//
// Waarom dat een eigen markering verdient. De site heeft onderaan een voettekst met
// privacybeleid en reglement — nuttig op een gewone pagina, maar op een kantine-tv is ze twee
// dingen tegelijk: overbodig én schadelijk. Ze staat namelijk ónder een scherm dat exact één
// schermhoogte hoog is, en duwt zo de onderste rand van het bord uit beeld. Op een tv zie je dan
// de uitslagenbalk half afgesneden, zonder dat iemand kan scrollen om te kijken wat daar stond.
//
// Vandaar één klasse op de <body> zolang zo'n scherm openstaat; de opmaak haalt daar de voettekst
// mee weg. Bewust géén CSS-truc met `:has()`: de browser van een oudere Chromecast kent dat niet,
// en dan valt precies op het toestel waarvoor dit bedoeld is de onderrand weg.
export function SchermModus() {
  useEffect(() => {
    document.body.classList.add('kb-scherm')
    return () => {
      document.body.classList.remove('kb-scherm')
    }
  }, [])
  return null
}
