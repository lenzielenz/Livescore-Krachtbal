import { describe, expect, it } from 'vitest'

import { sanitizeShout } from '@/lib/match-channel'

// De opschoning van een bewaard tribune-bericht (matches.liveShoutouts). Belangrijk vooral voor
// oude berichten die geplaatst werden vóór reply/like/bewerken bestonden: die hebben geen
// userId/likes/likedBy op het record staan, en mogen daar niet op stuklopen bij het inladen.

describe('sanitizeShout', () => {
  it('laat een volledig, actueel bericht ongewijzigd', () => {
    const raw = { id: 3, userId: 42, name: 'Jan', text: 'Vooruit!', at: 1000, photoUrl: '/x.jpg', replyTo: 1, likes: 2, likedBy: [7, 8] }
    expect(sanitizeShout(raw)).toEqual(raw)
  })

  it('vult ontbrekende reply/like-velden van een oud bericht veilig aan', () => {
    const oud = { id: 5, name: 'Marie', text: 'Kom op!', at: 2000, photoUrl: null }
    expect(sanitizeShout(oud)).toEqual({
      id: 5,
      userId: -1,
      name: 'Marie',
      text: 'Kom op!',
      at: 2000,
      photoUrl: null,
      editedAt: undefined,
      replyTo: null,
      likes: 0,
      likedBy: [],
    })
  })

  it('leidt likes af uit likedBy als likes zelf ontbreekt', () => {
    const raw = { id: 6, name: 'Tom', text: 'Ga zo door', at: 3000, likedBy: [1, 2, 3] }
    expect(sanitizeShout(raw)?.likes).toBe(3)
  })

  it('negeert een ongeldige/negatieve replyTo (behandelt als topbericht)', () => {
    expect(sanitizeShout({ id: 7, name: 'X', text: 'y', at: 1, replyTo: -1 })?.replyTo).toBeNull()
    expect(sanitizeShout({ id: 8, name: 'X', text: 'y', at: 1, replyTo: 0 })?.replyTo).toBeNull()
  })

  it('geeft null terug voor een record zonder geldig id of tekst', () => {
    expect(sanitizeShout({ name: 'X', text: 'y', at: 1 })).toBeNull()
    expect(sanitizeShout({ id: 1, at: 1 })).toBeNull()
    expect(sanitizeShout(null)).toBeNull()
    expect(sanitizeShout('niet een object')).toBeNull()
  })

  it('filtert niet-numerieke waarden uit likedBy', () => {
    const raw = { id: 9, name: 'X', text: 'y', at: 1, likedBy: [1, 'oeps', 2, null] }
    expect(sanitizeShout(raw)?.likedBy).toEqual([1, 2])
  })
})
