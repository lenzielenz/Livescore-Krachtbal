import { describe, it, expect } from 'vitest'
import path from 'path'

import { kiesHoldout, labelRegels, trainArgv, type Trainingskandidaat } from '@/lib/cv-training'

// Het model bijstellen op de eigen wedstrijden. Twee dingen moeten hier kloppen, want als ze
// scheef staan is er niets aan te zien: de labels moeten op de júiste videoseconde staan, en de
// holdout moet écht buiten het fitten blijven.

describe('labelRegels', () => {
  const sync = { offsetH1: 30, offsetH2: 1900 }

  it('zet elke worp op zijn videoseconde, in de vorm die de trainer verwacht', () => {
    const regels = labelRegels([{ half: 1, gameClock: 120 }], sync, 1500).split('\n')
    expect(JSON.parse(regels[0])).toEqual({ video_time_s: 150, event_type: 'worp' })
  })

  it('rekent de tweede helft met zijn eigen ijkpunt', () => {
    const regels = labelRegels([{ half: 2, gameClock: 60 }], sync, 1500).split('\n')
    expect(JSON.parse(regels[0]).video_time_s).toBe(1960)
  })

  it('schat de tweede helft door wanneer die niet geijkt is', () => {
    // Zoals momentToVideo: aftrap H2 = aftrap H1 + één helft. Beter een schatting die de
    // gebruiker kan corrigeren dan een label dat stilletjes op 0 staat.
    const regels = labelRegels([{ half: 2, gameClock: 0 }], { offsetH1: 30, offsetH2: null }, 1500)
    expect(JSON.parse(regels).video_time_s).toBe(1530)
  })

  it('zet de worpen op tijd, ook als ze door elkaar binnenkomen', () => {
    const regels = labelRegels(
      [{ half: 2, gameClock: 10 }, { half: 1, gameClock: 10 }],
      sync,
      1500,
    ).split('\n')
    expect(regels.map((r) => JSON.parse(r).video_time_s)).toEqual([40, 1910])
  })

  it('geeft een lege lijst geen regels', () => {
    expect(labelRegels([], sync, 1500)).toBe('')
  })
})

describe('kiesHoldout', () => {
  const k = (matchId: number): Trainingskandidaat => ({
    matchId, reeks: `/w/${matchId}/houding-reeks.jsonl`, labels: `/w/${matchId}/labels.jsonl`,
    worpen: 40, metingen: 3000,
  })

  it('houdt de laatste wedstrijd buiten het fitten', () => {
    expect(kiesHoldout([k(41), k(42), k(43)])).toBe(43)
  })

  it('kan geen holdout kiezen bij één wedstrijd', () => {
    // Dan is er niets om op te meten; de trainer waarschuwt daar zelf luid over.
    expect(kiesHoldout([k(42)])).toBeNull()
    expect(kiesHoldout([])).toBeNull()
  })
})

describe('trainArgv', () => {
  const k = (matchId: number): Trainingskandidaat => ({
    matchId, reeks: `/w/${matchId}/houding-reeks.jsonl`, labels: `/w/${matchId}/labels.jsonl`,
    worpen: 40, metingen: 3000,
  })

  it('geeft elke wedstrijd als een paar reeks+labels mee', () => {
    const argv = trainArgv([k(42), k(43)], 43, '/media/cv-analyse/model-houding.json', '/cv')
    expect(argv[0]).toBe(path.join('/cv', 'train.py'))
    expect(argv.filter((a) => a === '--wedstrijd')).toHaveLength(2)
    expect(argv).toContain('/w/42/houding-reeks.jsonl')
    expect(argv).toContain('/w/42/labels.jsonl')
  })

  it('wijst de holdout aan met het match-id', () => {
    // cv/train.py vergelijkt eerst exact met de mapnaam — zo pakt 42 niet ook 142 mee.
    const argv = trainArgv([k(42), k(142)], 142, '/uit.json', '/cv')
    expect(argv[argv.indexOf('--holdout') + 1]).toBe('142')
  })

  it('laat --holdout weg wanneer er niets apart te houden valt', () => {
    expect(trainArgv([k(42)], null, '/uit.json', '/cv')).not.toContain('--holdout')
  })

  it('schrijft naar het meegegeven pad', () => {
    const argv = trainArgv([k(42)], null, '/media/cv-analyse/model-houding.json', '/cv')
    expect(argv[argv.indexOf('--uit') + 1]).toBe('/media/cv-analyse/model-houding.json')
  })
})
