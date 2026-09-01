import { describe, it, expect } from 'vitest'

import {
  clubVanPloeg,
  detectColumns,
  looksLikeHeader,
  matchSleutel,
  parseDatum,
  parseDelimited,
  parseUur,
  planSeason,
  resolveReeks,
  uurWaarschuwing,
} from '@/lib/season-import'

describe('looksLikeHeader / detectColumns', () => {
  it('herkent een koprij en vindt de kolommen, in welke volgorde ook', () => {
    const header = ['Nr', 'Bezoekers', 'Thuisploeg', 'Uur', 'Datum', 'Reeks']
    expect(looksLikeHeader(header)).toBe(true)
    const { map } = detectColumns(header)
    expect(map).toEqual({ datum: 4, uur: 3, reeks: 5, thuis: 2, uit: 1 })
  })

  it('trekt zich niets aan van hoofdletters, spaties en leestekens', () => {
    const { map } = detectColumns(['DATUM', 'Reeks / afdeling', 'Thuis ploeg', 'Bezoeker(s)'])
    expect(map).toEqual({ datum: 0, uur: null, reeks: 1, thuis: 2, uit: 3 })
  })

  it('zegt welke kolommen ontbreken', () => {
    const { map, ontbreekt } = detectColumns(['Datum', 'Thuisploeg'])
    expect(map).toBeNull()
    expect(ontbreekt).toEqual(['reeks', 'uitploeg'])
  })

  it('een wedstrijdrij is geen koprij', () => {
    expect(looksLikeHeader(['13/09/2026', '1NAH', 'KBK Temse', 'KBC Male'])).toBe(false)
  })
})

describe('parseUur', () => {
  it('leest de Vlaamse schrijfwijzen', () => {
    expect(parseUur('14:00')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('14.30')).toEqual({ uur: 14, minuut: 30 })
    expect(parseUur('14u00')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('9u')).toEqual({ uur: 9, minuut: 0 })
    expect(parseUur('16')).toEqual({ uur: 16, minuut: 0 })
  })
  it('leest een uur met seconden erbij', () => {
    // Dít liet een volledige speelkalender stranden: Excel schrijft een uurcel als "14:00:00"
    // weg, elke cel werd afgekeurd, en élke wedstrijd kwam op 00:00 te staan.
    expect(parseUur('14:00:00')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('09:30:00')).toEqual({ uur: 9, minuut: 30 })
  })

  it('leest een uur zoals een mens het typt', () => {
    expect(parseUur('om 14:00')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('14:00 uur')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('14u00 stipt')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('14h00')).toEqual({ uur: 14, minuut: 0 })
  })

  it('leest een uurcel die als kaal getal in een CSV belandt', () => {
    // 14:00 is 14/24 = 0,58333 van een dag. Zo ziet een Excel-uurcel eruit zonder opmaak.
    expect(parseUur('0.5833333333333334')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('0,5')).toEqual({ uur: 12, minuut: 0 })
  })

  it('leest een engelstalig uur met am/pm', () => {
    expect(parseUur('2:00 PM')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('12:15 AM')).toEqual({ uur: 0, minuut: 15 })
  })

  it('weigert onzin', () => {
    expect(parseUur('')).toBeNull()
    expect(parseUur('namiddag')).toBeNull()
    expect(parseUur('25:00')).toBeNull()
    // Een getal groter dan 1 is een gewoon uur en nooit een dagfractie: 14 blijft 14 uur.
    expect(parseUur('14')).toEqual({ uur: 14, minuut: 0 })
    expect(parseUur('1.75')).toBeNull()
  })
})

describe('parseDatum', () => {
  // September valt in de zomertijd: 14:00 Belgische tijd = 12:00 UTC.
  it('leest dd/mm/jjjj met een los uur, in Belgische tijd', () => {
    expect(parseDatum('13/09/2026', '14:00')).toBe('2026-09-13T12:00:00.000Z')
  })
  it('leest de jjjj-mm-dd die uit Excel komt', () => {
    expect(parseDatum('2026-09-13', '14u00')).toBe('2026-09-13T12:00:00.000Z')
  })
  it('neemt het uur uit de datumcel als er geen aparte kolom is', () => {
    expect(parseDatum('2026-09-20 11:15')).toBe('2026-09-20T09:15:00.000Z')
  })
  it('de aparte uur-kolom heeft voorrang', () => {
    expect(parseDatum('2026-09-20 11:15', '15:30')).toBe('2026-09-20T13:30:00.000Z')
  })
  it('houdt rekening met de winteruur-overgang', () => {
    // Eind november: wintertijd, 14:00 lokaal = 13:00 UTC.
    expect(parseDatum('29/11/2026', '14:00')).toBe('2026-11-29T13:00:00.000Z')
  })
  it('weigert wat geen datum is', () => {
    expect(parseDatum('binnenkort')).toBeNull()
    expect(parseDatum('')).toBeNull()
    expect(parseDatum('45/13/2026')).toBeNull()
  })
})

