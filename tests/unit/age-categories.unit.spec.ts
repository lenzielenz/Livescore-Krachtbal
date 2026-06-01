import { describe, it, expect } from 'vitest'

import {
  categorieVoorGeboortedatum,
  eigenCategorie,
  magSpelen,
  peiljaar,
} from '@/lib/age-categories'

describe('peiljaar', () => {
  it('P = startjaar + 1 (seizoen 2025–2026 → 2026)', () => {
    expect(peiljaar(2025)).toBe(2026)
  })
})

describe('eigenCategorie', () => {
  // Peiljaar 2026: leeftijdOpPeildatum = 2026 − geboortejaar.
  it('grenzen van de tabel (peiljaar 2026)', () => {
    expect(eigenCategorie(2021, 2026)).toBe('U6') // 5
    expect(eigenCategorie(2020, 2026)).toBe('U8') // 6
    expect(eigenCategorie(2019, 2026)).toBe('U8') // 7
    expect(eigenCategorie(2018, 2026)).toBe('U10') // 8
    expect(eigenCategorie(2016, 2026)).toBe('U12') // 10
    expect(eigenCategorie(2014, 2026)).toBe('U14') // 12
    expect(eigenCategorie(2012, 2026)).toBe('U16') // 14
    expect(eigenCategorie(2010, 2026)).toBe('U18') // 16
    expect(eigenCategorie(2008, 2026)).toBe('U20') // 18
    expect(eigenCategorie(2006, 2026)).toBe('senioren') // 20
    expect(eigenCategorie(1990, 2026)).toBe('senioren')
  })
})

describe('categorieVoorGeboortedatum', () => {
  it('leidt categorie af uit ISO-datum + seizoen-startjaar', () => {
    expect(categorieVoorGeboortedatum('2012-05-03', 2025)).toBe('U16')
  })
  it('null bij ontbrekende of ongeldige datum', () => {
    expect(categorieVoorGeboortedatum(null, 2025)).toBeNull()
    expect(categorieVoorGeboortedatum('niet-een-datum', 2025)).toBeNull()
  })
})

describe('magSpelen', () => {
  it('eigen categorie → OK', () => {
    expect(magSpelen('U14', 'U14', false)).toBe('OK')
  })
  it('één hoger → OK zonder verbod', () => {
    expect(magSpelen('U14', 'U16', false)).toBe('OK')
  })
  it('één hoger met doktersverbod → WARN_VERBOD', () => {
    expect(magSpelen('U14', 'U16', true)).toBe('WARN_VERBOD')
  })
  it('twee of meer hoger → BLOCK_TE_HOOG', () => {
    expect(magSpelen('U14', 'U18', false)).toBe('BLOCK_TE_HOOG')
    expect(magSpelen('U12', 'senioren', false)).toBe('BLOCK_TE_HOOG')
  })
  it('lager dan eigen → BLOCK (nooit, ook niet met verbod-vlag)', () => {
    expect(magSpelen('U16', 'U14', false)).toBe('BLOCK')
    expect(magSpelen('senioren', 'U20', true)).toBe('BLOCK')
  })
})
