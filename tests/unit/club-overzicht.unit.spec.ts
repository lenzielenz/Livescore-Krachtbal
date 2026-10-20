import { describe, expect, it } from 'vitest'

import { clubOverzicht, ledenCsv, telLeden, type ExportLid } from '@/lib/club-overzicht'

describe('clubOverzicht', () => {
  const basis = {
    ploegen: [
      { id: 1, naam: 'Heren', reeks: 'Regionale A', toon: ['ok', 'ok', 'wacht', 'todo'] as const },
      { id: 2, naam: 'Dames', reeks: 'Regionale A', toon: ['ok', 'fout', 'lid'] as const },
    ].map((p) => ({ ...p, toon: [...p.toon] })),
    blessures: { teBezorgen: 1, bijFederatie: 2 },
    boetes: { aantal: 2, bedrag: 37.5, teBetalen: 1 },
    opstellingenTeDoen: 2,
  }

  it('telt leden per ploeg en in totaal; gewone leden zijn geen spelers', () => {
    const o = clubOverzicht(basis)
    expect(o.totaal).toEqual({ totaal: 7, spelers: 6, ok: 3, wacht: 1, todo: 2, leden: 1 })
    expect(o.ploegen.map((p) => [p.naam, p.ok, p.todo])).toEqual([
      ['Heren', 2, 1],
      ['Dames', 1, 1],
    ])
  })

  it('kerncijfers met de juiste toon', () => {
    const k = Object.fromEntries(clubOverzicht(basis).kerncijfers.map((c) => [c.sleutel, c]))
    expect(k.leden.waarde).toBe('7')
    expect(k.todo.toon).toBe('actie')
    expect(k.blessures.waarde).toBe('3')
    expect(k.boetes.waarde).toBe('€ 37,50')
  })

  it('te doen: dringendste eerst, niets wat bij de federatie ligt', () => {
    const t = clubOverzicht(basis).teDoen
    expect(t.map((x) => x.sleutel)).toEqual(['opstelling', 'boetes', 'leden', 'blessures'])
    const leeg = clubOverzicht({ ...basis, ploegen: [{ id: 1, naam: 'H', reeks: '', toon: ['ok', 'wacht'] }], blessures: { teBezorgen: 0, bijFederatie: 4 }, boetes: { aantal: 1, bedrag: 25, teBetalen: 0 }, opstellingenTeDoen: 0 })
    expect(leeg.teDoen).toEqual([])
  })

  it('telLeden op een lege ploeg', () => {
    expect(telLeden([])).toEqual({ totaal: 0, spelers: 0, ok: 0, wacht: 0, todo: 0, leden: 0 })
  })
})

describe('ledenCsv', () => {
  const lid: ExportLid = {
    naam: 'Jan Peeters',
    voornaam: 'Jan',
    achternaam: 'Peeters',
    ploeg: 'Heren',
    rugnummer: 7,
    geboortedatum: '2001-03-04',
    geslacht: 'M',
    soortLid: 'speler',
    status: 'Mag spelen',
    email: 'jan@voorbeeld.be',
    ouderEmail: '',
    login: true,
  }

  it('puntkomma, BOM en kop', () => {
    const csv = ledenCsv([lid])
    expect(csv.startsWith('﻿Naam;Voornaam;Ploeg;')).toBe(true)
    expect(csv).toContain('Peeters;Jan;Heren;7;2001-03-04;M;speler;Mag spelen;jan@voorbeeld.be;;ja')
  })

  it('beschermt tegen formules en escapet puntkomma en aanhalingstekens', () => {
    const csv = ledenCsv([{ ...lid, achternaam: '=HYPERLINK("x")', voornaam: 'a;b' }])
    expect(csv).toContain(`"'=HYPERLINK(""x"")";"a;b"`)
  })
})
