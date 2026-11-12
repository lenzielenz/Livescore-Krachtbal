// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { actiesVoor, deadlineVan, kolomVan, type Aanvraag } from '@/lib/aanvragen-bord'
import { pastDoelgroep, pastForfaitMoment } from '@/lib/boetes'
import { brusselsWallUtc } from '@/lib/datetime'
import { forfaitGrens, forfaitMomentVoor, nieuweUitslag } from '@/lib/forfait'
import { werkdagenNa } from '@/lib/voorbehoud'

// Belgische wandkloktijd → instant, zodat de tests niet afhangen van de tijdzone van de machine.
const be = (y: number, m: number, d: number, h = 0, min = 0) => brusselsWallUtc(y, m, d, h, min)

describe('forfait: tijdig of laat gemeld (RCVK item 34)', () => {
  it('weekendwedstrijd: de grens is vrijdag 12u van dat weekend', () => {
    // zondag 15 november 2026, 15u → vrijdag 13 november 12u
    expect(forfaitGrens(be(2026, 11, 15, 15)).toISOString()).toBe(be(2026, 11, 13, 12).toISOString())
    // zaterdag 14 november, 10u → dezelfde vrijdag
    expect(forfaitGrens(be(2026, 11, 14, 10)).toISOString()).toBe(be(2026, 11, 13, 12).toISOString())
    // vrijdagavond 13 november, 20u → vrijdag 12u, dezelfde dag
    expect(forfaitGrens(be(2026, 11, 13, 20)).toISOString()).toBe(be(2026, 11, 13, 12).toISOString())
  })

  it('midweek: 24 uur vóór de aftrap', () => {
    const woensdag = be(2026, 11, 18, 19, 30)
    expect(forfaitGrens(woensdag).getTime()).toBe(woensdag.getTime() - 24 * 3_600_000)
    // vrijdagochtend telt nog als midweek (de weekendgrens van 12u zou anders na de aftrap liggen)
    const vrijdagOchtend = be(2026, 11, 13, 10)
    expect(forfaitGrens(vrijdagOchtend).getTime()).toBe(vrijdagOchtend.getTime() - 24 * 3_600_000)
  })

  it('één seconde voor de grens is tijdig, op de grens is laat', () => {
    const zondag = be(2026, 11, 15, 14)
    expect(forfaitMomentVoor(be(2026, 11, 13, 11, 59), zondag)).toBe('vooraf')
    expect(forfaitMomentVoor(be(2026, 11, 13, 12, 0), zondag)).toBe('laat')
    expect(forfaitMomentVoor(be(2026, 11, 15, 9), zondag)).toBe('laat')
    expect(forfaitMomentVoor(be(2026, 11, 2, 9), zondag)).toBe('vooraf')
  })

  it('wie er nog bij forfait geeft, maakt er een dubbel forfait van; hetzelfde twee keer verandert niets', () => {
    expect(nieuweUitslag('geen', 'uit')).toBe('uit')
    expect(nieuweUitslag('thuis', 'uit')).toBe('dubbel')
    expect(nieuweUitslag('uit', 'uit')).toBeNull()
    expect(nieuweUitslag('dubbel', 'thuis')).toBeNull()
  })
})

describe('boetelijst: welke soort past', () => {
  it('forfaitmoment: "alle" past altijd, anders enkel het eigen moment; zonder moment = ter plaatse', () => {
    expect(pastForfaitMoment({ forfaitMoment: 'alle' }, 'laat')).toBe(true)
    expect(pastForfaitMoment({ forfaitMoment: null }, 'vooraf')).toBe(true)
    expect(pastForfaitMoment({ forfaitMoment: 'laat' }, 'laat')).toBe(true)
    expect(pastForfaitMoment({ forfaitMoment: 'laat' }, 'vooraf')).toBe(false)
    expect(pastForfaitMoment({ forfaitMoment: 'ter_plaatse' }, null)).toBe(true)
  })

  it('doelgroep: senioren tegenover elke jeugdcategorie', () => {
    expect(pastDoelgroep({ doelgroep: 'alle' }, 'U14')).toBe(true)
    expect(pastDoelgroep({ doelgroep: 'senioren' }, 'senioren')).toBe(true)
    expect(pastDoelgroep({ doelgroep: 'senioren' }, 'U18')).toBe(false)
    expect(pastDoelgroep({ doelgroep: 'jeugd' }, 'U12')).toBe(true)
    expect(pastDoelgroep({ doelgroep: 'jeugd' }, 'senioren')).toBe(false)
    expect(pastDoelgroep({ doelgroep: null }, 'U12')).toBe(true)
  })
})

describe('voorbehoud: 5 werkdagen (RCVK item 25)', () => {
  it('telt weekdagen en eindigt om 23:59', () => {
    // donderdag 12 november 2026 → vr, ma, di, wo, do → donderdag 19 november 23:59
    expect(werkdagenNa(be(2026, 11, 12, 21)).toISOString()).toBe(be(2026, 11, 19, 23, 59).toISOString())
    // zondag 15 november → ma … vr → vrijdag 20 november
    expect(werkdagenNa(be(2026, 11, 15, 18)).toISOString()).toBe(be(2026, 11, 20, 23, 59).toISOString())
  })
})

describe('het bord: voorbehoud en termijnen', () => {
  const basis = (x: Partial<Aanvraag>): Aanvraag => ({
    sleutel: 'klacht:1', bron: 'klacht', bronId: 1, titel: 't', detail: '', club: null, sinds: new Date().toISOString(),
    status: '', statusCode: 'open', open: true, afgeslotenOp: null, wachtOpAuto: null, href: '/', dossier: null, ...x,
  })

  it('een voorbehoud dat de club nog moet bekrachtigen heeft geen knoppen en wacht op de club', () => {
    const vb = basis({ statusCode: 'te_bekrachtigen', wachtOpAuto: 'club', deadlineAuto: '2026-11-19T22:59:00.000Z' })
    expect(actiesVoor(vb)).toEqual([])
    expect(kolomVan(vb)).toBe('wacht')
    expect(actiesVoor(basis({ statusCode: 'open' })).map((a) => a.id)).toEqual(['heropenen', 'afwijzen'])
  })

  it('de deadline van de federatie wint van de automatische termijn', () => {
    const auto = '2026-11-19T22:59:00.000Z'
    expect(deadlineVan(basis({ deadlineAuto: auto }))).toBe(auto)
    const eigen = basis({ deadlineAuto: auto, dossier: { id: 1, behandelaar: null, wachtOp: null, wachtOpTekst: null, deadline: '2026-11-16T00:00:00.000Z', notities: [], afgerondOp: null } })
    expect(deadlineVan(eigen)).toBe('2026-11-16T00:00:00.000Z')
  })
})
