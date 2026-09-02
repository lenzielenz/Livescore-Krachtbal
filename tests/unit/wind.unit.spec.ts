import { describe, it, expect } from 'vitest'

import { windOmschrijving, windPijl, windRichting, windTekst } from '@/lib/wind'

describe('windrichting', () => {
  it('leest de vier hoofdrichtingen', () => {
    expect(windRichting(0)).toBe('N')
    expect(windRichting(90)).toBe('O')
    expect(windRichting(180)).toBe('Z')
    expect(windRichting(270)).toBe('W')
  })

  it('rondt naar het dichtstbijzijnde vak van 45°', () => {
    expect(windRichting(44)).toBe('NO')
    expect(windRichting(46)).toBe('NO')
    expect(windRichting(359)).toBe('N')
  })

  it('overleeft rare graden', () => {
    expect(windRichting(-90)).toBe('W')
    expect(windRichting(450)).toBe('O')
    expect(windRichting(Number.NaN)).toBe('—')
  })

  it('laat de pijl wijzen waar de wind naartoe waait', () => {
    // Wind úit het noorden waait naar het zuiden: de pijl wijst omlaag.
    expect(windPijl(0)).toBe('↓')
    expect(windPijl(180)).toBe('↑')
    expect(windPijl(270)).toBe('→')
  })
})

describe('wat de wind betekent op het veld', () => {
  it('geeft elke snelheid een woord', () => {
    expect(windOmschrijving(2)).toBe('windstil')
    expect(windOmschrijving(15)).toBe('matig')
    expect(windOmschrijving(35)).toBe('krachtig')
    expect(windOmschrijving(60)).toBe('stormachtig')
  })

  it('zet alles in één leesbare regel', () => {
    expect(windTekst(18, 225)).toBe('18 km/u ZW ↗ · matig')
    // Zonder richting blijft de snelheid staan.
    expect(windTekst(4, null)).toBe('4 km/u · windstil')
  })
})
