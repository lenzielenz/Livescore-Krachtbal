import { centen, euro, type Lijn, lijnBedrag, ogmCijfers } from './facturatie'

// De e-factuur: een factuur van de federatie aan een club als UBL 2.1 volgens Peppol BIS Billing 3.0 (de Europese
// norm EN 16931 met de Peppol-regels). Puur: geen DB. Het XML-bestand kan een boekhoudpakket inlezen, en via een
// Peppol-toegangspunt (een "access point" waarbij de federatie zich aansluit) gaat het naar de club.
//
// Wat de regels vragen en hoe we het doen:
//   · beide partijen een Peppol-adres (EndpointID): het Belgische ondernemingsnummer, schema 0208;
//   · een kopersreferentie (BT-10): het factuurnummer;
//   · btw: de federatie is meestal een vzw zonder btw-plicht → categorie O ("niet onderworpen", zonder btw-nummers)
//     of vrijgesteld → categorie E (met het btw-nummer van de federatie). Altijd 0 % en met een vrijstellingsreden;
//   · een negatieve prijs mag niet (BR-27): een creditlijn wordt een negatief aantal met een positieve prijs;
//   · geen lege elementen (PEPPOL-EN16931-R008); bedragen met 2 decimalen, alle sommen in centen gerekend.

export type PeppolPartij = { naam: string; ondernemingsnummer: string; straat?: string | null; postcode?: string | null; gemeente?: string | null; land?: string | null }
export type PeppolFactuur = {
  nummer: string
  datum: string
  vervaldatum: string
  ogm: string
  lijnen: Lijn[]
  opmerking?: string | null
  verkoper: PeppolPartij & { iban: string; bic?: string | null; btwRegime: 'niet-onderworpen' | 'vrijgesteld'; btwNummer?: string | null; btwVermelding?: string | null }
  koper: PeppolPartij
}

/** "0412.345.678" / "BE 0412 345 678" → "0412345678", of null als het geen geldig ondernemingsnummer is (mod 97). */
export function ondernemingsnummer(t: string | null | undefined): string | null {
  const c = String(t ?? '').replace(/^BE/i, '').replace(/\D/g, '')
  const n = c.length === 9 ? `0${c}` : c
  if (!/^[01]\d{9}$/.test(n)) return null
  return 97 - (Number(n.slice(0, 8)) % 97) === Number(n.slice(8)) ? n : null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string)
const bedrag = (n: number) => euro(centen(n)).toFixed(2)
/** Een element met inhoud, of niets (lege elementen zijn verboden). */
const el = (tag: string, waarde: string | null | undefined, attr = '') => (waarde != null && String(waarde).trim() !== '' ? `<${tag}${attr}>${esc(String(waarde).trim())}</${tag}>` : '')

function partij(p: PeppolPartij, nr: string, extra = ''): string {
  return [
    '<cac:Party>',
    `<cbc:EndpointID schemeID="0208">${nr}</cbc:EndpointID>`,
    `<cac:PartyName>${el('cbc:Name', p.naam)}</cac:PartyName>`,
    '<cac:PostalAddress>',
    el('cbc:StreetName', p.straat),
    el('cbc:CityName', p.gemeente),
    el('cbc:PostalZone', p.postcode),
    `<cac:Country><cbc:IdentificationCode>${esc((p.land || 'BE').toUpperCase())}</cbc:IdentificationCode></cac:Country>`,
    '</cac:PostalAddress>',
    extra,
    `<cac:PartyLegalEntity>${el('cbc:RegistrationName', p.naam)}<cbc:CompanyID schemeID="0208">${nr}</cbc:CompanyID></cac:PartyLegalEntity>`,
    '</cac:Party>',
  ].join('')
}

export type PeppolUitkomst = { ok: true; xml: string } | { ok: false; error: string }

