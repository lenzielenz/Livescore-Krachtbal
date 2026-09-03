import { describe, expect, it } from 'vitest'

import {
  FOTO_OPDRACHTEN,
  opdrachtOp,
  opdrachtVoor,
  volgordeVoor,
  zaadVoor,
} from '@/lib/foto-opdrachten'

// De foto-opdrachten prikkelen supporters om in te sturen. De regel: elke deelnemer krijgt álle
// vijftig opdrachten, maar in een eigen volgorde — zodat twee supporters naast elkaar zelden op
// dezelfde foto jagen, en dezelfde deelnemer op zijn tablet exact verderdoet waar zijn gsm stopte.
describe('foto-opdrachten', () => {
  it('cycelt door de hele lijst en begint dan opnieuw', () => {
    const n = FOTO_OPDRACHTEN.length
    const reeks = Array.from({ length: n }, (_, i) => opdrachtOp(i))
    expect(new Set(reeks).size).toBe(n)
    expect(opdrachtOp(n)).toBe(opdrachtOp(0))
    expect(opdrachtOp(-1)).toBe(opdrachtOp(n - 1))
  })

  it('geeft elke deelnemer alle opdrachten, elk precies één keer', () => {
    const v = volgordeVoor(zaadVoor(42, 'Beker van Brugge'))
    expect(v).toHaveLength(FOTO_OPDRACHTEN.length)
    expect(new Set(v).size).toBe(FOTO_OPDRACHTEN.length)
    expect(Math.min(...v)).toBe(0)
    expect(Math.max(...v)).toBe(FOTO_OPDRACHTEN.length - 1)
  })

  it('geeft dezelfde deelnemer altijd dezelfde volgorde', () => {
    // Dit is wat het overbodig maakt om iets te bewaren: gsm en tablet rekenen hetzelfde uit.
    const a = volgordeVoor(zaadVoor(42, 'Beker van Brugge'))
    const b = volgordeVoor(zaadVoor(42, 'Beker van Brugge'))
    expect(b).toEqual(a)
  })

  it('geeft verschillende deelnemers een verschillende volgorde', () => {
    const groep = 'Beker van Brugge'
    const reeksen = Array.from({ length: 30 }, (_, id) => volgordeVoor(zaadVoor(id + 1, groep)))

    // Geen twee supporters lopen dezelfde route af. Dít is de eigenlijke belofte.
    expect(new Set(reeksen.map((r) => r.join(','))).size).toBe(30)

    // En op een gegeven moment staan ze niet massaal op dezelfde opdracht. Botsingen zijn normaal
    // — dertig supporters uit vijftig opdrachten trekken, dat geeft er statistisch een handvol —
    // maar een groepje van vijf op dezelfde foto zou betekenen dat de schudbeurt niet werkt.
    const perOpdracht = new Map<number, number>()
    for (const r of reeksen) perOpdracht.set(r[0], (perOpdracht.get(r[0]) ?? 0) + 1)
    expect(Math.max(...perOpdracht.values())).toBeLessThan(5)
  })

  it('geeft dezelfde deelnemer op een ánder tornooi een andere volgorde', () => {
    const a = volgordeVoor(zaadVoor(7, 'Beker van Brugge'))
    const b = volgordeVoor(zaadVoor(7, 'Jabbeke Cup'))
    expect(b).not.toEqual(a)
  })

  it('houdt buurman-ids uit elkaar', () => {
    // Een zwakke hash zou opeenvolgende gebruikers-ids bijna dezelfde reeks geven — en net die
    // zitten samen op de bus naar het tornooi.
    const a = volgordeVoor(zaadVoor(11, 'Beker van Brugge'))
    const b = volgordeVoor(zaadVoor(12, 'Beker van Brugge'))
    const gelijk = a.filter((x, i) => x === b[i]).length
    expect(gelijk).toBeLessThan(5)
  })
})

describe('opdrachtVoor', () => {
  const zaad = zaadVoor(42, 'Beker van Brugge')

  it('telt mee hoeveel er al ingestuurd zijn', () => {
    expect(opdrachtVoor(zaad, 0).nummer).toBe(1)
    expect(opdrachtVoor(zaad, 10).nummer).toBe(11)
    expect(opdrachtVoor(zaad, 0).totaal).toBe(FOTO_OPDRACHTEN.length)
  })

  it('loopt de vijftig af zonder er één over te slaan of te herhalen', () => {
    const gezien = Array.from({ length: FOTO_OPDRACHTEN.length }, (_, i) => opdrachtVoor(zaad, i).tekst)
    expect(new Set(gezien).size).toBe(FOTO_OPDRACHTEN.length)
  })

  it('begint na vijftig aan een nieuwe, opnieuw geschudde ronde', () => {
    const n = FOTO_OPDRACHTEN.length
    expect(opdrachtVoor(zaad, n).nummer).toBe(1)
    const ronde1 = Array.from({ length: n }, (_, i) => opdrachtVoor(zaad, i).tekst)
    const ronde2 = Array.from({ length: n }, (_, i) => opdrachtVoor(zaad, n + i).tekst)
    // Wel weer alle vijftig, maar niet in dezelfde volgorde.
    expect(new Set(ronde2).size).toBe(n)
    expect(ronde2).not.toEqual(ronde1)
  })

  it('slikt onzinnige tellers zonder te breken', () => {
    // Een negatieve of gebroken teller mag nooit `undefined` als opdracht opleveren — dat zou op
    // het kantinescherm als lege regel onder de foto belanden.
    for (const n of [-5, -1, 0.5, 3.7]) {
      const o = opdrachtVoor(zaad, n)
      expect(FOTO_OPDRACHTEN).toContain(o.tekst)
      expect(o.nummer).toBeGreaterThanOrEqual(1)
    }
  })
})
