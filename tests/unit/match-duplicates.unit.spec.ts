import { describe, it, expect } from 'vitest'

import { duplicaatSleutel, kiesBehouder, overtolligeIds } from '@/lib/match-duplicates'

// Dubbele wedstrijden opruimen.
//
// Aanleiding: na een seizoensimport stond de hele kalender twee keer in de agenda. Het bestand
// zelf bevatte geen enkele dubbele rij (nagerekend: 2572 rijen, 2572 unieke wedstrijden) — het
// waren twee imports die elkaar overlapten. Opruimen moet dus kunnen, en het mag nóóit de
// wedstrijd raken waar al aan gewerkt is.

describe('duplicaatSleutel', () => {
  it('ziet twee tijdstippen op dezelfde dag als dezelfde wedstrijd', () => {
    // Precies het paar dat je wil opruimen: een import die het uur verkeerd las en een die het
    // goed las. Zelfde reeks, zelfde dag, zelfde ploegen = één wedstrijd.
    // 12:00 en 16:15 UTC = 14:00 en 18:15 Belgische tijd, allebei op 12 september.
    const a = duplicaatSleutel('1NAH', '2026-09-12T16:15:00.000Z', 3, 7)
    const b = duplicaatSleutel('1NAH', '2026-09-12T12:00:00.000Z', 3, 7)
    expect(a).toBe(b)
    expect(a).toBe('1NAH|2026-09-12|3|7')
  })

  it('rekent in Belgische kalenderdagen, niet in UTC', () => {
    // Middernacht Belgische tijd is 22:00 UTC de dag ervoor. Op de ISO-datum kijken zou die
    // wedstrijd op een andere dag zetten dan dezelfde wedstrijd om 14:00 — en dan blijft het
    // dubbel staan.
    const middernacht = duplicaatSleutel('1NAH', '2026-09-11T22:00:00.000Z', 3, 7)
    const namiddag = duplicaatSleutel('1NAH', '2026-09-12T12:00:00.000Z', 3, 7)
    expect(middernacht).toBe(namiddag)
  })

  it('houdt verschillende ploegen, reeksen en dagen uit elkaar', () => {
    const basis = duplicaatSleutel('1NAH', '2026-09-12T12:00:00.000Z', 3, 7)
    expect(duplicaatSleutel('1NAD', '2026-09-12T12:00:00.000Z', 3, 7)).not.toBe(basis)
    expect(duplicaatSleutel('1NAH', '2026-09-13T12:00:00.000Z', 3, 7)).not.toBe(basis)
    expect(duplicaatSleutel('1NAH', '2026-09-12T12:00:00.000Z', 7, 3)).not.toBe(basis) // omgekeerd = ander duel
  })
})

describe('kiesBehouder', () => {
  it('houdt de wedstrijd waar al aan gewerkt is', () => {
    // Dít is de regel die telt: een gespeelde of geanalyseerde wedstrijd mag nooit sneuvelen
    // voor een verse lege kopie — dan gooi je de enige echte data weg om een importfout op te
    // ruimen.
    const houden = kiesBehouder([
      { id: 10, status: 'scheduled' },
      { id: 44, status: 'finished', heeftData: true },
    ])
    expect(houden?.id).toBe(44)
  })

  it('verkiest een gespeelde boven een geplande, ook zonder video', () => {
    expect(kiesBehouder([{ id: 5, status: 'scheduled' }, { id: 9, status: 'live' }])?.id).toBe(9)
  })

  it('houdt bij gelijke stand de oudste', () => {
    // Het laagste id: daar verwijst de rest van de app het langst naar.
    expect(kiesBehouder([{ id: 91, status: 'scheduled' }, { id: 12, status: 'scheduled' }])?.id).toBe(12)
  })

  it('geeft niets terug voor een lege groep', () => {
    expect(kiesBehouder([])).toBeNull()
  })
})

describe('overtolligeIds', () => {
  it('laat per sleutel precies één wedstrijd staan', () => {
    const weg = overtolligeIds([
      { id: 1, sleutel: 'a', status: 'scheduled' },
      { id: 2, sleutel: 'a', status: 'scheduled' },
      { id: 3, sleutel: 'a', status: 'scheduled' },
      { id: 4, sleutel: 'b', status: 'scheduled' },
    ])
    expect(weg).toEqual([2, 3])
  })

  it('raakt een wedstrijd zonder dubbel niet aan', () => {
    expect(overtolligeIds([{ id: 1, sleutel: 'a' }, { id: 2, sleutel: 'b' }])).toEqual([])
  })

  it('gooit nooit de gespeelde weg, ook al is die de jongste', () => {
    const weg = overtolligeIds([
      { id: 1, sleutel: 'a', status: 'scheduled' },
      { id: 2, sleutel: 'a', status: 'finished', heeftData: true },
    ])
    expect(weg).toEqual([1])
  })

  it('geeft de ids gesorteerd terug', () => {
    const weg = overtolligeIds([
      { id: 30, sleutel: 'a' }, { id: 10, sleutel: 'a' }, { id: 20, sleutel: 'a' },
    ])
    expect(weg).toEqual([20, 30])
  })
})
