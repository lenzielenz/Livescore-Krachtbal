import { describe, expect, it } from 'vitest'

import { beoordeelAttest, korteNaam, opgegevenUit } from '@/lib/attest'
import type { AttestLezing } from '@/lib/medische-kaart-lezen'

const lezing = (g: boolean | null, h: boolean | null, uitlijning: 'merken' | 'qr' = 'merken'): AttestLezing => ({
  uitlijning,
  vakjes: { geschikt: { aangekruist: g, inkt: 0 }, nietHoger: { aangekruist: h, inkt: 0 } },
})

describe('beoordeelAttest: enkel automatisch goedgekeurd als alles juist staat', () => {
  it('QR van het lid, vier hoeken, geschikt aangekruist, "mag niet hoger" duidelijk → goedgekeurd', () => {
    expect(beoordeelAttest({ lid: true, viaQr: true, lezing: lezing(true, false) }).status).toBe('goedgekeurd')
    expect(beoordeelAttest({ lid: true, viaQr: true, lezing: lezing(true, true) }).status).toBe('goedgekeurd')
  })
  it('al de rest gaat naar de federatie, met een reden', () => {
    const geval = [
      { lid: false, viaQr: false, lezing: lezing(true, false) }, // blanco
      { lid: true, viaQr: false, lezing: null }, // eigen formulier van de arts
      { lid: true, viaQr: true, lezing: lezing(true, false, 'qr') }, // hoeken niet in beeld
      { lid: true, viaQr: true, lezing: lezing(false, false) }, // niet geschikt
      { lid: true, viaQr: true, lezing: lezing(null, false) }, // onduidelijk
      { lid: true, viaQr: true, lezing: lezing(true, null) }, // "mag niet hoger" onduidelijk
    ]
    for (const g of geval) {
      const b = beoordeelAttest(g)
      expect(b.status, JSON.stringify(g)).toBe('nakijken')
      expect(b.reden).toBeTruthy()
    }
  })
  it('de federatie zelf keurt meteen goed — maar een blanco attest heeft eerst een lid nodig', () => {
    expect(beoordeelAttest({ lid: true, viaQr: false, lezing: null, doorFederatie: true }).status).toBe('goedgekeurd')
    expect(beoordeelAttest({ lid: false, viaQr: false, lezing: null, doorFederatie: true }).status).toBe('nakijken')
  })
})

describe('wie zonder login oplaadt, ziet enkel "Kaat K."', () => {
  it('voornaam + eerste letter van de familienaam', () => {
    expect(korteNaam('Kaat', 'Kaat Van den Broeck')).toBe('Kaat V.')
    expect(korteNaam(null, 'Jan Peeters')).toBe('Jan P.')
    expect(korteNaam('Lien', 'Lien')).toBe('Lien')
    expect(korteNaam(null, null)).toBe('Het lid')
  })
})

describe('opgegevenUit (blanco attest)', () => {
  it('naam verplicht, de rest nagekeken', () => {
    expect(opgegevenUit({ naam: 'x' })).toBeNull()
    expect(opgegevenUit({ naam: ' Kaat Kaart ', geboortedatum: '2011-03-12', club: 'KBC', email: 'Ouder@Voorbeeld.be' })).toEqual({
      naam: 'Kaat Kaart',
      geboortedatum: '2011-03-12',
      club: 'KBC',
      email: 'ouder@voorbeeld.be',
    })
    expect(opgegevenUit({ naam: 'Kaat Kaart', geboortedatum: '12/03/2011', email: 'geen-mail' })).toMatchObject({ geboortedatum: null, email: null, club: null })
  })
})
