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

describe("foto's uit het echte leven: scan, gsm, WhatsApp", () => {
  it('via WhatsApp doorgestuurd (1600 px, twee keer zwaar gecomprimeerd): QR en vakjes gelezen', async () => {
    const r = await scanKaart(await foto({ geschikt: true, nietHoger: false, hoek: 5, whatsapp: true }), 'image/jpeg')
    expect(r?.playerId).toBe(4242)
    expect([r?.lezing?.uitlijning, r?.lezing?.vakjes.geschikt.aangekruist, r?.lezing?.vakjes.nietHoger.aangekruist]).toEqual(['merken', true, false])
  }, 60_000)

  it('blad ligt niet plat (golft 3 mm) en de gsm hangt schuin', async () => {
    const r = await scanKaart(await foto({ geschikt: true, nietHoger: true, hoek: -3, bol: 3, schuin: 0.06 }), 'image/jpeg')
    expect(r?.playerId).toBe(4242)
    expect([r?.lezing?.vakjes.geschikt.aangekruist, r?.lezing?.vakjes.nietHoger.aangekruist]).toEqual([true, true])
  }, 60_000)

  it('zwak licht met ruis en schaduw, en dan nog via WhatsApp', async () => {
    const r = await scanKaart(await foto({ geschikt: true, nietHoger: false, hoek: 7, donker: true, schaduw: true, whatsapp: true }), 'image/jpeg')
    expect(r?.playerId).toBe(4242)
    expect([r?.lezing?.vakjes.geschikt.aangekruist, r?.lezing?.vakjes.nietHoger.aangekruist]).toEqual([true, false])
  }, 60_000)

  it('een leeg vakje blijft leeg, ook bij slecht licht en compressie (geen valse kruisjes)', async () => {
    const r = await scanKaart(await foto({ geschikt: false, nietHoger: false, hoek: -6, donker: true, whatsapp: true, bol: 2 }), 'image/jpeg')
    expect([r?.lezing?.vakjes.geschikt.aangekruist, r?.lezing?.vakjes.nietHoger.aangekruist]).not.toContain(true)
  }, 60_000)

  it('een blad dat 6 mm bol ligt en schuin gefotografeerd is: elk vakje wordt opgezocht aan zijn kader', async () => {
    const vol = await scanKaart(await foto({ geschikt: true, nietHoger: false, hoek: -3, bol: 6, schuin: 0.05 }), 'image/jpeg')
    expect([vol?.lezing?.uitlijning, vol?.lezing?.vakjes.geschikt.aangekruist, vol?.lezing?.vakjes.nietHoger.aangekruist]).toEqual(['merken', true, false])
    const leeg = await scanKaart(await foto({ geschikt: false, nietHoger: false, hoek: 2, bol: 6 }), 'image/jpeg')
    expect([leeg?.lezing?.vakjes.geschikt.aangekruist, leeg?.lezing?.vakjes.nietHoger.aangekruist]).toEqual([false, false])
  }, 60_000)

  it('1 cm bol en meer: juist of twijfel, nooit een verkeerde lezing', async () => {
    for (const [g, h, hoek] of [[false, false, 2], [true, false, -3], [false, true, 0]] as const) {
      const r = await scanKaart(await foto({ geschikt: g, nietHoger: h, hoek, bol: 10, whatsapp: true }), 'image/jpeg')
      const a = [r?.lezing?.vakjes.geschikt.aangekruist ?? null, r?.lezing?.vakjes.nietHoger.aangekruist ?? null]
      expect(a[0] === null || a[0] === g, `geschikt ${g}, hoek ${hoek}`).toBe(true)
      expect(a[1] === null || a[1] === h, `niet hoger ${h}, hoek ${hoek}`).toBe(true)
    }
  }, 120_000)

  it('te wazig én te donker: geen gok maar twijfel (dan kijkt de federatie het na)', async () => {
    const r = await scanKaart(await foto({ geschikt: true, nietHoger: false, hoek: -3, blur: 4, donker: true, whatsapp: true }), 'image/jpeg')
    expect(r?.lezing?.vakjes.geschikt.aangekruist).not.toBe(false)
    expect(r?.lezing?.vakjes.nietHoger.aangekruist).not.toBe(true)
  }, 60_000)

  it('het blanco attest: herkend als blanco, zonder lid, en de vakjes worden gelezen', async () => {
    const r = await scanKaart(await foto({ geschikt: true, nietHoger: false, hoek: 4, blanco: true }), 'image/jpeg')
    expect([r?.playerId, r?.blanco, r?.lezing?.uitlijning, r?.lezing?.vakjes.geschikt.aangekruist]).toEqual([null, true, 'merken', true])
  }, 60_000)
})

