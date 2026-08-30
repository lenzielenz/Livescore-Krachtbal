import { describe, it, expect } from 'vitest'
import path from 'path'

import { bouwStappen, isVerweesd, resultaatBestand, videoBestand, type AnalyseStand } from '@/lib/cv-analyse'

// De server-side video-analyse: welke Python-stappen draaien er, in welke volgorde, met welke
// argumenten. Een verkeerde vlag hier kost een halfuur rekenwerk voor je het merkt — dus dat
// wordt hier nagerekend zonder ook maar één frame te decoderen.

const OPTS = { stand: 'gewoon' as const, bewegend: false, tracking: false, overlay: false }

function stappen(extra: Partial<Parameters<typeof bouwStappen>[0]> = {}) {
  return bouwStappen({
    matchId: 42,
    video: '/media/clips/abc.mp4',
    map: '/werk',
    kalibratie: '/werk/kalibratie.json',
    opts: OPTS,
    fps: 2,
    ...extra,
  })
}

const namen = (s: ReturnType<typeof bouwStappen>) => s.map((x) => x.naam)
const argvVan = (s: ReturnType<typeof bouwStappen>, deel: string) => {
  const gevonden = s.find((x) => x.naam.toLowerCase().includes(deel.toLowerCase()))
  if (!gevonden) throw new Error(`stap "${deel}" niet gevonden in: ${namen(s).join(' | ')}`)
  return gevonden.argv
}

describe('videoBestand', () => {
  it('vindt een geüploade video terug op schijf', () => {
    const r = videoBestand('/api/clip/abc123.mp4')
    expect('pad' in r && r.pad.endsWith(path.join('clips', 'abc123.mp4'))).toBe(true)
  })

  it('weigert een YouTube-link met uitleg in plaats van een cryptische fout', () => {
    const r = videoBestand('https://youtu.be/ASJ0GRvJ5H0')
    expect('fout' in r).toBe(true)
    expect('fout' in r && r.fout).toMatch(/upload/i)
  })

  it('weigert een pad dat buiten de clips-map probeert te wijzen', () => {
    // Zonder deze grens kan een geknutselde videoUrl elk bestand op de server laten inlezen.
    for (const gemeen of [
      '/api/clip/../../etc/passwd', '/api/clip/a/b.mp4', 'file:///etc/passwd',
      '/api/clip/..', '/api/clip/..mp4..', '/api/clip/.',
    ]) {
      expect('fout' in videoBestand(gemeen)).toBe(true)
    }
  })

  it('zegt het gewoon wanneer er nog geen video hangt', () => {
    const r = videoBestand(null)
    expect('fout' in r && r.fout).toMatch(/nog geen video/i)
  })
})

describe('bouwStappen', () => {
  it('zoekt eerst de worpen en volgt daarna pas de bal', () => {
    const s = stappen()
    const worpen = namen(s).findIndex((n) => n.includes('Kandidaat-worpen'))
    const bal = namen(s).findIndex((n) => n.includes('Bal volgen'))
    expect(worpen).toBeGreaterThanOrEqual(0)
    expect(worpen).toBeLessThan(bal)
  })

  it('laat landing en spelers weg zonder kalibratie — dan is "waar" niet te weten', () => {
    const s = stappen({ kalibratie: null })
    expect(namen(s).some((n) => n.includes('Kandidaat-worpen'))).toBe(true)
    expect(namen(s).some((n) => n.includes('Bal volgen'))).toBe(false)
    expect(namen(s).some((n) => n.includes('Spelers herkennen'))).toBe(false)
  })

  it('zet bij een bewegende camera het veld-volgen vooraan en geeft het spoor door', () => {
    const s = stappen({ opts: { ...OPTS, bewegend: true } })
    expect(namen(s)[0]).toMatch(/veld volgen/i)
    expect(argvVan(s, 'veld volgen')).toContain('--stand')
    const landing = argvVan(s, 'Bal volgen')
    expect(landing).toContain('--homografie')
    expect(landing).toContain(path.join('/werk', 'homografie.jsonl'))
  })

  it('bewaart het balspoor, want zonder dat valt er niets te tonen in de controlevideo', () => {
    expect(argvVan(stappen(), 'Bal volgen')).toContain('--balspoor')
  })

  it('voegt tracking en overlay alleen toe wanneer erom gevraagd is', () => {
    expect(namen(stappen()).some((n) => n.includes('Spelersposities'))).toBe(false)
    expect(namen(stappen()).some((n) => n.includes('Controlevideo'))).toBe(false)
    const alles = stappen({ opts: { ...OPTS, tracking: true, overlay: true } })
    expect(namen(alles).some((n) => n.includes('Spelersposities'))).toBe(true)
    const overlay = argvVan(alles, 'Controlevideo')
    expect(overlay).toContain('--posities')
    expect(overlay).toContain('--lijnen')
  })

  it('geeft de gekozen precisie door aan het volgen', () => {
    const s = stappen({ opts: { ...OPTS, bewegend: true, stand: 'nauwkeurig' } })
    expect(argvVan(s, 'veld volgen')).toContain('nauwkeurig')
  })

  it('leest de voorstellen uit het laatste bestand van de keten', () => {
    expect(resultaatBestand('/werk', '/werk/kalibratie.json', false)).toBe(path.join('/werk', 'met_spelers.jsonl'))
    // Zonder kalibratie stopt de keten bij de detectie — dáár staan de voorstellen dan.
    expect(resultaatBestand('/werk', null, false)).toBe(path.join('/werk', 'detecties.jsonl'))
  })
})

describe('isVerweesd', () => {
  const basis: AnalyseStand = {
    status: 'bezig', stap: 'x', stapNummer: 1, stappen: 3, gestart: new Date().toISOString(),
  }

  it('herkent een taak van een server die intussen herstart is', () => {
    // Zonder deze controle blijft de pagina eeuwig "bezig" tonen voor een proces dat met de
    // container verdwenen is.
    expect(isVerweesd({ ...basis, procesStart: 1 })).toBe(true)
    expect(isVerweesd({ ...basis, status: 'wachtrij', procesStart: 1 })).toBe(true)
  })

  it('laat afgeronde taken met rust', () => {
    expect(isVerweesd({ ...basis, status: 'klaar', procesStart: 1 })).toBe(false)
    expect(isVerweesd({ ...basis, status: 'mislukt', procesStart: 1 })).toBe(false)
    expect(isVerweesd({ ...basis, status: 'afgebroken', procesStart: 1 })).toBe(false)
  })

  it('doet niets zonder stand', () => {
    expect(isVerweesd(null)).toBe(false)
    expect(isVerweesd(undefined)).toBe(false)
  })
})

describe('analyseOmgeving', () => {
  it('meldt netjes wat er ontbreekt in plaats van een taak te starten die stukloopt', async () => {
    // In deze testomgeving staat opencv niet geïnstalleerd; de check hoort dat te zeggen
    // zonder te gooien — de app moet blijven werken op een server zonder analyse-omgeving.
    const { analyseOmgeving } = await import('@/lib/cv-analyse')
    const uitkomst = await analyseOmgeving()
    expect(typeof uitkomst.ok).toBe('boolean')
    if (!uitkomst.ok) {
      expect(uitkomst.melding).toBeTruthy()
      expect(uitkomst.melding).toMatch(/python|opencv/i)
    } else {
      expect(uitkomst.melding).toBeNull()
    }
  })
})
