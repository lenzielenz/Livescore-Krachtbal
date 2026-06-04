import { describe, it, expect } from 'vitest'

import { KRACHTBAL_QUOTES, randomQuote } from '@/lib/krachtbal-quotes'

describe('krachtbal-quotes', () => {
  it('heeft een gevarieerde, niet-lege lijst zonder dubbels', () => {
    expect(KRACHTBAL_QUOTES.length).toBeGreaterThan(10)
    expect(KRACHTBAL_QUOTES.every((q) => q.trim().length > 0)).toBe(true)
    expect(new Set(KRACHTBAL_QUOTES).size).toBe(KRACHTBAL_QUOTES.length)
  })

  it('randomQuote geeft altijd een quote uit de lijst', () => {
    for (let i = 0; i < 100; i++) {
      expect(KRACHTBAL_QUOTES).toContain(randomQuote())
    }
  })
})
