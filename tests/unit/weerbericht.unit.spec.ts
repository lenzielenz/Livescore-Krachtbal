import { describe, expect, it } from 'vitest'

import { bouwWeerbericht, dagLabel, sceneVoor, speeladvies, temperatuurLijn } from '@/lib/weerbericht'

const antwoord = {
  current: {
    time: '2026-11-07T14:15',
    temperature_2m: 8.4,
    apparent_temperature: 5.6,
    weather_code: 61,
    is_day: 1,
    wind_speed_10m: 18.2,
    wind_gusts_10m: 34,
    wind_direction_10m: 225,
    relative_humidity_2m: 88,
    precipitation: 0.4,
  },
  hourly: {
    time: ['2026-11-07T12:00', '2026-11-07T13:00', '2026-11-07T14:00', '2026-11-07T15:00', '2026-11-07T16:00'],
    temperature_2m: [7, 8, 8.4, 9, 8],
    weather_code: [3, 3, 61, 61, 80],
    precipitation_probability: [10, 20, 70, 80, 40],
    wind_speed_10m: [12, 15, 18, 21, 19],
    wind_direction_10m: [200, 210, 225, 230, 240],
    is_day: [1, 1, 1, 1, 0],
  },
  daily: {
    time: ['2026-11-07', '2026-11-08', '2026-11-09'],
    weather_code: [61, 3, 0],
    temperature_2m_max: [9.4, 11, 12],
    temperature_2m_min: [4, 5, 3.6],
    precipitation_probability_max: [85, 30, 5],
    sunrise: ['2026-11-07T07:52', '2026-11-08T07:54', '2026-11-09T07:56'],
    sunset: ['2026-11-07T17:08', '2026-11-08T17:06', '2026-11-09T17:05'],
  },
}

describe('weerbericht', () => {
  it('kiest de scène bij de weercode', () => {
    expect(sceneVoor(0)).toBe('helder')
    expect(sceneVoor(2)).toBe('halfbewolkt')
    expect(sceneVoor(3)).toBe('bewolkt')
    expect(sceneVoor(45)).toBe('mist')
    expect(sceneVoor(53)).toBe('motregen')
    expect(sceneVoor(63)).toBe('regen')
    expect(sceneVoor(81)).toBe('regen')
    expect(sceneVoor(73)).toBe('sneeuw')
    expect(sceneVoor(86)).toBe('sneeuw')
    expect(sceneVoor(96)).toBe('onweer')
  })

  it('bouwt nu, de komende uren (vanaf het lopende uur) en de dagen', () => {
    const w = bouwWeerbericht(antwoord)!
    expect(w.nu).toMatchObject({ temp: 8, voeltAls: 6, wind: 18, windstoten: 34, windRichting: 225, vochtigheid: 88, isDag: true })
    expect(w.uren.map((u) => u.label)).toEqual(['Nu', '15u', '16u'])
    expect(w.uren[0].kans).toBe(70)
    expect(w.uren[2].isDag).toBe(false)
    expect(w.dagen.map((d) => d.label)).toEqual(['Vandaag', 'Morgen', 'Ma'])
    expect(w.dagen[2]).toMatchObject({ max: 12, min: 4, kans: 5 })
    expect(w.zon).toEqual({ op: '07:52', onder: '17:08' })
  })

  it('geeft niets terug zonder huidige temperatuur', () => {
    expect(bouwWeerbericht({})).toBeNull()
    expect(bouwWeerbericht({ current: { time: '2026-11-07T14:00' } })).toBeNull()
  })

  it('zet de weekdag in het Nederlands', () => {
    expect(dagLabel('2026-11-07', '2026-11-07')).toBe('Vandaag')
    expect(dagLabel('2026-11-08', '2026-11-07')).toBe('Morgen')
    expect(dagLabel('2026-11-10', '2026-11-07')).toBe('Di')
  })

  it('geeft speeladvies met het belangrijkste eerst', () => {
    const basis = bouwWeerbericht(antwoord)!.nu
    expect(speeladvies({ ...basis, code: 95 }, 0).emoji).toBe('⚡')
    expect(speeladvies({ ...basis, code: 73 }, 0).emoji).toBe('❄️')
    // Windstoten van 34 km/u tellen mee: 0,7 × 34 = 24 → merkbare wind.
    expect(speeladvies(basis, 0).tekst).toContain('Merkbare wind')
    expect(speeladvies({ ...basis, wind: 32 }, 0).tekst).toContain('Krachtige wind')
    const kalm = { ...basis, wind: 5, windstoten: 8 }
    expect(speeladvies(kalm, 0).tekst).toContain('Natte bal')
    expect(speeladvies({ ...kalm, neerslag: 0, temp: 2 }, 10).tekst).toContain('Koud')
    expect(speeladvies({ ...kalm, neerslag: 0, temp: 15 }, 10).tekst).toBe('Prima krachtbalweer.')
  })

  it('tekent de temperatuurlijn binnen de marges', () => {
    const p = temperatuurLijn([5, 10, 7.5], 300, 60, 6)
    expect(p.map((q) => q.x)).toEqual([50, 150, 250])
    expect(p[0].y).toBeCloseTo(54)
    expect(p[1].y).toBeCloseTo(6)
    expect(p[2].y).toBeCloseTo(30)
    expect(temperatuurLijn([4, 4], 100, 40)[0].y).toBeCloseTo(34)
  })
})
