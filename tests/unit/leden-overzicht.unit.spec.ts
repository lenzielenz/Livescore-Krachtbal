import { describe, expect, it } from 'vitest'

import { herinneringTekst, herinneringVoor, keuringVerlooptBinnenkort, ledenPerClub, type OverzichtLid } from '@/lib/leden-overzicht'

const nu = new Date('2026-10-20T12:00:00Z')
const dagenGeleden = (d: number) => new Date(nu.getTime() - d * 86_400_000).toISOString().slice(0, 10)
const lid = (id: number, clubId: number, toon: OverzichtLid['toon'], extra: Partial<OverzichtLid> = {}): OverzichtLid => ({
  id,
  naam: `Lid ${id}`,
  clubId,
  clubNaam: clubId === 1 ? 'KBC Sint-Michiels' : 'KC Baasrode',
  toon,
  reden: '',
  keuringOp: dagenGeleden(60),
  ...extra,
})

describe('ledenPerClub', () => {
  const leden = [
    lid(1, 1, 'ok'),
    lid(2, 1, 'ok', { keuringOp: dagenGeleden(355) }),
    lid(3, 1, 'wacht'),
    lid(4, 1, 'todo', { reden: 'ontbreekt: keuringsdatum' }),
    lid(5, 2, 'ok'),
    lid(6, 2, 'fout', { reden: 'attest onleesbaar' }),
    lid(7, 2, 'lid'),
    lid(8, 2, 'ok'),
  ]

  it('telt per club; gewone leden tellen niet mee als speler', () => {
    const { clubs, totaal } = ledenPerClub(leden, nu)
    const sm = clubs.find((c) => c.clubId === 1)!
    expect(sm).toMatchObject({ totaal: 4, ok: 2, wacht: 1, todo: 1, afgekeurd: 0, keuringVerloopt: 1 })
    expect(clubs.find((c) => c.clubId === 2)).toMatchObject({ totaal: 3, ok: 2, afgekeurd: 1 })
    expect(totaal).toMatchObject({ totaal: 7, ok: 4, wacht: 1, todo: 1, afgekeurd: 1, keuringVerloopt: 1 })
  })

  it('wie wacht op de federatie, is geen werk voor de club', () => {
    const sm = ledenPerClub(leden, nu).clubs.find((c) => c.clubId === 1)!
    expect(sm.teDoen.map((l) => l.id)).toEqual([2, 4])
  })

  it('keuring verloopt binnen 30 dagen, niet al verlopen of nog ver weg', () => {
    expect(keuringVerlooptBinnenkort(dagenGeleden(340), nu)).toBe(true)
    expect(keuringVerlooptBinnenkort(dagenGeleden(300), nu)).toBe(false)
    expect(keuringVerlooptBinnenkort(dagenGeleden(400), nu)).toBe(false)
    expect(keuringVerlooptBinnenkort('', nu)).toBe(false)
  })
})

describe('herinneringVoor', () => {
  it('somt op wat er mist, per lid', () => {
    const club = ledenPerClub([lid(2, 1, 'ok', { keuringOp: dagenGeleden(355) }), lid(4, 1, 'todo', { reden: 'ontbreekt: keuringsdatum' }), lid(6, 1, 'fout', { reden: 'attest onleesbaar' })], nu).clubs[0]
    const h = herinneringVoor(club, nu)!
    expect(h.titel).toBe('Herinnering van de federatie: 3 leden niet in orde')
    expect(h.tekst).toBe('KBC Sint-Michiels: 1 lid nog aan te vullen of in te dienen, 1 lid afgekeurd, 1 keuring verloopt binnenkort. Wie niet in orde is, kan niet opgesteld worden.')
    expect(h.url).toBe('/club/leden')
    expect(h.regels).toEqual(['Lid 2 — medische keuring verloopt over 10 dagen', 'Lid 4 — ontbreekt: keuringsdatum', 'Lid 6 — afgekeurd: attest onleesbaar'])
    expect(herinneringTekst(h).split('\n')).toHaveLength(4)
  })

  it('niets te herinneren als alles in orde is of enkel bij de federatie ligt', () => {
    const club = ledenPerClub([lid(1, 1, 'ok'), lid(3, 1, 'wacht')], nu).clubs[0]
    expect(herinneringVoor(club, nu)).toBeNull()
  })
})
