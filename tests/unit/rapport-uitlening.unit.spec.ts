import { describe, expect, it } from 'vitest'

import { actiesVoor, ontleedSleutel } from '@/lib/aanvragen-bord'
import { belgischeFeestdagen, feestdag, paaszondag } from '@/lib/feestdagen'
import { aanleidingenVanBlad } from '@/lib/sr-rapport'
import { werkdagenTussen } from '@/lib/termijnen'
import { jeugdCategorie, uitleenBezwaar } from '@/lib/uitlening'
import { comiteVoor, isWerkdag, VOORBEHOUD_ONDERWERPEN, werkdagenNa } from '@/lib/voorbehoud'

// De pure kant van RCVK items 25.3 (comité), 27 (scheidsrechtersrapport), 45 (uitlening) en de
// termijnen in werkdagen (met de wettelijke feestdagen).

describe('feestdagen', () => {
  it('rekent Pasen juist uit', () => {
    expect(paaszondag(2024)).toEqual([3, 31])
    expect(paaszondag(2026)).toEqual([4, 5])
    expect(paaszondag(2027)).toEqual([3, 28])
    expect(paaszondag(2038)).toEqual([4, 25])
  })

  it('kent de tien wettelijke feestdagen, ook de beweeglijke', () => {
    const f = belgischeFeestdagen(2026)
    expect(f.size).toBe(10)
    expect(feestdag('2026-04-06')).toBe('Paasmaandag')
    expect(feestdag('2026-05-14')).toBe('O.-L.-H.-Hemelvaart')
    expect(feestdag('2026-05-25')).toBe('Pinkstermaandag')
    expect(feestdag('2026-11-11')).toBe('Wapenstilstand')
    expect(feestdag('2026-07-11')).toBeNull() // dag van de Vlaamse Gemeenschap: geen wettelijke feestdag
    expect(feestdag('2026-11-12')).toBeNull()
  })
})

describe('werkdagen', () => {
  it('weekend en feestdagen zijn geen werkdag', () => {
    expect(isWerkdag('2026-11-11')).toBe(false) // woensdag, Wapenstilstand
    expect(isWerkdag('2026-11-12')).toBe(true)
    expect(isWerkdag('2026-11-14')).toBe(false) // zaterdag
    expect(isWerkdag('2026-12-25')).toBe(false)
  })

  it('vijf werkdagen na een wedstrijd slaan een feestdag over (item 25)', () => {
    // Dinsdag 10 november 2026: 11/11 is een feestdag, dus 12, 13, 16, 17, 18 → woensdag 18 november.
    const tegen = werkdagenNa(new Date('2026-11-10T20:00:00Z'))
    expect(tegen.toISOString()).toBe('2026-11-18T22:59:00.000Z') // 23:59 Belgische tijd (winteruur)
    // Over Kerstmis: zaterdag 19 december → 21, 22, 23, 24, (25 = Kerstmis, dan het weekend) 28.
    expect(werkdagenNa(new Date('2026-12-19T15:00:00Z')).toISOString().slice(0, 10)).toBe('2026-12-28')
  })

  it('telt werkdagen tussen twee momenten', () => {
    expect(werkdagenTussen(new Date('2026-11-10T20:00:00Z'), new Date('2026-11-12T08:00:00Z'))).toBe(1)
    expect(werkdagenTussen(new Date('2026-11-13T20:00:00Z'), new Date('2026-11-16T08:00:00Z'))).toBe(1)
    expect(werkdagenTussen(new Date('2026-11-13T20:00:00Z'), new Date('2026-11-13T22:00:00Z'))).toBe(0)
  })
})

describe('voorbehoud: welk comité (item 25.3)', () => {
  it('volgt uit het onderwerp', () => {
    expect(comiteVoor('inrichting')).toBe('sport')
    expect(comiteVoor('identiteit')).toBe('sport')
    expect(comiteVoor('speelduur_tijdopnemer')).toBe('sport')
    expect(comiteVoor('doelpunt')).toBe('scheidsrechters')
    expect(comiteVoor('speelduur_scheidsrechter')).toBe('scheidsrechters')
    expect(comiteVoor('ander')).toBeNull()
    expect(comiteVoor('onzin')).toBeNull()
  })

  it('dekt elk onderwerp uit het reglement: zes voor het sportcomité, vijf voor de scheidsrechters', () => {
    const tel = (c: string) => VOORBEHOUD_ONDERWERPEN.filter((o) => o.comite === c).length
    expect([tel('sport'), tel('scheidsrechters')]).toEqual([6, 5])
  })
})

