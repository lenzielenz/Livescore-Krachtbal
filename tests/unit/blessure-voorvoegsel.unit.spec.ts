import { describe, it, expect } from 'vitest'

import { zonderVoorvoegsel } from '@/lib/blessure'

describe('zonderVoorvoegsel', () => {
  it('knipt na het moment, ook als de klok een dubbele punt heeft', () => {
    const moment = '1e helft 23:05, stand 4–4'
    expect(zonderVoorvoegsel(`Wedstrijd (Baasrode Heren), ${moment}: Verzwikte enkel`, moment)).toBe('Verzwikte enkel')
  })
  it('zonder moment: het oude voorvoegsel, of de tekst zoals ze is', () => {
    expect(zonderVoorvoegsel('Wedstrijd (X), voor de aftrap: Val bij opwarming', null)).toBe('Val bij opwarming')
    expect(zonderVoorvoegsel('Gevallen op training', null)).toBe('Gevallen op training')
  })
})
