import { describe, expect, it } from 'vitest'

import { avatarColor, initialsFor } from '@/lib/avatar'

describe('initialsFor', () => {
  it('neemt de eerste letter van voor- en achternaam', () => {
    expect(initialsFor('Sien Metfoto')).toBe('SM')
  })
  it('gebruikt één letter bij een naam zonder spatie', () => {
    expect(initialsFor('Supporter')).toBe('S')
  })
  it('negeert overtollige spaties en beperkt tot twee letters', () => {
    expect(initialsFor('  Jan  Piet  De Geest ')).toBe('JP')
  })
  it('valt terug op een vraagteken bij een lege naam', () => {
    expect(initialsFor('   ')).toBe('?')
  })
})

describe('avatarColor', () => {
  it('geeft dezelfde naam altijd dezelfde kleur', () => {
    expect(avatarColor('Karel Zonderfoto')).toBe(avatarColor('Karel Zonderfoto'))
  })
  it('spreidt verschillende namen over verschillende kleuren', () => {
    expect(avatarColor('Sien Metfoto')).not.toBe(avatarColor('Karel Zonderfoto'))
  })
  it('geeft een geldige hsl-kleur terug', () => {
    expect(avatarColor('Test')).toMatch(/^hsl\(\d+, 58%, 40%\)$/)
  })
})
