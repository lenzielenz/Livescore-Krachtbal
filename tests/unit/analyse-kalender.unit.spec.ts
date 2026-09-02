import { describe, it, expect } from 'vitest'

import { dichtstBijEerst } from '@/lib/analyse-kalender'

// De volgorde van de kalenderlijst bij "wedstrijd toevoegen uit de agenda".

const NU = new Date('2026-09-02T12:00:00.000Z').getTime()
const dag = (n: number) => new Date(NU + n * 86_400_000).toISOString()

describe('kalender voor de analyse-kiezer', () => {
  it('zet wat het dichtst bij vandaag ligt bovenaan', () => {
    const rijen = [
      { id: 'lang geleden', date: dag(-120) },
      { id: 'volgende week', date: dag(7) },
      { id: 'afgelopen weekend', date: dag(-2) },
      { id: 'ver vooruit', date: dag(80) },
    ]
    expect(dichtstBijEerst(rijen, NU).map((r) => r.id)).toEqual([
      'afgelopen weekend', 'volgende week', 'ver vooruit', 'lang geleden',
    ])
  })

  it('kiest bij gelijke afstand de gespeelde wedstrijd eerst', () => {
    // Die wil je analyseren; de andere moet nog gespeeld worden.
    const rijen = [{ id: 'vooruit', date: dag(3) }, { id: 'gespeeld', date: dag(-3) }]
    expect(dichtstBijEerst(rijen, NU).map((r) => r.id)).toEqual(['gespeeld', 'vooruit'])
  })

  it('zet wedstrijden zonder datum achteraan, in hun eigen volgorde', () => {
    const rijen = [{ id: 'a', date: null }, { id: 'b', date: dag(30) }, { id: 'c', date: null }]
    expect(dichtstBijEerst(rijen, NU).map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('laat de bronlijst ongemoeid', () => {
    const rijen = [{ id: 'x', date: dag(9) }, { id: 'y', date: dag(-1) }]
    const kopie = [...rijen]
    dichtstBijEerst(rijen, NU)
    expect(rijen).toEqual(kopie)
  })

  it('overleeft een onleesbare datum', () => {
    const rijen = [{ id: 'stuk', date: 'geen datum' }, { id: 'goed', date: dag(1) }]
    expect(dichtstBijEerst(rijen, NU).map((r) => r.id)).toEqual(['goed', 'stuk'])
  })
})
