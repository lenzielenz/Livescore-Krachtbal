import { describe, it, expect } from 'vitest'

import type { TrainingMeting } from '@/lib/training-metrics'
import { buildPlayerTrainingPlan, buildTeamTrainingPlan, trainingPhase } from '@/lib/training-plan'

const meting = (datum: string, vals: Partial<Record<keyof TrainingMeting, number>>): TrainingMeting => ({
  speler: 1,
  datum,
  snelheidVooruit: vals.snelheidVooruit ?? null,
  snelheidAchteruit: vals.snelheidAchteruit ?? null,
  worp4: vals.worp4 ?? null,
  worp9: vals.worp9 ?? null,
  worp18: vals.worp18 ?? null,
})

describe('trainingPhase', () => {
  it('kiest voorbereiding in de zomer en competitie in het seizoen', () => {
    expect(trainingPhase(new Date('2026-07-15')).key).toBe('voorbereiding')
    expect(trainingPhase(new Date('2026-11-15')).key).toBe('competitie')
    expect(trainingPhase(new Date('2026-05-15')).key).toBe('uitloop')
  })
})

describe('buildPlayerTrainingPlan', () => {
  it('beoordeelt metrieken t.o.v. doel en persoonlijk record', () => {
    const plan = buildPlayerTrainingPlan({
      name: 'Jan',
      shirtNumber: 7,
      metingen: [meting('2026-01-01', { worp18: 20 }), meting('2026-02-01', { worp18: 22 })],
      goals: [{ metriek: 'worp18', doel: 20 }],
      now: new Date('2026-11-01'),
    })
    const w18 = plan.assessment.find((a) => a.key === 'worp18')!
    expect(w18.best).toBe(22)
    expect(w18.latest).toBe(22)
    expect(w18.status).toBe('sterk') // best (22) >= doel (20)
  })

  it('markeert een metriek onder doel als werkpunt en kiest worpkracht als focus', () => {
    const plan = buildPlayerTrainingPlan({
      name: 'Piet',
      metingen: [meting('2026-01-01', { worp18: 14 })],
      goals: [{ metriek: 'worp18', doel: 20 }], // 14 < 18 → werkpunt
      now: new Date('2026-11-01'),
    })
    expect(plan.assessment.find((a) => a.key === 'worp18')?.status).toBe('werkpunt')
    expect(plan.focus.some((f) => f.domain === 'worpkracht')).toBe(true)
    // Een trainingsweek met drie sessies vol oefeningen.
    expect(plan.week).toHaveLength(3)
    expect(plan.week.every((s) => s.drills.length > 0)).toBe(true)
  })

  it('stelt een progressief doel voor boven het huidige record', () => {
    const plan = buildPlayerTrainingPlan({
      name: 'Sam',
      metingen: [meting('2026-01-01', { worp18: 18 })],
      goals: [],
      now: new Date('2026-07-01'),
      hints: { avgDistance: 9 },
    })
    const t = plan.targets.find((x) => x.key === 'worp18')
    expect(t).toBeTruthy()
    expect(t!.target).toBeGreaterThan(18)
  })

  it('gebruikt matchdata: lage conversie → focus afwerking', () => {
    const plan = buildPlayerTrainingPlan({
      name: 'Tom',
      metingen: [meting('2026-01-01', { worp9: 16 })],
      goals: [],
      now: new Date('2026-11-01'),
      hints: { conversion: 0.3 },
    })
    expect(plan.focus.some((f) => f.domain === 'afwerking')).toBe(true)
  })

  it('werkt zonder enige meting (geen-data, toch een plan)', () => {
    const plan = buildPlayerTrainingPlan({ name: 'Leeg', metingen: [], goals: [], now: new Date('2026-11-01') })
    expect(plan.assessment.every((a) => a.status === 'geen-data')).toBe(true)
    expect(plan.focus.length).toBeGreaterThanOrEqual(1)
    expect(plan.week).toHaveLength(3)
  })
})

describe('buildTeamTrainingPlan', () => {
  it('aggregeert de werkpunten van de selectie tot een ploegfocus', () => {
    const plan = buildTeamTrainingPlan({
      squad: [
        { name: 'A', metingen: [meting('2026-01-01', { worp18: 14 })], goals: [{ metriek: 'worp18', doel: 22 }] },
        { name: 'B', metingen: [meting('2026-01-01', { worp18: 15 })], goals: [{ metriek: 'worp18', doel: 22 }] },
      ],
      now: new Date('2026-11-01'),
    })
    expect(plan.players).toBe(2)
    expect(plan.focus.some((f) => f.domain === 'worpkracht')).toBe(true)
    expect(plan.spread[0].count).toBeGreaterThanOrEqual(1)
    expect(plan.week).toHaveLength(3)
  })
})
