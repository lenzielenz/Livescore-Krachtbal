import { describe, expect, it } from 'vitest'

import { createFlightGuard, createLimiter } from '@/lib/concurrency'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('createLimiter — nooit meer dan `max` taken tegelijk', () => {
  it('houdt het aantal gelijktijdige taken onder de grens en laat er geen vallen', async () => {
    const run = createLimiter(2)
    let nu = 0
    let piek = 0
    const klaar: number[] = []
    const taak = (i: number) =>
      run(async () => {
        nu += 1
        piek = Math.max(piek, nu)
        await tick()
        await tick()
        nu -= 1
        klaar.push(i)
        return i
      })

    const uitkomst = await Promise.all(Array.from({ length: 10 }, (_, i) => taak(i)))

    expect(piek).toBe(2)
    expect(uitkomst).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) // elke taak krijgt zijn eigen uitkomst
    expect(klaar).toHaveLength(10)
  })

  it('een mislukte taak geeft zijn plaats door en geeft de fout aan de aanroeper', async () => {
    const run = createLimiter(1)
    const faal = run(async () => {
      throw new Error('stuk')
    })
    const daarna = run(async () => 'ok')
    await expect(faal).rejects.toThrow('stuk')
    await expect(daarna).resolves.toBe('ok')
    // en de rij is daarna weer leeg: een nieuwe taak start meteen
    await expect(run(async () => 'nog een')).resolves.toBe('nog een')
  })

  it('een grens onder 1 wordt 1 (geen vastgelopen rij)', async () => {
    const run = createLimiter(0)
    await expect(run(async () => 'ok')).resolves.toBe('ok')
  })
})

describe('createFlightGuard — één poll tegelijk', () => {
  it('slaat een tick over zolang de vorige loopt, en laat de volgende door na leave', () => {
    const g = createFlightGuard(15_000, () => 0)
    const a = g.enter()
    expect(a).not.toBeNull()
    expect(g.busy).toBe(true)
    expect(g.enter()).toBeNull() // overlap → overslaan
    g.leave(a)
    expect(g.busy).toBe(false)
    expect(g.enter()).not.toBeNull()
  })

  it('geeft na maxMs toch door (noodgreep tegen één vastgelopen poll), en de oude leave breekt de nieuwe niet', () => {
    let t = 0
    const g = createFlightGuard(1000, () => t)
    const oud = g.enter()
    t = 999
    expect(g.enter()).toBeNull()
    t = 1000
    const nieuw = g.enter()
    expect(nieuw).not.toBeNull()
    g.leave(oud) // de vastgelopen poll eindigt eindelijk — mag de lopende nieuwe niet vrijgeven
    expect(g.enter()).toBeNull()
    g.leave(nieuw)
    expect(g.enter()).not.toBeNull()
  })
})
