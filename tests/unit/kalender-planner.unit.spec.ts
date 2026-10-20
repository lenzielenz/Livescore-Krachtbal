import { describe, it, expect } from 'vitest'

import { bergerRondes, leesThuis, planKalender, type PlanPloeg } from '@/lib/kalender-planner'
import { shiftDateStr } from '@/lib/datetime'

// Zes clubs met een herenploeg, vier ervan ook met een damesploeg (gekoppeld aan hun heren).
const clubs = ['Sint-Michiels', 'Baasrode', 'Zandberg', 'Lebbeke', 'Opwijk', 'Sint-Gillis']
const heren: PlanPloeg[] = clubs.map((c, i) => ({ id: 100 + i, naam: `${c} H`, club: i + 1, clubNaam: c, reeks: '1NAH', thuisUur: '16:00' }))
const dames: PlanPloeg[] = clubs.slice(0, 4).map((c, i) => ({ id: 200 + i, naam: `${c} D`, club: i + 1, clubNaam: c, reeks: '1NAD', thuisUur: '16:00' }))
const koppels = dames.map((d, i) => ({ a: heren[i].id, b: d.id }))
const weekends = Array.from({ length: 12 }, (_, i) => shiftDateStr('2027-09-04', i * 7))
const clubVan = (id: number) => [...heren, ...dames].find((p) => p.id === id)!.club

describe('bergerRondes', () => {
  it('iedereen speelt één keer tegen iedereen, thuis en uit in balans', () => {
    const r = bergerRondes(6)
    expect(r).toHaveLength(5)
    const paren = new Set(r.flat().map(([a, b]) => [a, b].sort().join('-')))
    expect(paren.size).toBe(15)
    const thuis = Array(6).fill(0)
    for (const [a] of r.flat()) thuis[a]++
    expect(Math.max(...thuis) - Math.min(...thuis)).toBeLessThanOrEqual(1)
  })
})

describe('planKalender', () => {
  const res = planKalender([...heren, ...dames], koppels, [], { weekends })

  it('volledige heen- en terugronde per reeks', () => {
    expect(res.wedstrijden.filter((w) => w.reeks === '1NAH')).toHaveLength(30)
    // Dames zitten in de tabel van 6 (gekoppeld aan de heren): elk paar 2×, vrij als de tegenstander ontbreekt.
    expect(res.wedstrijden.filter((w) => w.reeks === '1NAD')).toHaveLength(12)
  })

  it('dames en heren van dezelfde club spelen hetzelfde weekend tegen dezelfde club, op hetzelfde terrein', () => {
    for (const d of res.wedstrijden.filter((w) => w.reeks === '1NAD')) {
      const h = res.wedstrijden.find((w) => w.reeks === '1NAH' && w.weekend === d.weekend && clubVan(w.thuis) === clubVan(d.thuis) && clubVan(w.uit) === clubVan(d.uit))
      expect(h, `geen herenwedstrijd bij damesmatch ${d.thuis}-${d.uit} op ${d.weekend}`).toBeTruthy()
      expect(h!.koppel).toBe(d.koppel)
      expect(h!.datum).toBe(d.datum)
    }
    expect(res.stats.koppelsSamen).toBeGreaterThan(0)
  })

  it('op hetzelfde terrein na elkaar, niet tegelijk', () => {
    const d = res.wedstrijden.find((w) => w.koppel)!
    const paar = res.wedstrijden.filter((w) => w.koppel === d.koppel).map((w) => w.uur).sort()
    expect(paar).toEqual(['16:00', '18:00'])
  })

  it('vermijdt thuiswedstrijden op een weekend dat het terrein niet vrij is', () => {
    const r = planKalender([...heren, ...dames], koppels, [
      { club: 1, weekend: weekends[0], hard: true, reden: 'kermis' },
      { club: 1, weekend: weekends[2], hard: true },
      { club: 2, weekend: weekends[1], hard: true },
    ], { weekends })
    expect(r.score).toBe(0)
    expect(r.problemen.filter((p) => p.soort === 'onbeschikbaar')).toHaveLength(0)
    expect(r.wedstrijden.some((w) => clubVan(w.thuis) === 1 && (w.weekend === weekends[0] || w.weekend === weekends[2]))).toBe(false)
    // Koppels blijven heel.
    for (const d of r.wedstrijden.filter((w) => w.reeks === '1NAD')) {
      expect(r.wedstrijden.some((w) => w.reeks === '1NAH' && w.weekend === d.weekend && clubVan(w.thuis) === clubVan(d.thuis) && clubVan(w.uit) === clubVan(d.uit))).toBe(true)
    }
  })

  it('legt uit wat niet lukte', () => {
    // Club 1 heeft nergens een vrij terrein: dat kan niet opgelost worden.
    const r = planKalender(heren, [], weekends.map((w) => ({ club: 1, weekend: w, hard: true, reden: 'renovatie' })), { weekends })
    expect(r.problemen.some((p) => p.soort === 'onbeschikbaar' && p.ernst === 'hard' && /renovatie/.test(p.tekst))).toBe(true)
    const kort = planKalender(heren, [], [], { weekends: weekends.slice(0, 5) })
    expect(kort.problemen.some((p) => p.soort === 'weekends')).toBe(true)
  })

  it('thuisdag en uur, ook "zo 14:30" uit de reeksindeling', () => {
    expect(leesThuis({ thuisUur: 'zo 14:30' }, { dag: 'za', uur: '14:00' })).toEqual({ dag: 'zo', uur: '14:30' })
    expect(leesThuis({ thuisUur: '15u00' }, { dag: 'za', uur: '14:00' })).toEqual({ dag: 'za', uur: '15:00' })
    const zo = planKalender([{ ...heren[0], thuisUur: 'zo 11:00' }, heren[1]], [], [], { weekends })
    const thuisZo = zo.wedstrijden.find((w) => w.thuis === heren[0].id)!
    expect(thuisZo.datum).toBe(shiftDateStr(thuisZo.weekend, 1))
    expect(thuisZo.uur).toBe('11:00')
  })

  it('zelfde invoer, zelfde kalender', () => {
    const a = planKalender([...heren, ...dames], koppels, [{ club: 3, weekend: weekends[4], hard: false }], { weekends })
    const b = planKalender([...heren, ...dames], koppels, [{ club: 3, weekend: weekends[4], hard: false }], { weekends })
    expect(a.wedstrijden).toEqual(b.wedstrijden)
  })
})

describe('maakKalender (eenvoudige generator per reeks)', () => {
  it('begrijpt het thuisuur van de reeksindeling ("zo 11:00")', async () => {
    const { maakKalender } = await import('@/lib/kalender-generator')
    const k = maakKalender(
      [
        { id: 1, naam: 'A', thuisUur: 'zo 11:00' },
        { id: 2, naam: 'B', thuisUur: '16:30' },
      ],
      { start: '2027-09-04' },
    )
    const a = k.find((w) => w.thuis === 1)!
    expect(a.datum).toBe('2027-09-05')
    expect(new Date(a.aftrapUtc).toISOString()).toBe('2027-09-05T09:00:00.000Z')
    const b = k.find((w) => w.thuis === 2)!
    expect(new Date(b.aftrapUtc).getUTCHours()).toBe(14)
  })
})
