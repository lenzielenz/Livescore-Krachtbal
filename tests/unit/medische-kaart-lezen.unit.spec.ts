// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { afbeelden, homografie } from '@/lib/medische-kaart-lezen'
import { scanKaart } from '@/lib/medische-kaart-scan'

import { attestFoto as foto } from '../fixtures/attest-foto'

process.env.PAYLOAD_SECRET ||= 'test-geheim-medische-kaart'

describe('homografie', () => {
  it('beeldt de vier punten exact af, en ook een punt ertussen', () => {
    const van = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }]
    const naar = [{ x: 10, y: 20 }, { x: 210, y: 35 }, { x: 5, y: 230 }, { x: 220, y: 250 }]
    const H = homografie(van, naar)!
    for (let i = 0; i < 4; i++) {
      const p = afbeelden(H, van[i]!)
      expect(p.x).toBeCloseTo(naar[i]!.x, 6)
      expect(p.y).toBeCloseTo(naar[i]!.y, 6)
    }
    expect(homografie(van, [naar[0]!, naar[0]!, naar[0]!, naar[0]!])).toBeNull()
  })
})

describe('het attest lezen uit een gsm-foto', () => {
  it('kruisje bij "geschikt", niet bij "mag niet hoger" — scheef en met schaduw', async () => {
    const r = await scanKaart(await foto({ geschikt: true, nietHoger: false, hoek: 6, schaduw: true }), 'image/jpeg')
    expect(r?.playerId).toBe(4242)
    expect(r?.lezing?.uitlijning).toBe('merken')
    expect(r?.lezing?.vakjes.geschikt.aangekruist).toBe(true)
    expect(r?.lezing?.vakjes.nietHoger.aangekruist).toBe(false)
  }, 60_000)

  it('twee kruisjes, andere kant scheef en wazig', async () => {
    const r = await scanKaart(await foto({ geschikt: true, nietHoger: true, hoek: -9, blur: 1.4 }), 'image/jpeg')
    expect(r?.lezing?.uitlijning).toBe('merken')
    expect([r?.lezing?.vakjes.geschikt.aangekruist, r?.lezing?.vakjes.nietHoger.aangekruist]).toEqual([true, true])
  }, 60_000)

  it('elke lengte van QR-link (kort en lang dossiernummer): uitgelijnd op de hoekmerken', async () => {
    for (const playerId of [1, 7, 99, 123456]) {
      const r = await scanKaart(await foto({ playerId, geschikt: true, nietHoger: false, hoek: 4 }), 'image/jpeg')
      expect([r?.playerId, r?.lezing?.uitlijning, r?.lezing?.vakjes.geschikt.aangekruist, r?.lezing?.vakjes.nietHoger.aangekruist], `lid ${playerId}`).toEqual([playerId, 'merken', true, false])
    }
  }, 120_000)

  it('geen kruisjes: allebei leeg gelezen (geen valse inkt van de rand van het vakje)', async () => {
    const r = await scanKaart(await foto({ geschikt: false, nietHoger: false, hoek: 2 }), 'image/jpeg')
    expect([r?.lezing?.vakjes.geschikt.aangekruist, r?.lezing?.vakjes.nietHoger.aangekruist]).toEqual([false, false])
    expect(r!.lezing!.vakjes.geschikt.inkt).toBeLessThan(0.03)
  }, 60_000)
})