export function peppolUbl(f: PeppolFactuur): PeppolUitkomst {
  const vNr = ondernemingsnummer(f.verkoper.ondernemingsnummer)
  if (!vNr) return { ok: false, error: 'Het ondernemingsnummer van de federatie ontbreekt of klopt niet (instellingen → Facturatie).' }
  const kNr = ondernemingsnummer(f.koper.ondernemingsnummer)
  if (!kNr) return { ok: false, error: `Het ondernemingsnummer van ${f.koper.naam} ontbreekt of klopt niet (clubgegevens → Facturatie).` }
  const iban = f.verkoper.iban.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return { ok: false, error: 'Het IBAN van de federatie ontbreekt of klopt niet.' }
  const vrij = f.verkoper.btwRegime === 'vrijgesteld'
  const btwNr = vrij ? String(f.verkoper.btwNummer ?? '').replace(/[\s.]/g, '').toUpperCase() : ''
  if (vrij && !/^BE[01]\d{9}$/.test(btwNr)) return { ok: false, error: 'Bij "vrijgesteld van btw" hoort het btw-nummer van de federatie (BE0…).' }
  if (!f.lijnen.length) return { ok: false, error: 'Een factuur zonder lijnen.' }

  const cat = vrij ? 'E' : 'O'
  const reden = f.verkoper.btwVermelding?.trim() || (vrij ? 'Vrijgesteld van btw' : 'Niet onderworpen aan btw')
  const totaalC = f.lijnen.reduce((t, l) => t + centen(lijnBedrag(l)), 0)
  if (totaalC < 0) return { ok: false, error: 'Een factuur met een negatief totaal is een creditnota.' }
  const totaal = euro(totaalC).toFixed(2)
  const btwCategorie = `<cac:TaxCategory><cbc:ID>${cat}</cbc:ID>${cat === 'E' ? '<cbc:Percent>0</cbc:Percent>' : ''}${el('cbc:TaxExemptionReason', reden)}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>`
  const lijnCategorie = `<cac:ClassifiedTaxCategory><cbc:ID>${cat}</cbc:ID>${cat === 'E' ? '<cbc:Percent>0</cbc:Percent>' : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>`
  const betaalId = ogmCijfers(f.ogm) ?? f.ogm.replace(/\D/g, '')

  const lijnen = f.lijnen.map((l, i) => {
    // Geen negatieve prijs: een creditlijn = negatief aantal × positieve prijs.
    const neg = l.eenheidsprijs < 0
    const aantal = neg ? -l.aantal : l.aantal
    return [
      '<cac:InvoiceLine>',
      `<cbc:ID>${i + 1}</cbc:ID>`,
      `<cbc:InvoicedQuantity unitCode="C62">${aantal}</cbc:InvoicedQuantity>`,
      `<cbc:LineExtensionAmount currencyID="EUR">${bedrag(lijnBedrag(l))}</cbc:LineExtensionAmount>`,
      `<cac:Item>${el('cbc:Name', l.omschrijving.slice(0, 200))}${lijnCategorie}</cac:Item>`,
      `<cac:Price><cbc:PriceAmount currencyID="EUR">${bedrag(Math.abs(l.eenheidsprijs))}</cbc:PriceAmount></cac:Price>`,
      '</cac:InvoiceLine>',
    ].join('')
  })

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>',
    '<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>',
    el('cbc:ID', f.nummer),
    el('cbc:IssueDate', f.datum),
    el('cbc:DueDate', f.vervaldatum),
    '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>',
    el('cbc:Note', f.opmerking?.slice(0, 1000)),
    '<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>',
    el('cbc:BuyerReference', f.nummer),
    `<cac:AccountingSupplierParty>${partij(f.verkoper, vNr, vrij ? `<cac:PartyTaxScheme><cbc:CompanyID>${btwNr}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '')}</cac:AccountingSupplierParty>`,
    `<cac:AccountingCustomerParty>${partij(f.koper, kNr)}</cac:AccountingCustomerParty>`,
    '<cac:PaymentMeans>',
    '<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>',
    el('cbc:PaymentID', betaalId),
    `<cac:PayeeFinancialAccount><cbc:ID>${iban}</cbc:ID>${f.verkoper.bic ? `<cac:FinancialInstitutionBranch>${el('cbc:ID', f.verkoper.bic.replace(/\s/g, '').toUpperCase())}</cac:FinancialInstitutionBranch>` : ''}</cac:PayeeFinancialAccount>`,
    '</cac:PaymentMeans>',
    `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${totaal}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>${btwCategorie}</cac:TaxSubtotal></cac:TaxTotal>`,
    '<cac:LegalMonetaryTotal>',
    `<cbc:LineExtensionAmount currencyID="EUR">${totaal}</cbc:LineExtensionAmount>`,
    `<cbc:TaxExclusiveAmount currencyID="EUR">${totaal}</cbc:TaxExclusiveAmount>`,
    `<cbc:TaxInclusiveAmount currencyID="EUR">${totaal}</cbc:TaxInclusiveAmount>`,
    `<cbc:PayableAmount currencyID="EUR">${totaal}</cbc:PayableAmount>`,
    '</cac:LegalMonetaryTotal>',
    ...lijnen,
    '</Invoice>',
  ]
    .filter(Boolean)
    .join('\n')
  return { ok: true, xml }
}
