import { describe, expect, it } from 'vitest'

import { tegelKleuren, tegelVolgorde } from '@/lib/virtueel-mozaiek'

describe('mozaïek', () => {
  it('verdeelt de foto’s eerlijk over de tegels, en buren verschillen', () => {
    const v = tegelVolgorde(13, 36, 18)
    expect(v).toHaveLength(36 * 18)
    const tel = new Map<number, number>()
    for (const f of v) tel.set(f, (tel.get(f) ?? 0) + 1)
    expect(tel.size).toBe(13)
    expect(Math.max(...tel.values()) - Math.min(...tel.values())).toBeLessThanOrEqual(1)
    let botsingen = 0
    v.forEach((f, i) => {
      if (i % 36 > 0 && v[i - 1] === f) botsingen++
      if (i >= 36 && v[i - 36] === f) botsingen++
    })
    expect(botsingen).toBeLessThan(5)
    // Iedereen ziet dezelfde mozaïek.
    expect(tegelVolgorde(13, 36, 18)).toEqual(v)
  })

  it('geeft -1 zonder foto’s', () => {
    expect(tegelVolgorde(0, 4, 2)).toEqual([-1, -1, -1, -1, -1, -1, -1, -1])
  })

  it('kleurt doorzichtige stukken van het logo met de achtergrond', () => {
    const data = [255, 0, 0, 255, 0, 0, 0, 0]
    expect(tegelKleuren(data, 2, 1, [10, 20, 30])).toEqual([
      [255, 0, 0],
      [10, 20, 30],
    ])
  })
})
