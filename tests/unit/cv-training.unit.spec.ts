import { describe, it, expect } from 'vitest'
import path from 'path'

import {
  bevestigdeTijden,
  handWorpen,
  kiesHoldout,
  labelRegels,
  trainArgv,
  voegSamen,
  type Trainingskandidaat,
} from '@/lib/cv-training'

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
    worpen: 40, metingen: 3000, bron: 'reviews' as const,
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
    worpen: 40, metingen: 3000, bron: 'reviews' as const,
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

describe('bevestigdeTijden', () => {
  // De labels die géén ijking nodig hebben: wat je op de video zelf bevestigd hebt, staat al op
  // de videotijdlijn.
  it('neemt enkel wat je bevestigd hebt, op tijd gezet', () => {
    expect(
      bevestigdeTijden([
        { videoTimeS: 300, verdict: 'bevestigd' },
        { videoTimeS: 100, verdict: 'bevestigd' },
        { videoTimeS: 200, verdict: 'afgewezen' },
        { videoTimeS: 250, verdict: null },
      ]),
    ).toEqual([100, 300])
  })

  it('negeert een voorstel zonder bruikbare tijd', () => {
    expect(bevestigdeTijden([{ videoTimeS: null, verdict: 'bevestigd' }])).toEqual([])
  })
})

describe('handWorpen', () => {
  // Regressie: de labels uit de ingevoerde worpen namen élke worp mee, ook die met bron
  // 'video' — afgespeeld uit bevestigde CV-voorstellen (cv-overzetten). Dat is modeluitvoer:
  // als label vergelijkt hij het model met zichzelf, en de holdout lekt. Zelfde uitsluiting
  // als de modelscore op de analysepagina.
  it('sluit uit de video-analyse afgespeelde worpen uit als label', () => {
    const worpen = [
      { period: 1, gameClock: 10, bron: 'manueel' },
      { period: 1, gameClock: 20, bron: 'video' },
      { period: 2, gameClock: 30 }, // oude worp zonder bron-veld = handwerk
    ]
    expect(handWorpen(worpen).map((w) => w.gameClock)).toEqual([10, 30])
  })

  it('laat een lijst zonder video-worpen ongemoeid', () => {
    const worpen = [{ gameClock: 5, bron: 'manueel' }]
    expect(handWorpen(worpen)).toEqual(worpen)
  })
})

describe('voegSamen', () => {
  it('labelt dezelfde worp niet twee keer', () => {
    // Een worp die je op de video bevestigde én tijdens de wedstrijd invoerde, is één worp.
    // Twee labels zouden er eentje als "gemist" laten tellen en de recall kunstmatig drukken.
    expect(voegSamen([100, 200], [100.4, 350])).toEqual([100, 200, 350])
  })

  it('houdt twee echte worpen kort na elkaar wél apart', () => {
    expect(voegSamen([100], [105])).toEqual([100, 105])
  })

  it('werkt met een lege kant', () => {
    expect(voegSamen([], [5, 1])).toEqual([1, 5])
    expect(voegSamen([2, 1], [])).toEqual([1, 2])
  })
})
