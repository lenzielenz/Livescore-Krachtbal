import { describe, expect, it } from 'vitest'

import {
  bankSleutel,
  bedragUitTekst,
  betaalstand,
  datumUitTekst,
  factuurNummer,
  factuurTotaal,
  leesBankCsv,
  ogmCijfers,
  ogmOpmaken,
  ogmsInTekst,
  ogmVoor,
} from '@/lib/facturatie'
import { epcQrTekst } from '@/lib/submit/pdf-factuur'

describe('gestructureerde mededeling (OGM)', () => {
  it('modulo 97, rest 0 wordt 97', () => {
    // 909090909 = 97 × 9372071 + 22 → controle 22
    expect(ogmOpmaken('0909090909')).toBe('+++090/9090/90922+++')
    expect(ogmOpmaken('0000000097')).toBe('+++000/0000/09797+++')
  })
  it('per factuur een eigen, geldige mededeling', () => {
    const a = ogmVoor(2026, 7)
    const b = ogmVoor(2026, 8)
    expect(a).not.toBe(b)
    expect(ogmCijfers(a)).toBeTruthy()
    expect(ogmCijfers('+++090/9090/90923+++')).toBeNull()
    expect(ogmCijfers('+++090/9090/90922+++')).toBe('090909090922')
  })
  it('vindt ze in vrije banktekst, in elke schrijfwijze', () => {
    const ogm = ogmVoor(2026, 12)
    const c = ogmCijfers(ogm)!
    expect(ogmsInTekst(`Betaling lidgeld ${ogm} KBC Sint-Michiels`)).toEqual([c])
    expect(ogmsInTekst(`***${c.slice(0, 3)}/${c.slice(3, 7)}/${c.slice(7)}***`)).toEqual([c])
    expect(ogmsInTekst(`mededeling ${c}`)).toEqual([c])
    expect(ogmsInTekst('rekening BE68 5390 0754 7034 en 123456789012')).toEqual([])
  })
  it('factuurnummer: jaar en doorlopend volgnummer', () => {
    expect(factuurNummer(2026, 7)).toBe('2026-0007')
  })
})

describe('bedragen in centen', () => {
  it('geen afrondingsfouten bij optellen', () => {
    expect(factuurTotaal([{ aantal: 3, eenheidsprijs: 0.1 }, { aantal: 1, eenheidsprijs: 0.2 }])).toBe(0.5)
    expect(factuurTotaal([{ aantal: 32, eenheidsprijs: 24.95 }])).toBe(798.4)
  })
})

describe('betaalstand: altijd berekend uit de betalingen', () => {
  const f = { status: 'verstuurd' as const, totaal: 100, vervaldatum: '2026-12-01' }
  const nov = new Date('2026-11-15T10:00:00Z')
  it('open, deels, betaald, vervallen', () => {
    expect(betaalstand(f, [], nov)).toMatchObject({ stand: 'open', open: 100 })
    expect(betaalstand(f, [{ bedrag: 40 }], nov)).toMatchObject({ stand: 'deels', betaald: 40, open: 60 })
    expect(betaalstand(f, [{ bedrag: 40 }, { bedrag: 60 }], nov)).toMatchObject({ stand: 'betaald', open: 0 })
    expect(betaalstand(f, [{ bedrag: 120 }], nov)).toMatchObject({ stand: 'betaald', open: 0 })
    expect(betaalstand(f, [{ bedrag: 40 }], new Date('2026-12-03T10:00:00Z')).stand).toBe('vervallen')
    // De vervaldag zelf is nog niet vervallen.
    expect(betaalstand(f, [], new Date('2026-12-01T20:00:00Z')).stand).toBe('open')
  })
  it('concept en geannuleerd blijven wat ze zijn', () => {
    expect(betaalstand({ ...f, status: 'concept' }, [], nov).stand).toBe('concept')
    expect(betaalstand({ ...f, status: 'geannuleerd' }, [{ bedrag: 100 }], nov).stand).toBe('geannuleerd')
  })
})

describe('bankafschrift (CSV)', () => {
  const ogm = ogmVoor(2026, 3)
  it('KBC-achtig: puntkomma, Belgische bedragen, uitgaande regels genegeerd', () => {
    const csv = [
      'Rekeningnummer;Rubrieknaam;Naam;Munt;Afschriftnummer;Datum;Omschrijving;Valuta;Bedrag;Saldo;credit;debet;rekeningnummer tegenpartij;BIC tegenpartij;Naam tegenpartij;Adres tegenpartij;gestructureerde mededeling;Vrije mededeling',
      `BE00;;KVKBF;EUR;2026023;13/11/2026;OVERSCHRIJVING;13/11/2026;1.250,00;;1.250,00;;BE11;GEBABEBB;KBC Sint-Michiels;;${ogm.replace(/\D/g, '')};`,
      'BE00;;KVKBF;EUR;2026023;13/11/2026;KOSTEN;13/11/2026;-3,50;;;3,50;;;Bank;;;',
    ].join('\n')
    const r = leesBankCsv(csv)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ datum: '2026-11-13', bedrag: 1250, tegenpartij: 'KBC Sint-Michiels', ogms: [ogm.replace(/\D/g, '')] })
  })
  it('komma als scheiding, aanhalingstekens, ISO-datum', () => {
    const csv = `Date,Amount,Description,Counterparty,Reference\n2026-11-12,"25.50","Boete ${ogm}",Club X,TX-991\n`
    expect(leesBankCsv(csv)[0]).toMatchObject({ datum: '2026-11-12', bedrag: 25.5, referentie: 'TX-991' })
  })
  it('zonder datum- of bedragkolom: duidelijke fout', () => {
    expect(() => leesBankCsv('a;b\n1;2')).toThrow(/datum/)
  })
  it('helpers', () => {
    expect([bedragUitTekst('1.234,56'), bedragUitTekst('1,234.56'), bedragUitTekst('€ 12,5'), bedragUitTekst('abc')]).toEqual([1234.56, 1234.56, 12.5, null])
    expect([datumUitTekst('3/1/2026'), datumUitTekst('2026-01-03T00:00'), datumUitTekst('x')]).toEqual(['2026-01-03', '2026-01-03', null])
    expect(bankSleutel({ datum: '2026-11-12', bedrag: 25.5, mededeling: ' a  b ', referentie: '' })).toBe('bank:2026-11-12:2550:a b')
    expect(bankSleutel({ datum: '2026-11-12', bedrag: 25.5, mededeling: '', referentie: 'TX-1' })).toBe('bank:ref:TX-1')
  })
})

describe('betaal-QR (EPC/SEPA) voor de bank-app', () => {
  it('rekening, bedrag en mededeling volgens de norm; geen QR zonder geldig IBAN of bedrag', () => {
    const t = epcQrTekst({ naam: 'KVKBF vzw', iban: 'BE68 5390 0754 7034', bic: 'gkccbebb', bedrag: 862.18, ogm: '+++202/6000/00701+++' })!
    expect(t.split(String.fromCharCode(10))).toEqual(['BCD', '002', '1', 'SCT', 'GKCCBEBB', 'KVKBF vzw', 'BE68539007547034', 'EUR862.18', '', '', '+++202/6000/00701+++'])
    expect(epcQrTekst({ naam: 'x', iban: '', bic: '', bedrag: 10, ogm: '' })).toBeNull()
    expect(epcQrTekst({ naam: 'x', iban: 'BE68539007547034', bic: '', bedrag: 0, ogm: '' })).toBeNull()
  })
})
