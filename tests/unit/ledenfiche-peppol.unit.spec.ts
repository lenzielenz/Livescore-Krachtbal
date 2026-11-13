import { describe, expect, it } from 'vitest'

import { adresDelen } from '@/lib/facturatie-server'
import { ogmVoor } from '@/lib/facturatie'
import { ficheUit, geldigeTelefoon } from '@/lib/ledenfiche'
import { ondernemingsnummer, peppolUbl, type PeppolFactuur } from '@/lib/peppol'

describe('ledenfiche: wat binnenkomt, nakijken', () => {
  it('schone waarden, enkel de opgegeven velden', () => {
    const r = ficheUit({ straat: '  Kerkstraat 12 ', postcode: '8200', gemeente: 'Brugge', land: 'be', telefoon: '0470 12 34 56', toestemmingFoto: true })
    expect(r).toEqual({ ok: true, fiche: { straat: 'Kerkstraat 12', postcode: '8200', gemeente: 'Brugge', land: 'BE', telefoon: '0470 12 34 56', toestemmingFoto: true } })
  })
  it('weigert wat niet klopt, met uitleg', () => {
    expect(ficheUit({ postcode: '82000' })).toMatchObject({ ok: false, error: expect.stringContaining('postcode') })
    expect(ficheUit({ postcode: '1012 AB', land: 'NL' }).ok).toBe(true)
    expect(ficheUit({ telefoon: '12' })).toMatchObject({ ok: false })
    expect(ficheUit({ land: 'België' })).toMatchObject({ ok: false })
    expect([geldigeTelefoon('+32 470 12 34 56'), geldigeTelefoon('050/12.34.56'), geldigeTelefoon('abc')]).toEqual([true, true, false])
  })
})

describe('ondernemingsnummer (modulo 97)', () => {
  it('alle schrijfwijzen; een fout controlegetal wordt geweigerd', () => {
    expect(ondernemingsnummer('0412.345.614')).toBe('0412345614')
    expect(ondernemingsnummer('BE 0412 345 614')).toBe('0412345614')
    expect(ondernemingsnummer('412345614')).toBe('0412345614')
    expect(ondernemingsnummer('0412.345.615')).toBeNull()
    expect(ondernemingsnummer('')).toBeNull()
  })
})

describe('e-factuur (UBL, Peppol BIS Billing 3.0)', () => {
  const basis: PeppolFactuur = {
    nummer: '2026-0007',
    datum: '2026-11-13',
    vervaldatum: '2026-12-13',
    ogm: ogmVoor(2026, 7),
    lijnen: [
      { soort: 'aansluiting', omschrijving: 'Aansluiting spelers 2026-2027', aantal: 32, eenheidsprijs: 24.5 },
      { soort: 'ander', omschrijving: 'Korting <trouwe> club & co', aantal: 1, eenheidsprijs: -10 },
    ],
    verkoper: { naam: 'KVKBF vzw', ondernemingsnummer: '0400.000.086', straat: 'Voorbeeldstraat 1', postcode: '9000', gemeente: 'Gent', iban: 'BE68 5390 0754 7034', bic: 'GKCCBEBB', btwRegime: 'niet-onderworpen' },
    koper: { naam: 'KBC Sint-Michiels', ondernemingsnummer: '0412.345.614', gemeente: 'Brugge' },
  }

  it('niet onderworpen (categorie O): geen btw-nummers, geen percentage, sommen kloppen', () => {
    const r = peppolUbl(basis)
    expect(r.ok).toBe(true)
    const x = (r as { xml: string }).xml
    expect(x).toContain('<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>')
    expect(x).toContain('<cbc:EndpointID schemeID="0208">0400000086</cbc:EndpointID>')
    expect(x).toContain('<cbc:EndpointID schemeID="0208">0412345614</cbc:EndpointID>')
    expect(x).toContain('<cbc:BuyerReference>2026-0007</cbc:BuyerReference>')
    expect(x).toContain('<cbc:ID>O</cbc:ID>')
    expect(x).not.toContain('<cbc:Percent>')
    expect(x).not.toContain('PartyTaxScheme')
    // 32 × 24,50 − 10 = 774,00
    expect(x).toContain('<cbc:PayableAmount currencyID="EUR">774.00</cbc:PayableAmount>')
    expect(x).toContain('<cbc:LineExtensionAmount currencyID="EUR">774.00</cbc:LineExtensionAmount>')
    // De creditlijn: negatief aantal, positieve prijs (BR-27).
    expect(x).toContain('<cbc:InvoicedQuantity unitCode="C62">-1</cbc:InvoicedQuantity>')
    expect(x).toContain('<cbc:PriceAmount currencyID="EUR">10.00</cbc:PriceAmount>')
    expect(x).not.toMatch(/<cbc:PriceAmount currencyID="EUR">-/)
    // Tekens ontsnapt, geen lege elementen.
    expect(x).toContain('Korting &lt;trouwe&gt; club &amp; co')
    expect(x).not.toMatch(/<(cbc:[A-Za-z]+)[^>]*><\/\1>/)
    expect(x).toContain(`<cbc:PaymentID>${basis.ogm.replace(/\D/g, '')}</cbc:PaymentID>`)
  })

  it('vrijgesteld (categorie E): met btw-nummer en 0 %', () => {
    const r = peppolUbl({ ...basis, verkoper: { ...basis.verkoper, btwRegime: 'vrijgesteld', btwNummer: 'BE0400.000.086', btwVermelding: 'Vrijgesteld van btw, art. 44 §2 WBTW' } })
    const x = (r as { xml: string }).xml
    expect(x).toContain('<cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent>')
    expect(x).toContain('<cac:PartyTaxScheme><cbc:CompanyID>BE0400000086</cbc:CompanyID>')
    expect(x).toContain('<cbc:TaxExemptionReason>Vrijgesteld van btw, art. 44 §2 WBTW</cbc:TaxExemptionReason>')
  })

  it('zonder geldige gegevens geen e-factuur, met een duidelijke reden', () => {
    expect(peppolUbl({ ...basis, koper: { ...basis.koper, ondernemingsnummer: '' } })).toMatchObject({ ok: false, error: expect.stringContaining('KBC Sint-Michiels') })
    expect(peppolUbl({ ...basis, verkoper: { ...basis.verkoper, iban: 'xx' } })).toMatchObject({ ok: false, error: expect.stringContaining('IBAN') })
    expect(peppolUbl({ ...basis, verkoper: { ...basis.verkoper, btwRegime: 'vrijgesteld' } })).toMatchObject({ ok: false, error: expect.stringContaining('btw-nummer') })
  })

  it('een vrij adres opsplitsen', () => {
    expect(adresDelen('Voorbeeldstraat 1\n9000 Gent')).toEqual({ straat: 'Voorbeeldstraat 1', postcode: '9000', gemeente: 'Gent' })
    expect(adresDelen('')).toEqual({ straat: null, postcode: null, gemeente: null })
  })
})
