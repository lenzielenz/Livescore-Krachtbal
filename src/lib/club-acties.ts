// Welke knoppen hangen er onder een wedstrijd op "Mijn club"?
//
// De aantekenmodus staat op de settings-global en geldt voor het hele platform (zie score-mode.ts):
//
//  - 'federatie' — de volledige flow. Eerst de opstelling, dan geeft de scheidsrechter het blad
//    vrij, pas dán mag de thuisploeg aantekenen.
//  - 'supporters' — vrije livescore. Er ís geen opstelling en geen scheidsrechtersakkoord, dus
//    "Opstelling" en "⏳ Wacht op scheidsrechter" hebben niets om naar te verwijzen: die knoppen
//    stuurden je naar een scherm dat in deze modus nergens toe leidt, en het wachtbericht
//    blokkeerde het aantekenen op een goedkeuring die nooit komt. Enkel aantekenen blijft over.
//
// Als pure functie zodat de regel op één plek staat en getest is, in plaats van als drie
// geneste ternaries in de JSX van de clubpagina.

import { sheetOpenForScoring } from './matchsheet-workflow'

export type ClubActie = 'opstelling' | 'aantekenen' | 'wacht-op-scheidsrechter' | 'bekijk'

export function clubWedstrijdActies({
  supportersMode,
  side,
  status,
  sheetStatus,
}: {
  supportersMode: boolean
  side: 'home' | 'away'
  status: string
  sheetStatus: string | null
}): ClubActie[] {
  if (supportersMode) return ['aantekenen', 'bekijk']

  // Aantekenen kan zodra de scheidsrechter het blad opende (wedstrijdklaar/bezig). Een wedstrijd
  // die al LOOPT is altijd open: de aantekentafel moet er terug in kunnen (na een refresh of
  // vanaf een ander toestel) — thuis én uit.
  const open = status === 'live' || sheetOpenForScoring(sheetStatus)
  if (side === 'home') return ['opstelling', open ? 'aantekenen' : 'wacht-op-scheidsrechter']
  return open ? ['opstelling', 'aantekenen', 'bekijk'] : ['opstelling', 'bekijk']
}
