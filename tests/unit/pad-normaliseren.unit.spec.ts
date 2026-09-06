import { describe, expect, it } from 'vitest'

import { normaliseerPad } from '@/lib/pad-normaliseren'

// Deze module bestaat omdat een blokkade op de letterlijke `pathname` te omzeilen bleek: Next
// decodeert de padsegmenten pas bij het routeren, dus /api/users/forgot%2Dpassword kwam gewoon bij
// /api/users/forgot-password uit terwijl de afsluitlijst er niets in herkende. Dat is live
// gereproduceerd (200 + een verse reset-token in de database). Deze tests houden dat dicht.

describe('normaliseerPad', () => {
  it('laat een gewoon pad met rust', () => {
    expect(normaliseerPad('/api/users/forgot-password')).toBe('/api/users/forgot-password')
    expect(normaliseerPad('/live')).toBe('/live')
    expect(normaliseerPad('/')).toBe('/')
  })

  it('decodeert een percent-gecodeerd koppelteken', () => {
    // Precies het lek: %2D is een '-'.
    expect(normaliseerPad('/api/users/forgot%2Dpassword')).toBe('/api/users/forgot-password')
    expect(normaliseerPad('/api/users/reset%2Dpassword')).toBe('/api/users/reset-password')
  })

  it('decodeert ook een dubbel gecodeerd pad', () => {
    // %252D → %2D → '-'
    expect(normaliseerPad('/api/users/forgot%252Dpassword')).toBe('/api/users/forgot-password')
  })

  it('decodeert een volledig gecodeerd segment', () => {
    expect(normaliseerPad('/api/users/%66orgot-password')).toBe('/api/users/forgot-password')
  })

  it('trekt hoofdletters, dubbele schuine strepen en een sluitende streep glad', () => {
    expect(normaliseerPad('/API/Users/Forgot-Password')).toBe('/api/users/forgot-password')
    expect(normaliseerPad('//api//users//forgot-password')).toBe('/api/users/forgot-password')
    expect(normaliseerPad('/api/users/forgot-password/')).toBe('/api/users/forgot-password')
  })

  it('houdt een kapotte codering ongemoeid in plaats van te struikelen', () => {
    // decodeURIComponent gooit hierop; we mogen dan niet crashen in de middleware.
    expect(() => normaliseerPad('/api/%E0%A4%A')).not.toThrow()
    expect(normaliseerPad('/api/%E0%A4%A')).toBe('/api/%e0%a4%a')
  })

  it('verzint geen segmenten bij', () => {
    // Een pad dat er alleen maar op lijkt, blijft een ander pad.
    expect(normaliseerPad('/api/users/forgot-password-extra')).toBe('/api/users/forgot-password-extra')
    expect(normaliseerPad('/api/users/x/forgot-password')).toBe('/api/users/x/forgot-password')
  })
})
