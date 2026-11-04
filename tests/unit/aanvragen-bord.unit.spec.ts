// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  type Aanvraag,
  BRON_META,
  actiesVoor,
  deadlineStand,
  filterAanvragen,
  kolomVan,
  ontleedSleutel,
  ouderdom,
  sleutelVan,
  sorteerKolom,
  tellingen,
  wachtOpVan,
} from '@/lib/aanvragen-bord'

const NU = Date.UTC(2026, 10, 4, 12, 0, 0) // 4 november 2026, 12:00
const d = (dagen: number) => new Date(NU + dagen * 86_400_000).toISOString()

const basis = (x: Partial<Aanvraag> = {}): Aanvraag => ({
  sleutel: 'klacht:1',
  bron: 'klacht',
  bronId: 1,
  titel: 'Sint-Michiels – Baasrode',
  detail: 'Rugworp als nekworp genoteerd',
  club: 'Baasrode',
  sinds: d(-2),
  status: 'Open',
  statusCode: 'open',
  open: true,
  afgeslotenOp: null,
  wachtOpAuto: null,
  href: '/beheer/klachten',
  dossier: null,
  ...x,
})
const metDossier = (x: Partial<NonNullable<Aanvraag['dossier']>>): Aanvraag['dossier'] => ({
  id: 9,
  behandelaar: null,
  wachtOp: null,
  wachtOpTekst: null,
  deadline: null,
  notities: [],
  afgerondOp: null,
  ...x,
})

describe('aanvragen-bord: de kolom volgt de aanvraag zelf, dan het dossier', () => {
  it('nieuw: open en niemand mee bezig', () => {
    expect(kolomVan(basis())).toBe('nieuw')
    expect(kolomVan(basis({ dossier: metDossier({ notities: [{ door: 'x', op: d(0), tekst: 'hm' }] }) }))).toBe('nieuw')
  })

  it('in behandeling zodra iemand het opnam', () => {
    expect(kolomVan(basis({ dossier: metDossier({ behandelaar: { id: 1, naam: 'Fien' } }) }))).toBe('bezig')
  })

  it('wacht op anderen: aangeduid in het dossier, of volgens de aanvraag zelf — ook als iemand ermee bezig is', () => {
    expect(kolomVan(basis({ dossier: metDossier({ behandelaar: { id: 1, naam: 'Fien' }, wachtOp: 'club' }) }))).toBe('wacht')
    const verplaatsing = basis({ bron: 'verplaatsing', statusCode: 'wacht_tegenpartij', wachtOpAuto: 'club' })
    expect(kolomVan(verplaatsing)).toBe('wacht')
    expect(wachtOpVan(verplaatsing)).toBe('club')
    // wat iemand aanduidde wint op wat de aanvraag zegt
    expect(wachtOpVan({ ...verplaatsing, dossier: metDossier({ wachtOp: 'extern' }) })).toBe('extern')
  })

  it('afgehandeld komt uit de aanvraag zelf, nooit uit het dossier', () => {
    const dicht = basis({ open: false, statusCode: 'afgewezen', afgeslotenOp: d(-1), dossier: metDossier({ behandelaar: { id: 1, naam: 'Fien' }, wachtOp: 'club' }) })
    expect(kolomVan(dicht)).toBe('klaar')
    // en omgekeerd: een dossier zonder iets maakt een open aanvraag niet "klaar"
    expect(kolomVan(basis({ dossier: metDossier({ afgerondOp: d(-1) }) }))).toBe('nieuw')
  })
})

describe('aanvragen-bord: de knoppen horen bij de soort én de status', () => {
  it('een verplaatsing kan je pas beslissen als ze bij de federatie ligt', () => {
    expect(actiesVoor({ bron: 'verplaatsing', statusCode: 'wacht_federatie', open: true, bronId: 1 }).map((a) => a.id)).toEqual(['goedkeuren', 'afwijzen'])
    expect(actiesVoor({ bron: 'verplaatsing', statusCode: 'wacht_tegenpartij', open: true, bronId: 1 })).toEqual([])
  })

  it('een boete heeft per stand andere knoppen', () => {
    const ids = (s: string) => actiesVoor({ bron: 'boete', statusCode: s, open: true, bronId: 1 }).map((a) => a.id)
    expect(ids('voorstel')).toEqual(['opleggen', 'vernietigen'])
    expect(ids('betaling_gemeld')).toEqual(['betaald'])
    expect(ids('betwist')).toEqual(['handhaven', 'vernietigen'])
    expect(ids('opgelegd')).toEqual([]) // ligt bij de club
  })

  it('afkeuren, afwijzen en terugsturen vragen een toelichting; die leest de andere partij', () => {
    const verplicht = (bron: Aanvraag['bron'], status: string, id: string) =>
      actiesVoor({ bron, statusCode: status, open: true, bronId: 1 }).find((a) => a.id === id)?.toelichting
    expect(verplicht('registratie', 'ingediend', 'afkeuren')).toBe('verplicht')
    expect(verplicht('klacht', 'open', 'afwijzen')).toBe('verplicht')
    expect(verplicht('ongeval', 'ingediend', 'terugsturen')).toBe('verplicht')
    expect(verplicht('registratie', 'ingediend', 'goedkeuren')).toBeUndefined()
  })

  it('een nieuwe datum voor een afgelasting is een sprong naar het werkscherm, geen knop op het bord', () => {
    const a = actiesVoor({ bron: 'afgelasting', statusCode: 'gemeld', open: true, bronId: 1 })
    expect(a.find((x) => x.id === 'herplannen')?.href).toBe('/beheer/afgelastingen')
    expect(a.find((x) => x.id === 'intrekken')?.href).toBeUndefined()
  })

  it('een afgehandelde aanvraag heeft geen knoppen meer', () => {
    expect(actiesVoor({ bron: 'klacht', statusCode: 'afgewezen', open: false, bronId: 1 })).toEqual([])
  })

  it('elke soort heeft een label, icoon en meervoud', () => {
    for (const b of Object.keys(BRON_META) as Aanvraag['bron'][]) {
      expect(BRON_META[b].label.length, b).toBeGreaterThan(2)
      expect(BRON_META[b].meervoud.length, b).toBeGreaterThan(2)
    }
  })
})

