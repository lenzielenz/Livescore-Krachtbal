import { describe, it, expect } from 'vitest'

import {
  FIELD,
  distanceM,
  goalLineNorm,
  isInTargetGoalArea,
  isOnOwnHalf,
  isOutBack,
  isOutSide,
  isOpDoellijn,
  projectWerpplaats,
  reachedMidline,
  toMeters,
  totalLengthM,
  zoneOf,
} from '@/lib/field'

describe('field — meters & afstand', () => {
  it('zet genormaliseerde coördinaten om naar meters', () => {
    expect(toMeters({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(toMeters({ x: 1, y: 1 })).toEqual({ x: FIELD.widthM, y: totalLengthM() })
    expect(toMeters({ x: 0.5, y: 0.5 })).toEqual({ x: 7, y: 23 })
  })

  it('diepere doelgebieden → langere veldlengte → grotere afstand', () => {
    // 15 m doelgebieden → totaal 56 m i.p.v. 46 m
    expect(totalLengthM(15)).toBe(56)
    expect(distanceM({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, 15)).toBeCloseTo(56)
  })

  it('berekent hemelsbrede afstand', () => {
    // volledige lengte
    expect(distanceM({ x: 0.5, y: 0 }, { x: 0.5, y: 1 })).toBeCloseTo(46)
    // volledige breedte
    expect(distanceM({ x: 0, y: 0.5 }, { x: 1, y: 0.5 })).toBeCloseTo(14)
    // diagonaal 3-4-5
    expect(distanceM({ x: 0, y: 0 }, { x: 3 / 14, y: 4 / 46 })).toBeCloseTo(5)
  })
})

describe('field — zone (perspectief aanvallende ploeg)', () => {
  it('verdeelt de breedte in derden', () => {
    expect(zoneOf({ x: 0.1, y: 0.5 }, 'up')).toBe('links')
    expect(zoneOf({ x: 0.5, y: 0.5 }, 'up')).toBe('midden')
    expect(zoneOf({ x: 0.9, y: 0.5 }, 'up')).toBe('rechts')
  })

  it('spiegelt links/rechts bij tegengestelde richting', () => {
    expect(zoneOf({ x: 0.1, y: 0.5 }, 'down')).toBe('rechts')
    expect(zoneOf({ x: 0.9, y: 0.5 }, 'down')).toBe('links')
  })
})

describe('field — helften & middellijn', () => {
  it('bepaalt eigen helft afhankelijk van richting', () => {
    expect(isOnOwnHalf({ x: 0.5, y: 0.2 }, 'up')).toBe(true) // y<23m
    expect(isOnOwnHalf({ x: 0.5, y: 0.8 }, 'up')).toBe(false)
    expect(isOnOwnHalf({ x: 0.5, y: 0.8 }, 'down')).toBe(true)
  })

  it('detecteert raken/overschrijden van de middellijn', () => {
    expect(reachedMidline({ x: 0.5, y: 0.6 }, 'up')).toBe(true)
    expect(reachedMidline({ x: 0.5, y: 0.4 }, 'up')).toBe(false)
    expect(reachedMidline({ x: 0.5, y: 23 / 46 }, 'up')).toBe(true) // exact op de lijn
  })
})

describe('field — doelgebied & buiten', () => {
  it('herkent het aangevallen doelgebied', () => {
    expect(isInTargetGoalArea({ x: 0.5, y: 0.95 }, 'up')).toBe(true) // y>36m
    expect(isInTargetGoalArea({ x: 0.5, y: 0.5 }, 'up')).toBe(false)
    expect(isInTargetGoalArea({ x: 0.5, y: 0.05 }, 'down')).toBe(true) // y<10m
  })

  it('herkent buiten zijlijn en achterlijn', () => {
    expect(isOutSide({ x: -0.01, y: 0.5 })).toBe(true)
    expect(isOutSide({ x: 1.01, y: 0.5 })).toBe(true)
    expect(isOutSide({ x: 0.5, y: 0.5 })).toBe(false)
    expect(isOutBack({ x: 0.5, y: 1.02 }, 'up')).toBe(true)
    expect(isOutBack({ x: 0.5, y: -0.02 }, 'down')).toBe(true)
    expect(isOutBack({ x: 0.5, y: 1.02 }, 'down')).toBe(false)
  })
})

describe('field — werpplaats-projectie (§6.4)', () => {
  // Standaardveld: 10 m doelgebied → totaal 46 m. Doellijn op 10/46, vrijeworplijn op 14/46.
  const g = 10 / 46
  const ft = 14 / 46

  it('schuift een werpplaats tussen doellijn en vrijeworplijn terug tot op de vrijeworplijn', () => {
    expect(projectWerpplaats({ x: 0.3, y: 12 / 46 }).y).toBeCloseTo(ft, 6)
    expect(projectWerpplaats({ x: 0.3, y: 34 / 46 }).y).toBeCloseTo(1 - ft, 6)
  })

  it('behoudt de breedte (loodrechte projectie)', () => {
    expect(projectWerpplaats({ x: 0.17, y: 11 / 46 }).x).toBe(0.17)
  })

  it('laat punten op of voorbij de vrijeworplijn ongemoeid', () => {
    expect(projectWerpplaats({ x: 0.5, y: ft }).y).toBeCloseTo(ft, 6)
    expect(projectWerpplaats({ x: 0.5, y: 0.5 }).y).toBe(0.5)
    expect(projectWerpplaats({ x: 0.5, y: 1 - ft }).y).toBeCloseTo(1 - ft, 6)
  })

  it('raakt punten in het doelgebied niet aan (dat is een doelpunt, geen werpplaats)', () => {
    expect(projectWerpplaats({ x: 0.5, y: 0.02 }).y).toBe(0.02)
    expect(projectWerpplaats({ x: 0.5, y: 0.98 }).y).toBe(0.98)
    expect(projectWerpplaats({ x: 0.5, y: g }).y).toBeCloseTo(ft, 6) // exact op de doellijn = wél
  })

  // §6.4: "De doellijn is enkel beperkend bij opzet uit het doelgebied." Wordt de bal ín het
  // doelgebied gevangen, dan zet de ploeg op vanaf de DOELLIJN — de werpplaats mag dan niet
  // doorschuiven naar de vrijeworplijn (vier meter te ver).
  it('laat een opzet vanaf de doellijn (vangst in het doelgebied) staan waar hij staat', () => {
    expect(projectWerpplaats({ x: 0.5, y: g }, undefined, { vanuitDoelgebied: true }).y).toBeCloseTo(g, 6)
    expect(projectWerpplaats({ x: 0.5, y: 1 - g }, undefined, { vanuitDoelgebied: true }).y).toBeCloseTo(1 - g, 6)
  })

  it('herkent een opzetpunt op de doellijn, aan beide kanten en bij elke doelgebiedsdiepte', () => {
    expect(isOpDoellijn({ x: 0.5, y: g })).toBe(true)
    expect(isOpDoellijn({ x: 0.5, y: 1 - g })).toBe(true)
    expect(isOpDoellijn({ x: 0.5, y: ft })).toBe(false)
    expect(isOpDoellijn({ x: 0.5, y: 0.5 })).toBe(false)
    expect(isOpDoellijn({ x: 0.5, y: goalLineNorm(15) }, 15)).toBe(true)
  })

  it('volgt een diepere doelgebied-instelling (15 m → totaal 56 m)', () => {
    const ft15 = 19 / 56
    expect(projectWerpplaats({ x: 0.5, y: 17 / 56 }, 15).y).toBeCloseTo(ft15, 6)
    expect(projectWerpplaats({ x: 0.5, y: 0.5 }, 15).y).toBe(0.5)
  })
})

describe('field — echte terreinmaten (veldMaten)', () => {
  // Opgemeten terrein: 12 m breed, speelveld 24 m, doelgebied 10 m → totaal 44 m.
  const maten = { breedteM: 12, speelveldM: 24 }

  it('rekent meters op de echte breedte en lengte', () => {
    expect(totalLengthM(10, maten)).toBe(44)
    const m = toMeters({ x: 1, y: 1 }, 10, maten)
    expect(m.x).toBeCloseTo(12, 6)
    expect(m.y).toBeCloseTo(44, 6)
  })

  it('meet worpafstand op het echte veld korter dan op een reglementair veld', () => {
    const van = { x: 0.5, y: 0.25 }
    const naar = { x: 0.5, y: 0.75 }
    expect(distanceM(van, naar, 10, maten)).toBeCloseTo(22, 6)
    expect(distanceM(van, naar, 10)).toBeCloseTo(23, 6)
  })

  it('legt doellijn en doelgebied op de echte lengte', () => {
    expect(goalLineNorm(10, maten)).toBeCloseTo(10 / 44, 6)
    // y = 35 m: reglementair nog spelersveld (doellijn op 36), op het korte veld doelgebied.
    expect(isInTargetGoalArea({ x: 0.5, y: 35 / 44 }, 'up', 10, maten)).toBe(true)
    expect(isInTargetGoalArea({ x: 0.5, y: 35 / 46 }, 'up', 10)).toBe(false)
  })

  it('projecteert de werpplaats naar de vrijeworplijn van het echte veld', () => {
    const ft = 14 / 44
    expect(projectWerpplaats({ x: 0.5, y: 12 / 44 }, 10, { maten }).y).toBeCloseTo(ft, 6)
    expect(isOpDoellijn({ x: 0.5, y: 10 / 44 }, 10, maten)).toBe(true)
  })

  it('valt zonder maten terug op het reglementaire veld', () => {
    expect(totalLengthM(10)).toBe(FIELD.playingLengthM + 20)
    expect(distanceM({ x: 0, y: 0 }, { x: 1, y: 0 }, 10)).toBeCloseTo(FIELD.widthM, 6)
  })
})