describe('resolveReeks', () => {
  it('aanvaardt de interne code, de naam en de federatiecode', () => {
    expect(resolveReeks('1NAH')).toBe('1NAH')
    expect(resolveReeks('1nah')).toBe('1NAH')
    expect(resolveReeks('1NH')).toBe('1NAH')
    expect(resolveReeks('REGDA')).toBe('RDA')
    expect(resolveReeks('U14J')).toBe('U14J')
  })
  it('geeft null bij een onbekende reeks', () => {
    expect(resolveReeks('kabouterreeks')).toBeNull()
    expect(resolveReeks('')).toBeNull()
  })
  it('herkent de nieuwe reeksen van seizoen 2026-2027 (kalender KVKBF)', () => {
    expect(resolveReeks('REGHC')).toBe('RHC')
    expect(resolveReeks('U12 A')).toBe('U12A')
    expect(resolveReeks('U12 B')).toBe('U12B')
    expect(resolveReeks('U16 MA')).toBe('U16MA')
    expect(resolveReeks('U16 MB')).toBe('U16MB')
    expect(resolveReeks('U14JA')).toBe('U14JA')
    expect(resolveReeks('U14JB')).toBe('U14JB')
    expect(resolveReeks('U18 M')).toBe('U18M')
  })
})

describe('clubVanPloeg', () => {
  it('haalt het poule-achtervoegsel eraf', () => {
    expect(clubVanPloeg('KV Roeselare A')).toBe('KV Roeselare')
    expect(clubVanPloeg('KBK Temse B')).toBe('KBK Temse')
  })
  it('laat een gewone naam met rust', () => {
    expect(clubVanPloeg('KBC St. Michiels')).toBe('KBC St. Michiels')
  })
})

