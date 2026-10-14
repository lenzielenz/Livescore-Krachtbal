import { describe, expect, it } from 'vitest'

import { degradatieBoodschap } from '@/lib/degradatie'
import type { StandingRow } from '@/lib/standings'

// Degradatiegevaar voor de eigen ploeg: enkel de laatste zakt (zege 4, gelijk 3, verlies 2).

const row = (teamId: number, points: number, played = 5): StandingRow => ({
  teamId, played, won: 0, drawn: 0, lost: 0, forfaits: 0, goalsFor: 0, goalsAgainst: 0, diff: 0, points,
})
const namen: Record<number, string> = { 1: 'KBC Male', 2: 'HO Beitem', 3: 'Inter Assebroek', 4: 'Osiris Aalst' }
const naam = (id: number) => namen[id]
const tabel = [row(1, 20), row(2, 15), row(3, 12), row(4, 10)]
const nog = (n: number) => new Map(tabel.map((r) => [r.teamId, n]))

describe('degradatieBoodschap', () => {
  it('waarschuwt de laatste, met de achterstand op de ploeg erboven', () => {
    const m = degradatieBoodschap({ table: tabel, remaining: nog(17), teamId: 4, naam })
    expect(m).toEqual({
      text: 'Degradatiegevaar: Osiris Aalst staat laatst, op 2 punten van Inter Assebroek. Wie laatst eindigt, zakt. Nog 17 wedstrijden om dat recht te zetten.',
      zeker: false,
    })
  })

  it('noemt gelijke punten', () => {
    const t = [row(1, 20), row(3, 10), row(4, 10)]
    expect(degradatieBoodschap({ table: t, remaining: nog(5), teamId: 4, naam })?.text).toContain('met evenveel punten als Inter Assebroek')
  })

  it('waarschuwt een ploeg die op één speeldag van de laatste plaats staat', () => {
    const m = degradatieBoodschap({ table: tabel, remaining: nog(17), teamId: 3, naam })
    expect(m?.text).toBe(
      'Opgelet: Inter Assebroek staat net boven de degradatieplaats, met maar 2 punten voorsprong op Osiris Aalst. Eén speeldag kan volstaan om te wisselen.',
    )
  })

  it('zwijgt voor ploegen verder boven de streep', () => {
    expect(degradatieBoodschap({ table: tabel, remaining: nog(17), teamId: 2, naam })).toBeNull()
    expect(degradatieBoodschap({ table: tabel, remaining: nog(17), teamId: 1, naam })).toBeNull()
  })

  it('zwijgt als de ploeg wiskundig veilig is', () => {
    // Osiris kan met 1 wedstrijd hoogstens 14 halen; Inter heeft er al 15.
    const t = [row(1, 20), row(3, 15), row(4, 10)]
    expect(degradatieBoodschap({ table: t, remaining: new Map([[1, 1], [3, 1], [4, 1]]), teamId: 3, naam })).toBeNull()
  })

  it('meldt een zekere degradatie', () => {
    const t = [row(1, 30), row(3, 25), row(4, 10)]
    const m = degradatieBoodschap({ table: t, remaining: new Map([[1, 2], [3, 2], [4, 2]]), teamId: 4, naam })
    expect(m).toEqual({ text: 'Osiris Aalst kan de laatste plaats niet meer ontlopen en degradeert.', zeker: true })
  })

  it('meldt de degradatie na de laatste speeldag', () => {
    const m = degradatieBoodschap({ table: tabel, remaining: nog(0), teamId: 4, naam })
    expect(m).toEqual({ text: 'Osiris Aalst eindigt laatst en degradeert.', zeker: true })
    expect(degradatieBoodschap({ table: tabel, remaining: nog(0), teamId: 3, naam })).toBeNull()
  })

  it('zwijgt vóór de eerste wedstrijd', () => {
    const t = [row(1, 0, 0), row(4, 0, 0)]
    expect(degradatieBoodschap({ table: t, remaining: nog(18), teamId: 4, naam })).toBeNull()
  })
})
