import { describe, expect, it } from 'vitest'

import {
  CATEGORIES,
  TOURNAMENT_CATEGORIES,
  TOURNAMENT_CATEGORY_OPTIONS,
  categoryConfig,
} from '@/lib/categories'

describe('tornooicategorieën', () => {
  it('biedt U8, U10 en U12 aan in leeftijdsvolgorde', () => {
    expect(TOURNAMENT_CATEGORIES.slice(0, 3)).toEqual(['U8', 'U10', 'U12'])
    expect(TOURNAMENT_CATEGORY_OPTIONS.slice(0, 3).map((optie) => optie.value)).toEqual(['U8', 'U10', 'U12'])
  })

  it('voegt U8 en U10 niet toe aan de gewone competitie', () => {
    expect(CATEGORIES).not.toContain('U8')
    expect(CATEGORIES).not.toContain('U10')
  })

  it.each(['U8', 'U10', 'U12'] as const)('%s gebruikt de jeugdregels', (categorie) => {
    expect(categoryConfig(categorie)).toMatchObject({
      halfDurationSeconds: 20 * 60,
      throwsFromOwnHalf: 4,
      throwsFromOpponentHalf: 3,
      isYouth: true,
    })
  })
})
