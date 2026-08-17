import { describe, it, expect } from 'vitest'

import { buildMatchIcs, buildMultiMatchIcs, icsEscape, icsFilename, icsFilenameFor, toIcsUtc } from '@/lib/match-ics'

describe('toIcsUtc', () => {
  it('formatteert als YYYYMMDDTHHMMSSZ in UTC', () => {
    expect(toIcsUtc(new Date('2026-06-17T18:30:00Z'))).toBe('20260617T183000Z')
  })
})

describe('icsEscape', () => {
  it('escapet komma, puntkomma, backslash en nieuwe regel', () => {
    expect(icsEscape('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne')
  })
})

describe('buildMatchIcs', () => {
  const ics = buildMatchIcs({
    id: 42,
    home: 'KBC St. Michiels',
    away: 'KBC Male',
    reeks: '1ste Nationale Dames',
    startIso: '2026-06-17T18:30:00Z',
    location: 'Sporthal, Brugge',
    url: 'https://livescore.example/match/42',
    stampIso: '2026-06-14T10:00:00Z',
  })

  it('bevat een geldig VEVENT met start, eind (+2u) en titel', () => {
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('UID:krachtbal-match-42@krachtbal-live')
    expect(ics).toContain('DTSTART:20260617T183000Z')
    expect(ics).toContain('DTEND:20260617T203000Z') // +120 min
    expect(ics).toContain('END:VCALENDAR')
  })
  it('escapet de komma in de locatie', () => {
    expect(ics).toContain('LOCATION:Sporthal\\, Brugge')
  })
  it('gebruikt CRLF-regeleindes', () => {
    expect(ics.includes('\r\n')).toBe(true)
  })
  it('respecteert een eigen duur', () => {
    const short = buildMatchIcs({ id: 1, home: 'A', away: 'B', startIso: '2026-06-17T18:00:00Z', durationMin: 90 })
    expect(short).toContain('DTEND:20260617T193000Z')
  })
})

describe('icsFilename', () => {
  it('maakt een veilige bestandsnaam', () => {
    expect(icsFilename('KBC St. Michiels', 'KBC Male')).toBe('krachtbal-kbc-st-michiels-vs-kbc-male.ics')
  })
})

describe('icsFilenameFor', () => {
  it('maakt een veilige bestandsnaam voor een team-/clubagenda', () => {
    expect(icsFilenameFor('KBC St. Michiels')).toBe('krachtbal-agenda-kbc-st-michiels.ics')
  })
  it('valt terug op "seizoen" bij een lege naam', () => {
    expect(icsFilenameFor('')).toBe('krachtbal-agenda-seizoen.ics')
  })
})

describe('buildMultiMatchIcs', () => {
  const events = [
    { id: 1, home: 'A', away: 'B', startIso: '2026-09-12T18:00:00Z', reeks: '1NAH' },
    { id: 2, home: 'C', away: 'A', startIso: '2026-09-19T18:00:00Z', reeks: '1NAH' },
  ]

  it('bevat één VCALENDAR met een VEVENT per wedstrijd', () => {
    const ics = buildMultiMatchIcs('Mijn agenda', events)
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('UID:krachtbal-match-1@krachtbal-live')
    expect(ics).toContain('UID:krachtbal-match-2@krachtbal-live')
    expect(ics).toContain('X-WR-CALNAME:Mijn agenda')
  })

  it('ontdubbelt wedstrijden met dezelfde id (bv. club met meerdere ploegen tegen elkaar)', () => {
    const ics = buildMultiMatchIcs(null, [...events, events[0]])
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })

  it('laat de kalendernaam weg zonder naam', () => {
    const ics = buildMultiMatchIcs(null, events)
    expect(ics).not.toContain('X-WR-CALNAME')
  })

  it('bouwt een geldig kalenderbestand bij nul wedstrijden', () => {
    const ics = buildMultiMatchIcs('Leeg', [])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})