describe('parseDelimited', () => {
  it('herkent puntkomma, tab en komma', () => {
    expect(parseDelimited('a;b;c')).toEqual([['a', 'b', 'c']])
    expect(parseDelimited('a\tb\tc')).toEqual([['a', 'b', 'c']])
    expect(parseDelimited('a,b,c')).toEqual([['a', 'b', 'c']])
  })
  it('respecteert aanhalingstekens rond een veld met een scheidingsteken', () => {
    expect(parseDelimited('"Temse, A";1NAH')).toEqual([['Temse, A', '1NAH']])
  })
  it('slaat lege regels over', () => {
    expect(parseDelimited('a;b\n\n\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('planSeason', () => {
  const header = ['Nr', 'Reeks', 'Datum', 'Uur', 'Thuisploeg', 'Bezoekers']
  const rij = (nr: string, reeks: string, datum: string, uur: string, thuis: string, uit: string) => [nr, reeks, datum, uur, thuis, uit]

  it('zet een volledig speelplan om', () => {
    const plan = planSeason([
      header,
      rij('1', '1NAH', '13/09/2026', '14:00', 'KBK Temse', 'KBC Male'),
      rij('2', '1NAH', '13/09/2026', '16:00', 'KV Roeselare A', 'KBC St. Michiels'),
      rij('3', 'REGDA', '20/09/2026', '10:30', 'D&W Sint-Kruis', 'KV Izegem'),
    ])
    expect(plan.matches).toHaveLength(3)
    expect(plan.issues).toEqual([])
    expect(plan.matches[0]).toMatchObject({
      reeks: '1NAH',
      thuis: 'KBK Temse',
      uit: 'KBC Male',
      thuisClub: 'KBK Temse',
      seizoen: '2026-2027',
      category: 'senioren',
    })
    expect(plan.matches[2].reeks).toBe('RDA')
  })

  it('verzamelt de clubs en ploegen die aangemaakt moeten worden', () => {
    const plan = planSeason([
      header,
      rij('1', '1NAH', '13/09/2026', '14:00', 'KV Roeselare A', 'KV Roeselare B'),
      rij('2', 'U14J', '13/09/2026', '10:00', 'KV Roeselare A', 'KBK Temse'),
    ])
    // Eén club, maar drie ploegen: A en B in 1NAH, plus A in U14J (andere reeks = andere ploeg).
    expect(plan.clubs).toEqual(['KBK Temse', 'KV Roeselare'])
    expect(plan.teams).toHaveLength(4)
    expect(plan.teams.filter((t) => t.naam === 'KV Roeselare A').map((t) => t.reeks).sort()).toEqual(['1NAH', 'U14J'])
  })

  it('slaat vrije weekends over zonder te klagen', () => {
    const plan = planSeason([header, rij('1', '1NAH', '13/09/2026', '14:00', 'KBK Temse', 'VRIJ')])
    expect(plan.matches).toEqual([])
    expect(plan.issues).toEqual([])
  })

  it('slaat vrije weekends met een poule-letter over ("Vrij A"/"Vrij B")', () => {
    const plan = planSeason([
      header,
      rij('1', '1NAH', '13/09/2026', '14:00', 'KBC Heist', 'Vrij A'),
      rij('2', '1NAH', '13/09/2026', '14:00', 'Vrij B', 'Atlas Varsenare'),
    ])
    expect(plan.matches).toEqual([])
    expect(plan.issues).toEqual([])
  })

  it('meldt onbruikbare rijen met rijnummer in plaats van alles te laten mislukken', () => {
    const plan = planSeason([
      header,
      rij('1', 'kabouters', '13/09/2026', '14:00', 'A', 'B'),
      rij('2', '1NAH', 'ooit', '14:00', 'A', 'B'),
      rij('3', '1NAH', '13/09/2026', '14:00', 'KBK Temse', 'KBK Temse'),
      rij('4', '1NAH', '20/09/2026', '14:00', 'KBK Temse', 'KBC Male'),
    ])
    expect(plan.matches).toHaveLength(1)
    expect(plan.issues.map((i) => i.rij)).toEqual([2, 3, 4])
    expect(plan.issues[0].reden).toContain('Onbekende reeks')
    expect(plan.issues[1].reden).toContain('Onbruikbare datum')
    expect(plan.issues[2].reden).toContain('dezelfde ploeg')
  })

  it('herkent een dubbele wedstrijd binnen hetzelfde bestand', () => {
    const plan = planSeason([
      header,
      rij('1', '1NAH', '13/09/2026', '14:00', 'KBK Temse', 'KBC Male'),
      rij('2', '1NAH', '13/09/2026', '16:00', 'KBK Temse', 'KBC Male'),
    ])
    expect(plan.matches).toHaveLength(1)
    expect(plan.issues[0].reden).toContain('twee keer')
  })

  it('werkt ook zonder koprij, in de vaste volgorde datum-reeks-thuis-uit', () => {
    const plan = planSeason([['13/09/2026 14:00', '1NAH', 'KBK Temse', 'KBC Male']])
    expect(plan.header).toBeNull()
    expect(plan.matches).toHaveLength(1)
    expect(plan.matches[0].dateIso).toBe('2026-09-13T12:00:00.000Z')
  })

  it('leest zonder koprij de kolommen af aan de inhoud (geplakt uit Excel)', () => {
    // Volgorde datum ; uur ; reeks ; thuis ; uit — géén koprij, dus enkel de inhoud verraadt het.
    const plan = planSeason([
      ['13/09/2026', '14:00', '1NAH', 'KBK Temse', 'KBC Male'],
      ['13/09/2026', '16:00', '1NAH', 'HO Assebroek', 'KV Izegem'],
    ])
    expect(plan.issues).toEqual([])
    expect(plan.matches).toHaveLength(2)
    expect(plan.matches[0]).toMatchObject({ reeks: '1NAH', thuis: 'KBK Temse', uit: 'KBC Male' })
    expect(plan.matches[0].dateIso).toBe('2026-09-13T12:00:00.000Z')
  })

  it('en ook als er nog een nummer- en scheidsrechterkolom tussen staan', () => {
    const plan = planSeason([
      ['1001', '1NAH', '13/09/2026', '14:00', 'KBK Temse', 'KBC Male'],
      ['1002', '1NAH', '13/09/2026', '16:00', 'HO Assebroek', 'KV Izegem'],
    ])
    expect(plan.issues).toEqual([])
    expect(plan.matches[0]).toMatchObject({ reeks: '1NAH', thuis: 'KBK Temse', uit: 'KBC Male' })
  })

  it('legt uit welke kolom ontbreekt als de koprij onvolledig is', () => {
    const plan = planSeason([['Datum', 'Thuisploeg', 'Bezoekers'], ['13/09/2026', 'A', 'B']])
    expect(plan.matches).toEqual([])
    expect(plan.issues[0].reden).toContain('reeks')
  })

  it('een leeg bestand geeft een leeg plan', () => {
    expect(planSeason([]).matches).toEqual([])
    expect(planSeason([['', '', '']]).matches).toEqual([])
  })
})

describe('matchSleutel', () => {
  it('negeert het aanvangsuur en de schrijfwijze van de naam', () => {
    const a = matchSleutel('1NAH', '2026-09-13T12:00:00.000Z', 'KBK Temse', 'KBC Male')
    const b = matchSleutel('1NAH', '2026-09-13T14:00:00.000Z', 'kbk  temse', 'K.B.C. Male')
    expect(a).toBe(b)
  })
  it('maar niet de dag of de reeks', () => {
    const a = matchSleutel('1NAH', '2026-09-13T12:00:00.000Z', 'A', 'B')
    expect(a).not.toBe(matchSleutel('1NAH', '2026-09-20T12:00:00.000Z', 'A', 'B'))
    expect(a).not.toBe(matchSleutel('2NAH', '2026-09-13T12:00:00.000Z', 'A', 'B'))
  })
})

describe('het aanvangsuur van een hele kalender', () => {
  // De aanleiding: een volledige speelkalender kwam binnen met kloppende datums, ploegen en
  // reeksen — maar élke wedstrijd op 00:00. Er werd niets over gezegd, dus zag het er geslaagd
  // uit tot iemand de kalender opendeed.
  const kalender = (uur: string) => [
    ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
    ['13/09/2026', uur, '1NAH', 'KBC St. Michiels', 'KBC Male'],
    ['20/09/2026', uur, '1NAH', 'KBC Male', 'KBC St. Michiels'],
  ]

  it('leest het uur dat Excel met seconden wegschrijft', () => {
    const plan = planSeason(kalender('14:00:00'))
    expect(plan.matches).toHaveLength(2)
    // September is zomertijd: 14:00 Belgische tijd = 12:00 UTC.
    expect(plan.matches[0].dateIso).toBe('2026-09-13T12:00:00.000Z')
    expect(plan.uren).toMatchObject({ kolom: true, metUur: 2, zonderUur: 0 })
    expect(uurWaarschuwing(plan.uren)).toBeNull()
  })

  it('zegt het wanneer er geen enkel uur gelezen kon worden', () => {
    const plan = planSeason(kalender('namiddag'))
    expect(plan.matches).toHaveLength(2)
    expect(plan.uren).toMatchObject({ kolom: true, metUur: 0, zonderUur: 2 })
    const zin = uurWaarschuwing(plan.uren)
    expect(zin).toMatch(/00:00/)
    // Mét het voorbeeld erbij, want dát is wat de gebruiker moet aanpassen.
    expect(zin).toMatch(/namiddag/)
  })

  it('zegt het wanneer er helemaal geen uurkolom is', () => {
    const plan = planSeason([
      ['Datum', 'Reeks', 'Thuisploeg', 'Bezoekers'],
      ['13/09/2026', '1NAH', 'KBC St. Michiels', 'KBC Male'],
    ])
    expect(plan.uren).toMatchObject({ kolom: false, metUur: 0, zonderUur: 1 })
    expect(uurWaarschuwing(plan.uren)).toMatch(/geen kolom/i)
  })

  it('zwijgt wanneer het uur al in de datumkolom zit', () => {
    const plan = planSeason([
      ['Datum', 'Reeks', 'Thuisploeg', 'Bezoekers'],
      ['13/09/2026 14:00', '1NAH', 'KBC St. Michiels', 'KBC Male'],
    ])
    expect(plan.matches[0].dateIso).toBe('2026-09-13T12:00:00.000Z')
    expect(uurWaarschuwing(plan.uren)).toBeNull()
  })

  it('telt eerlijk wanneer maar een deel van de uren ontbreekt', () => {
    const plan = planSeason([
      ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
      ['13/09/2026', '14:00:00', '1NAH', 'KBC St. Michiels', 'KBC Male'],
      ['20/09/2026', '', '1NAH', 'KBC Male', 'KBC St. Michiels'],
    ])
    expect(plan.uren).toMatchObject({ metUur: 1, zonderUur: 1 })
    expect(uurWaarschuwing(plan.uren)).toMatch(/1 van de 2/)
  })
})
