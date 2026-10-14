import { describe, expect, it } from 'vitest'

import { MUUR_BASIS, MUUR_MAX, muurLengte, valideerStreken } from '@/lib/virtueel-graffiti'

// De graffitimuur van Virtueel krachtbal: hoe lang de muur is en wat de server aanneemt.

describe('muurLengte', () => {
  it('groeit om de 40 tags met een stuk, tot een maximum', () => {
    expect(muurLengte(0)).toBe(MUUR_BASIS)
    expect(muurLengte(39)).toBe(MUUR_BASIS)
    expect(muurLengte(40)).toBe(MUUR_BASIS + 4.5)
    expect(muurLengte(10_000)).toBe(MUUR_MAX)
  })
})

describe('valideerStreken', () => {
  const goed = { t: 'spuit', k: '#FF0000', w: 0.2, p: [1.23456, 2, 1.5, 2.1] }

  it('neemt geldige streken aan, rondt af en zet kleuren in kleine letters', () => {
    const r = valideerStreken([goed], 18)
    expect(r).toEqual({ ok: true, streken: [{ t: 'spuit', k: '#ff0000', w: 0.2, p: [1.235, 2, 1.5, 2.1] }] })
  })

  it('weigert lege, kapotte of te grote invoer', () => {
    expect(valideerStreken([], 18).ok).toBe(false)
    expect(valideerStreken('x', 18).ok).toBe(false)
    expect(valideerStreken([{ ...goed, t: 'laser' }], 18).ok).toBe(false)
    expect(valideerStreken([{ ...goed, k: 'red' }], 18).ok).toBe(false)
    expect(valideerStreken([{ ...goed, w: 5 }], 18).ok).toBe(false)
    expect(valideerStreken([{ ...goed, p: [1, 2, 3] }], 18).ok).toBe(false)
    expect(valideerStreken([{ ...goed, p: [1, Number.NaN] }], 18).ok).toBe(false)
    expect(valideerStreken([{ ...goed, p: [40, 1] }], 18).ok).toBe(false)
    expect(valideerStreken(Array.from({ length: 200 }, () => goed), 18).ok).toBe(false)
    expect(valideerStreken(Array.from({ length: 10 }, () => ({ ...goed, p: Array.from({ length: 2000 }, () => 1) })), 18).ok).toBe(false)
  })
})
