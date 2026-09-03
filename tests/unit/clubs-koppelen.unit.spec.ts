import { describe, expect, it } from 'vitest'

import { planClubKoppeling, type Club, type Ploeg } from '@/lib/clubs-koppelen'

// Ploegen aan hun echte club koppelen. De aanleiding: drie clubs voor één vereniging, elk met
// een leeg logo, omdat de import "A-1"/"B-2" niet als ploegkenmerk herkende.
const KBC: Club = { id: 1, naam: 'KBC St. Michiels', heeftLogo: false }
const KBC_A1: Club = { id: 2, naam: 'KBC St. Michiels A-1', heeftLogo: false }
const KBC_B2: Club = { id: 3, naam: 'KBC St. Michiels B-2', heeftLogo: false }
const MALE: Club = { id: 4, naam: 'KBC Male', heeftLogo: true }

const ploegen: Ploeg[] = [
  { id: 10, naam: 'KBC St. Michiels A-1', clubId: 2 },
  { id: 11, naam: 'KBC St. Michiels B-2', clubId: 3 },
  { id: 12, naam: 'KBC St. Michiels B', clubId: 1 },
  { id: 13, naam: 'KBC Male', clubId: 4 },
]

describe('planClubKoppeling', () => {
  it('brengt de ploegen van één vereniging naar één club en ruimt de club-per-ploeg op', () => {
    const plan = planClubKoppeling(ploegen, [KBC, KBC_A1, KBC_B2, MALE])
    expect(plan.verhuizingen.map((v) => [v.ploegNaam, v.naarClubId])).toEqual([
      ['KBC St. Michiels A-1', 1],
      ['KBC St. Michiels B-2', 1],
    ])
    // De ploeg die al goed stond en KBC Male: niets te doen.
    expect(plan.verhuizingen.some((v) => v.ploegId === 12 || v.ploegId === 13)).toBe(false)
    expect(plan.opTeRuimen.map((c) => c.naam)).toEqual(['KBC St. Michiels A-1', 'KBC St. Michiels B-2'])
    expect(plan.nieuweClubs).toEqual([])
    expect(plan.behouden).toEqual([])
  })

  it('is idempotent: op herstelde data is het plan leeg', () => {
    const hersteld: Ploeg[] = ploegen.map((p) => (p.naam.startsWith('KBC St. Michiels') ? { ...p, clubId: 1 } : p))
    const plan = planClubKoppeling(hersteld, [KBC, MALE])
    expect(plan.verhuizingen).toEqual([])
    expect(plan.opTeRuimen).toEqual([])
  })

  it('maakt de club aan als ze nog niet bestaat', () => {
    const plan = planClubKoppeling([{ id: 20, naam: 'Atlas Varsenare A-1', clubId: 5 }], [{ id: 5, naam: 'Atlas Varsenare A-1', heeftLogo: false }])
    expect(plan.nieuweClubs).toEqual(['Atlas Varsenare'])
    expect(plan.verhuizingen[0]).toMatchObject({ naarClubId: null, naarClubNaam: 'Atlas Varsenare' })
    // De club-per-ploeg raakt leeg en mag weg; de ploeg gaat naar de nog aan te maken club.
    expect(plan.opTeRuimen[0]).toMatchObject({ id: 5, naarClubId: null, naarClubNaam: 'Atlas Varsenare' })
  })

  it('kiest bij dubbele clubs die met een logo, anders die met de meeste ploegen', () => {
    // Twee keer "KBC Male", anders geschreven: de club met het logo is waar de organisatie aan
    // gewerkt heeft — daar horen de ploegen.
    const male2: Club = { id: 6, naam: 'KBC  Male', heeftLogo: false }
    const plan = planClubKoppeling([{ id: 30, naam: 'KBC Male B-2', clubId: 6 }], [MALE, male2])
    expect(plan.verhuizingen[0].naarClubId).toBe(4)

    const zonderLogo: Club[] = [
      { id: 7, naam: 'KV Roeselare', heeftLogo: false },
      { id: 8, naam: 'Kv Roeselare', heeftLogo: false },
    ]
    const drukke = planClubKoppeling(
      [
        { id: 40, naam: 'KV Roeselare A', clubId: 8 },
        { id: 41, naam: 'KV Roeselare B', clubId: 8 },
        { id: 42, naam: 'KV Roeselare C-3', clubId: 9 },
      ],
      [...zonderLogo, { id: 9, naam: 'KV Roeselare C-3', heeftLogo: false }],
    )
    // Club 8 heeft al twee ploegen; ploeg 42 hoort daarheen, niet naar de lege club 7.
    expect(drukke.verhuizingen.map((v) => [v.ploegId, v.naarClubId])).toEqual([[42, 8]])
  })

  it('gooit een leeg geraakte club met logo niet weg maar meldt ze', () => {
    const metLogo: Club = { id: 2, naam: 'KBC St. Michiels A-1', heeftLogo: true }
    const plan = planClubKoppeling([{ id: 10, naam: 'KBC St. Michiels A-1', clubId: 2 }], [KBC, metLogo])
    // De ploeg gaat naar de club zónder logo (er is maar één kandidaat op naam), maar de oude club
    // draagt een logo — die mag niet stilletjes verdwijnen.
    expect(plan.verhuizingen[0].naarClubId).toBe(1)
    expect(plan.opTeRuimen).toEqual([])
    expect(plan.behouden[0]).toMatchObject({ id: 2 })
    expect(plan.doelenZonderLogo).toEqual(['KBC St. Michiels'])
  })

  it('noemt de doelclubs zonder logo, zodat één upload volstaat', () => {
    const plan = planClubKoppeling(ploegen, [KBC, KBC_A1, KBC_B2, MALE])
    expect(plan.doelenZonderLogo).toEqual(['KBC St. Michiels'])
  })

  it('laat een ploeg zonder club niet vallen', () => {
    const plan = planClubKoppeling([{ id: 50, naam: 'KBC Heist B-2', clubId: null }], [{ id: 1, naam: 'KBC Heist', heeftLogo: false }])
    expect(plan.verhuizingen[0]).toMatchObject({ vanClubId: null, vanClubNaam: '—', naarClubId: 1 })
  })
})
