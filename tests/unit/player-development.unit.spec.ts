import { describe, it, expect } from 'vitest'

import {
  buildPlayerDevelopment,
  fameScore,
  skillScore,
  type PlayerDevInput,
} from '@/lib/player-development'

const base: PlayerDevInput = {
  matches: 0,
  throws: 0,
  goals: 0,
  rug: 0,
  conversion: 0,
  goalAttempts: 0,
  maxDistance: 0,
  zones: { links: 0, midden: 0, rechts: 0 },
  mvpVotesReceived: 0,
}

const earned = (dev: ReturnType<typeof buildPlayerDevelopment>, key: string) =>
  dev.badges.find((b) => b.key === key)?.earned ?? false

describe('player-development — score-formules', () => {
  it('lege speler = beide assen op niveau 1, overall Brons, geen badges', () => {
    const dev = buildPlayerDevelopment(base)
    expect(dev.skill.level).toBe(1)
    expect(dev.skill.levelName).toBe('Rekruut')
    expect(dev.fame.level).toBe(1)
    expect(dev.fame.levelName).toBe('Onbekend')
    expect(dev.overall.tier).toBe('Brons')
    expect(dev.earnedBadges).toBe(0)
  })

  it('skill = worpen + doelpunten*10 + rugworp*5 + afstand*1.5 (conversie pas bij genoeg volume)', () => {
    // Te weinig pogingen → conversie telt niet mee.
    expect(skillScore({ ...base, throws: 10, goals: 2, rug: 1, goalAttempts: 5, conversion: 0.5, maxDistance: 20 })).toBe(
      10 + 20 + 5 + 0 + 30,
    )
    // Genoeg pogingen → conversie telt mee (0.5 * 80 = 40).
    expect(skillScore({ ...base, throws: 10, goals: 2, rug: 1, goalAttempts: 12, conversion: 0.5, maxDistance: 20 })).toBe(
      10 + 20 + 5 + 40 + 30,
    )
  })

  it('fame = ontvangen MVP-stemmen*6 + doelpunten*3 + wedstrijden*2', () => {
    expect(fameScore({ ...base, mvpVotesReceived: 4, goals: 5, matches: 10 })).toBe(24 + 15 + 20)
  })

  it('negatieve/ongeldige input wordt geklemd op 0', () => {
    expect(skillScore({ ...base, throws: -5, goals: -2 })).toBe(0)
    expect(fameScore({ ...base, mvpVotesReceived: -3 })).toBe(0)
  })
})

describe('player-development — niveaus', () => {
  it('stijgt mee met de score en berekent de voortgang naar het volgende niveau', () => {
    // skill 60 = exact niveau 2 (Werper), 0% naar niveau 3.
    const dev = buildPlayerDevelopment({ ...base, throws: 60 })
    expect(dev.skill.score).toBe(60)
    expect(dev.skill.level).toBe(2)
    expect(dev.skill.levelName).toBe('Werper')
    expect(dev.skill.pct).toBe(0)
    expect(dev.skill.nextAt).toBe(180)
  })

  it('het hoogste niveau is "maxed" (geen volgend niveau, 100%)', () => {
    const dev = buildPlayerDevelopment({ ...base, throws: 5000 })
    expect(dev.skill.levelName).toBe('Legende')
    expect(dev.skill.maxed).toBe(true)
    expect(dev.skill.nextAt).toBeNull()
    expect(dev.skill.pct).toBe(100)
  })
})

describe('player-development — badges', () => {
  it('telbare badges schakelen op de drempel', () => {
    expect(earned(buildPlayerDevelopment({ ...base, goals: 4 }), 'goals5')).toBe(false)
    expect(earned(buildPlayerDevelopment({ ...base, goals: 5 }), 'goals5')).toBe(true)
    expect(earned(buildPlayerDevelopment({ ...base, mvpVotesReceived: 25 }), 'mvp25')).toBe(true)
  })

  it('scherpschutter vereist 40%+ conversie én minstens 20 pogingen', () => {
    expect(earned(buildPlayerDevelopment({ ...base, conversion: 0.5, goalAttempts: 10 }), 'sharp')).toBe(false)
    expect(earned(buildPlayerDevelopment({ ...base, conversion: 0.45, goalAttempts: 20 }), 'sharp')).toBe(true)
  })

  it('afstandsbadges en alzijdig-badge', () => {
    expect(earned(buildPlayerDevelopment({ ...base, maxDistance: 36 }), 'range35')).toBe(true)
    expect(earned(buildPlayerDevelopment({ ...base, maxDistance: 36 }), 'range45')).toBe(false)
    expect(earned(buildPlayerDevelopment({ ...base, maxDistance: 46 }), 'range45')).toBe(true)
    expect(earned(buildPlayerDevelopment({ ...base, zones: { links: 1, midden: 1, rechts: 1 } }), 'allzones')).toBe(true)
    expect(earned(buildPlayerDevelopment({ ...base, zones: { links: 1, midden: 0, rechts: 1 } }), 'allzones')).toBe(false)
  })

  it('een sterke speler verzamelt meerdere badges en een hogere tier', () => {
    const dev = buildPlayerDevelopment({
      matches: 30,
      throws: 1200,
      goals: 80,
      rug: 22,
      conversion: 0.45,
      goalAttempts: 180,
      maxDistance: 48,
      zones: { links: 10, midden: 12, rechts: 14 },
      mvpVotesReceived: 110,
    })
    expect(dev.earnedBadges).toBeGreaterThanOrEqual(12)
    expect(dev.overall.level).toBeGreaterThanOrEqual(5)
    expect(['Diamant', 'Legende']).toContain(dev.overall.tier)
  })
})
