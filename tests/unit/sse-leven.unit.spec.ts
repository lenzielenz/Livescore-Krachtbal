import { describe, it, expect } from 'vitest'

import { HARTSLAG_MS, moetHerverbindenNaWake, verbindingDood } from '@/lib/sse-leven'

// Blijft de livestream leven terwijl de telefoon in de zak zit?
//
// Aanleiding: "de gsm gaat in slaapstand, alles moet verder kunnen". Zo'n telefoon verbreekt zijn
// verbindingen, maar vaak zónder foutmelding: de socket blijft "open" terwijl er niets meer
// doorkomt. Aan een aantekentafel is dat het gevaarlijkste wat er is — het scherm toont een
// stand die niet meer klopt en niemand ziet dat er iets mis is.
//
// Daarom stuurt de server een hartslag die JavaScript kán zien, en meet de client hoe lang het
// stil is. Deze twee beslissingen zijn het hart daarvan, dus staan ze los en getest.

describe('verbindingDood', () => {
  const nu = 1_000_000

  it('laat een verbinding met rust die net nog iets stuurde', () => {
    expect(verbindingDood(nu - 1000, nu)).toBe(false)
  })

  it('vergeeft één gemiste hartslag', () => {
    // Eén gemiste hartslag is een hik op 4G. Wie daar meteen op herverbindt, stuurt bij honderd
    // schermen op een tornooi honderd nieuwe verzoeken voor niets.
    expect(verbindingDood(nu - HARTSLAG_MS - 500, nu)).toBe(false)
  })

  it('verklaart de verbinding dood na drie gemiste hartslagen', () => {
    expect(verbindingDood(nu - HARTSLAG_MS * 3 - 1, nu)).toBe(true)
  })

  it('doet niets zolang er nog nooit iets binnenkwam', () => {
    // Vlak na het openen is er nog geen enkel bericht; dat is geen dode verbinding.
    expect(verbindingDood(0, nu)).toBe(false)
    expect(verbindingDood(Number.NaN, nu)).toBe(false)
  })
})

describe('moetHerverbindenNaWake', () => {
  const nu = 1_000_000

  it('verbindt opnieuw na een scherm dat even weg was', () => {
    // Een halve minuut in de zak kan een halve wedstrijd schelen. Opnieuw verbinden kost één
    // verzoek en levert meteen de huidige stand op.
    expect(moetHerverbindenNaWake(nu - 30_000, nu)).toBe(true)
  })

  it('laat een scherm met rust dat net nog iets hoorde', () => {
    // Van tabblad wisselen en meteen terugkomen is geen slaapstand.
    expect(moetHerverbindenNaWake(nu - 2000, nu)).toBe(false)
  })

  it('verbindt opnieuw wanneer er nog niets binnenkwam', () => {
    expect(moetHerverbindenNaWake(0, nu)).toBe(true)
  })
})
