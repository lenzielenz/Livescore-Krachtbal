import { describe, expect, it } from 'vitest'
import {
  leesWeggeklikt,
  RUST_MS,
  welkeUitnodiging,
  type InstallatieStand,
} from '@/lib/installeren'

const NU = Date.UTC(2026, 8, 2, 12, 0, 0)

function stand(over: Partial<InstallatieStand> = {}): InstallatieStand {
  return { standalone: false, ios: false, aangeboden: false, weggeklikt: null, nu: NU, ...over }
}

describe('welkeUitnodiging', () => {
  it('toont niets in een app die al geïnstalleerd is', () => {
    // Zelfs als de browser ons een uitnodiging aanbiedt: wie ín de app zit, hoeft ze niet nog
    // eens te installeren.
    expect(welkeUitnodiging(stand({ standalone: true, aangeboden: true }))).toBe('geen')
    expect(welkeUitnodiging(stand({ standalone: true, ios: true }))).toBe('geen')
  })

  it('toont de knop zodra de browser een installatie aanbiedt', () => {
    expect(welkeUitnodiging(stand({ aangeboden: true }))).toBe('knop')
  })

  it('legt op iOS de twee stappen uit, want daar bestaat die knop niet', () => {
    expect(welkeUitnodiging(stand({ ios: true }))).toBe('ios-uitleg')
  })

  it('toont niets op een desktopbrowser die niets aanbiedt', () => {
    expect(welkeUitnodiging(stand())).toBe('geen')
  })

  it('zwijgt een tijd na het wegklikken, ook op iOS', () => {
    const netWeg = stand({ aangeboden: true, weggeklikt: NU - 1000 })
    expect(welkeUitnodiging(netWeg)).toBe('geen')
    expect(welkeUitnodiging({ ...netWeg, aangeboden: false, ios: true })).toBe('geen')
  })

  it('vraagt het opnieuw als de rustperiode voorbij is', () => {
    const langGeleden = stand({ aangeboden: true, weggeklikt: NU - RUST_MS - 1 })
    expect(welkeUitnodiging(langGeleden)).toBe('knop')
  })

  it('behandelt de grens van de rustperiode als nog steeds weg', () => {
    expect(welkeUitnodiging(stand({ aangeboden: true, weggeklikt: NU - RUST_MS }))).toBe('knop')
    expect(welkeUitnodiging(stand({ aangeboden: true, weggeklikt: NU - RUST_MS + 1 }))).toBe('geen')
  })

  it('laat een klok die achteruit liep de uitnodiging niet voorgoed blokkeren', () => {
    // Een toestel waarvan de tijd verkeerd stond kan een "wegklikmoment" in de toekomst
    // opleveren. Dat mag hooguit tijdelijk zwijgen opleveren, geen permanente stilte — het
    // verschil is negatief, dus kleiner dan RUST_MS, en dat valt vanzelf weg zodra de klok
    // klopt.
    expect(welkeUitnodiging(stand({ aangeboden: true, weggeklikt: NU + 5000 }))).toBe('geen')
  })
})

describe('leesWeggeklikt', () => {
  it('leest een bewaard tijdstip', () => {
    expect(leesWeggeklikt(String(NU))).toBe(NU)
  })

  it('telt niets, rommel en onzinnige waarden als "nooit weggeklikt"', () => {
    expect(leesWeggeklikt(null)).toBeNull()
    expect(leesWeggeklikt('')).toBeNull()
    expect(leesWeggeklikt('gisteren')).toBeNull()
    expect(leesWeggeklikt('0')).toBeNull()
    expect(leesWeggeklikt('-5')).toBeNull()
    expect(leesWeggeklikt('Infinity')).toBeNull()
  })
})
