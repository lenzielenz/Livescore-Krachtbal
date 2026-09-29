import { describe, expect, it } from 'vitest'

import { colorsClash, distinguishAway } from '@/lib/club-colors'

describe('colorsClash', () => {
  it('botst bij zo goed als identieke kleuren (RGB-afstand)', () => {
    expect(colorsClash('#ff0000', '#fa0a0a')).toBe(true)
  })

  it('botst niet bij duidelijk verschillende kleuren', () => {
    expect(colorsClash('#ff0000', '#0000ff')).toBe(false)
  })

  it('botst bij dezelfde tint met verschillende helderheid (fel- vs donkerrood)', () => {
    expect(colorsClash('#ff2020', '#7a0000')).toBe(true)
  })

  it('botst niet bij een grijstint tegenover een levendige kleur', () => {
    expect(colorsClash('#808080', '#ff0000')).toBe(false)
  })

  it('geeft false terug bij ontbrekende of ongeldige kleuren', () => {
    expect(colorsClash(null, '#ff0000')).toBe(false)
    expect(colorsClash('nope', '#ff0000')).toBe(false)
  })
})

describe('distinguishAway', () => {
  it('laat de uitploeg ongewijzigd als er geen botsing is', () => {
    const home = { primary: '#ff0000', secondary: '#000000' }
    const away = { primary: '#0000ff', secondary: '#ffffff' }
    expect(distinguishAway(home, away)).toEqual(away)
  })

  it('schakelt de uitploeg naar haar secundaire kleur bij een botsing', () => {
    const home = { primary: '#ff0000', secondary: '#000000' }
    const away = { primary: '#fa0a0a', secondary: '#00ff00' }
    expect(distinguishAway(home, away)).toEqual({ primary: '#00ff00', secondary: '#fa0a0a' })
  })

  it('schakelt ook bij een botsing die enkel via tint (hue) gedetecteerd wordt', () => {
    const home = { primary: '#ff2020', secondary: '#000000' }
    const away = { primary: '#7a0000', secondary: '#00ff00' }
    expect(distinguishAway(home, away)).toEqual({ primary: '#00ff00', secondary: '#7a0000' })
  })

  it('behoudt de primaire kleur van de uitploeg als er geen afwijkende secundaire kleur is', () => {
    const home = { primary: '#ff0000', secondary: '#000000' }
    const away = { primary: '#fa0a0a', secondary: '#fa0a0a' }
    expect(distinguishAway(home, away)).toEqual(away)
  })

  it('schakelt ook als de secundaire kleur van de uitploeg zelf nog met thuis zou botsen', () => {
    const home = { primary: '#ff0000', secondary: '#000000' }
    const away = { primary: '#fa0a0a', secondary: '#fc0808' }
    expect(distinguishAway(home, away)).toEqual({ primary: '#fc0808', secondary: '#fa0a0a' })
  })

  it('geeft away terug als home of away ontbreekt', () => {
    const away = { primary: '#0000ff', secondary: '#ffffff' }
    expect(distinguishAway(null, away)).toEqual(away)
    expect(distinguishAway({ primary: '#ff0000', secondary: '#000000' }, null)).toBeNull()
  })
})