describe('aanvragen-bord: sleutels', () => {
  it('maakt en ontleedt sleutels, en weigert onzin', () => {
    expect(sleutelVan('boete', 12)).toBe('boete:12')
    expect(ontleedSleutel('boete:12')).toEqual({ bron: 'boete', id: 12 })
    expect(ontleedSleutel('boete:0')).toBeNull()
    expect(ontleedSleutel('boete:abc')).toBeNull()
    expect(ontleedSleutel('onbekend:1')).toBeNull()
    expect(ontleedSleutel('')).toBeNull()
  })
})

describe('aanvragen-bord: sorteren', () => {
  it('open kolommen: te laat eerst, dan dichtste deadline, dan wie het langst wacht', () => {
    const teLaat = basis({ sleutel: 'a', sinds: d(-1), dossier: metDossier({ deadline: d(-2) }) })
    const morgen = basis({ sleutel: 'b', sinds: d(-1), dossier: metDossier({ deadline: d(1) }) })
    const overWeek = basis({ sleutel: 'c', sinds: d(-10), dossier: metDossier({ deadline: d(7) }) })
    const oudZonder = basis({ sleutel: 'd', sinds: d(-20) })
    const nieuwZonder = basis({ sleutel: 'e', sinds: d(-1) })
    expect(sorteerKolom([nieuwZonder, overWeek, oudZonder, morgen, teLaat], 'nieuw', NU).map((a) => a.sleutel)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('afgehandeld: het laatst afgehandelde bovenaan', () => {
    const x = basis({ sleutel: 'x', open: false, afgeslotenOp: d(-3) })
    const y = basis({ sleutel: 'y', open: false, afgeslotenOp: d(-1) })
    expect(sorteerKolom([x, y], 'klaar', NU).map((a) => a.sleutel)).toEqual(['y', 'x'])
  })
})

describe('aanvragen-bord: filteren', () => {
  const lijst = [
    basis({ sleutel: 'k1', club: 'Baasrode' }),
    basis({ sleutel: 'b1', bron: 'boete', club: 'Zandberg', titel: 'Zandberg · € 25,00', dossier: metDossier({ behandelaar: { id: 7, naam: 'Fien Federatie' } }) }),
    basis({ sleutel: 't1', bron: 'taak', club: null, titel: 'Verzekeringspolis vernieuwen', detail: '' }),
  ]
  it('op soort', () => {
    expect(filterAanvragen(lijst, { bron: 'boete' }).map((a) => a.sleutel)).toEqual(['b1'])
  })
  it('op "mijn dossiers"', () => {
    expect(filterAanvragen(lijst, { mijnId: 7 }).map((a) => a.sleutel)).toEqual(['b1'])
    expect(filterAanvragen(lijst, { mijnId: 8 })).toEqual([])
  })
  it('op tekst, zonder hoofdletters of accenten, ook op de naam van de behandelaar', () => {
    expect(filterAanvragen(lijst, { zoek: 'zandberg' }).map((a) => a.sleutel)).toEqual(['b1'])
    expect(filterAanvragen(lijst, { zoek: 'fien' }).map((a) => a.sleutel)).toEqual(['b1'])
    expect(filterAanvragen(lijst, { zoek: 'VERZEKERING' }).map((a) => a.sleutel)).toEqual(['t1'])
    expect(filterAanvragen(lijst, { zoek: 'baasrode boete' })).toEqual([])
  })
})

describe('aanvragen-bord: tijd in gewone taal', () => {
  it('ouderdom', () => {
    expect(ouderdom(new Date(NU - 10 * 60_000).toISOString(), NU)).toBe('net')
    expect(ouderdom(new Date(NU - 5 * 3_600_000).toISOString(), NU)).toBe('5 u')
    expect(ouderdom(d(-3), NU)).toBe('3 d')
    expect(ouderdom(d(-21), NU)).toBe('3 w')
  })
  it('deadline', () => {
    expect(deadlineStand(d(-2), NU)).toEqual({ tekst: '2 d te laat', toon: 'teLaat' })
    expect(deadlineStand(d(0), NU)).toEqual({ tekst: 'vandaag', toon: 'vandaag' })
    expect(deadlineStand(d(1), NU)).toEqual({ tekst: 'morgen', toon: 'binnenkort' })
    expect(deadlineStand(d(5), NU)).toEqual({ tekst: 'over 5 d', toon: 'binnenkort' })
    expect(deadlineStand(d(20), NU)).toEqual({ tekst: 'over 20 d', toon: 'later' })
    expect(deadlineStand(null, NU)).toBeNull()
  })
})

describe('aanvragen-bord: tellingen', () => {
  it('telt per kolom en wat open is', () => {
    const t = tellingen([
      basis(),
      basis({ dossier: metDossier({ behandelaar: { id: 1, naam: 'F' } }) }),
      basis({ wachtOpAuto: 'speler' }),
      basis({ open: false, afgeslotenOp: d(-1) }),
    ])
    expect(t).toEqual({ nieuw: 1, bezig: 1, wacht: 1, klaar: 1, open: 3 })
  })
})
