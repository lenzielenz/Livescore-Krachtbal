import { describe, expect, it } from 'vitest'

import { ARTIKELEN, GRATIS, leesOutfit, magKopen, maakKast, MUNTEN_PER_BAL, STANDAARD_OUTFIT } from '@/lib/virtueel-fanshop'
import { GOUDEN_BALLEN, valideerSpoor, vatSporenSamen, type Spoor } from '@/lib/virtueel-sporen'

describe('fanshop: je kast', () => {
  it('elke gevonden bal is muntjes waard; gratis kledij heb je altijd', () => {
    const k = maakKast(3, [], [])
    expect(k.munten).toBe(3 * MUNTEN_PER_BAL)
    expect(k.gekocht.sort()).toEqual([...GRATIS].sort())
    expect(k.outfit).toEqual(STANDAARD_OUTFIT)
  })

  it('kopen trekt af van je saldo; te duur of dubbel telt niet', () => {
    const k = maakKast(2, ['shirt-uit', 'shirt-uit', 'shirt-goud'], [])
    expect(k.gekocht).toContain('shirt-uit')
    expect(k.gekocht).not.toContain('shirt-goud')
    expect(k.munten).toBe(2 * MUNTEN_PER_BAL - 60)
  })

  it('je draagt enkel wat je bezit', () => {
    const k = maakKast(12, ['pet-kroon'], [{ pet: 'pet-kroon', shirt: 'shirt-goud' }])
    expect(k.outfit.pet).toBe('pet-kroon')
    expect(k.outfit.shirt).toBe('shirt-thuis')
  })

  it('magKopen legt uit waarom niet', () => {
    expect(magKopen(maakKast(0, [], []), 'shirt-goud')).toMatch(/te weinig/)
    expect(magKopen(maakKast(12, [], []), 'shirt-thuis')).toMatch(/al/)
    expect(magKopen(maakKast(12, [], []), 'bestaat-niet')).toBeTruthy()
    expect(magKopen(maakKast(12, [], []), 'shirt-goud')).toBeNull()
  })

  it('leesOutfit gooit onbekende of niet-gekochte stukken weg', () => {
    expect(leesOutfit({ pet: 'pet-kroon', shirt: 'shirt-thuis', broek: 'pet-club' }, GRATIS)).toEqual({ shirt: 'shirt-thuis' })
  })

  it('alle artikelen hebben een unieke id', () => {
    expect(new Set(ARTIKELEN.map((a) => a.id)).size).toBe(ARTIKELEN.length)
  })
})

describe('sporen: fanshop, kluis en worpen', () => {
  const spoor = (id: number, soort: Spoor['soort'], waarde: Spoor['waarde'], auteur = 7): Spoor => ({ id, soort, waarde, naam: 'An', auteur, wanneer: String(id).padStart(4, '0') })
  it('je saldo en sleutel volgen uit je eigen sporen', () => {
    const vondsten = Array.from({ length: GOUDEN_BALLEN }, (_, i) => spoor(i + 1, 'vondst', { nr: i }))
    const s = vatSporenSamen([...vondsten, spoor(50, 'aankoop', { id: 'pet-kroon' }), spoor(51, 'outfit', { outfit: { pet: 'pet-kroon' } }), spoor(52, 'kluis', {}), spoor(53, 'aankoop', { id: 'shirt-goud' }, 8)], 7)
    expect(s.mij.munten).toBe(GOUDEN_BALLEN * MUNTEN_PER_BAL - 220)
    expect(s.mij.outfit.pet).toBe('pet-kroon')
    expect(s.mij.sleutel).toBe(true)
    expect(s.mij.gekocht).not.toContain('shirt-goud')
  })

  it('zonder alle ballen geeft de kluis geen sleutel', () => {
    const s = vatSporenSamen([spoor(1, 'vondst', { nr: 0 }), spoor(2, 'kluis', {})], 7)
    expect(s.mij.sleutel).toBe(false)
  })

  it('een worp krijgt zijn afstand van de server, niet van de client', () => {
    const v = valideerSpoor('werp', { bal: '3kg', kracht: 1, hoek: 41, afstand: 999 })
    expect(v.ok).toBe(true)
    if (v.ok) expect((v.waarde as { afstand: number }).afstand).toBeLessThanOrEqual(27)
    expect(valideerSpoor('werp', { bal: '9kg', kracht: 1, hoek: 41 }).ok).toBe(false)
    expect(valideerSpoor('aankoop', { id: 'nep' }).ok).toBe(false)
  })
})