describe('scheidsrechtersrapport: wanneer verplicht (item 27)', () => {
  it('bij voorbehoud, uitsluiting, forfait ter plaatse of op aanduiding', () => {
    expect(aanleidingenVanBlad({})).toEqual([])
    expect(aanleidingenVanBlad({ voorbehoud: [{}], uitsluitingen: [{}] })).toEqual(['voorbehoud', 'uitsluiting'])
    expect(aanleidingenVanBlad({ forfait: { uitslag: 'thuis', moment: 'ter_plaatse' } })).toEqual(['niet_gespeeld'])
    // Een forfait zonder moment werd door de scheidsrechter vastgesteld: ter plaatse.
    expect(aanleidingenVanBlad({ forfait: { uitslag: 'dubbel' } })).toEqual(['niet_gespeeld'])
    expect(aanleidingenVanBlad({ rapportVolgt: true })).toEqual(['ander'])
  })

  it('niet bij een forfait dat de club vooraf meldde', () => {
    expect(aanleidingenVanBlad({ forfait: { uitslag: 'uit', moment: 'vooraf' } })).toEqual([])
    expect(aanleidingenVanBlad({ forfait: { uitslag: 'uit', moment: 'laat' } })).toEqual([])
    expect(aanleidingenVanBlad({ forfait: { uitslag: 'geen' } })).toEqual([])
  })
})

describe('uitlening van een jeugdspeler (item 45)', () => {
  it('enkel jeugd: tot en met U18', () => {
    expect(jeugdCategorie('2014-03-01', 2026)).toBe('U14')
    // Het peiljaar is het einde van het seizoen (lib/age-categories.ts): wie in 2009 geboren is, is al U20.
    expect(jeugdCategorie('2010-03-01', 2026)).toBe('U18')
    expect(jeugdCategorie('2009-03-01', 2026)).toBeNull()
    expect(jeugdCategorie('1995-03-01', 2026)).toBeNull()
    expect(jeugdCategorie(null, 2026)).toBeNull()
  })

  const ok = { spelerClub: 1, naarClub: 2, spelerCategorie: 'U14' as const, ploegCategorie: 'U14', adres: 'Kerkstraat 1, Gent', lopend: false }
  it('geen bezwaar als alles klopt', () => {
    expect(uitleenBezwaar(ok)).toBeNull()
  })
  it('weigert wat het reglement niet toelaat', () => {
    expect(uitleenBezwaar({ ...ok, spelerCategorie: null })).toMatch(/jeugdspelers/)
    expect(uitleenBezwaar({ ...ok, naarClub: 1 })).toMatch(/andere club/)
    expect(uitleenBezwaar({ ...ok, ploegCategorie: 'senioren' })).toMatch(/jeugdploeg/)
    expect(uitleenBezwaar({ ...ok, adres: '' })).toMatch(/adres/)
    expect(uitleenBezwaar({ ...ok, lopend: true })).toMatch(/loopt al/)
  })
})

describe('het bord: rapport en uitlening', () => {
  it('kent de nieuwe sleutels', () => {
    expect(ontleedSleutel('rapport:3')).toEqual({ bron: 'rapport', id: 3 })
    expect(ontleedSleutel('uitlening:8')).toEqual({ bron: 'uitlening', id: 8 })
  })

  it('toont de knoppen enkel als het bij de federatie ligt, met het document als link', () => {
    expect(actiesVoor({ bron: 'rapport', statusCode: 'ingediend', open: true, bronId: 3 }).map((a) => [a.id, a.href ?? null])).toEqual([
      ['lezen', '/api/sr-rapport/3/pdf'],
      ['afhandelen', null],
    ])
    expect(actiesVoor({ bron: 'uitlening', statusCode: 'wacht_ontvanger', open: true, bronId: 8 })).toEqual([])
    const u = actiesVoor({ bron: 'uitlening', statusCode: 'wacht_federatie', open: true, bronId: 8 })
    expect(u.map((a) => a.id)).toEqual(['lezen', 'bevestigen', 'weigeren'])
    expect(u.find((a) => a.id === 'weigeren')?.toelichting).toBe('verplicht')
  })
})
