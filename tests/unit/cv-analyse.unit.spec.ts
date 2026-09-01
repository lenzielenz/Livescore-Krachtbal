import { describe, it, expect } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  bruikbareBeelden,
  leesVoortgang,
  leesVolgrapport,
  bouwKandidaten,
  bouwStappen,
  isVerweesd,
  resultaatBestand,
  spawnOmgeving,
  videoBestand,
  type AnalyseStand,
} from '@/lib/cv-analyse'
import { modelCacheMap } from '@/lib/cv-runtime'

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
    const bal = namen(s).findIndex((n) => n.includes('landingszone'))
    expect(worpen).toBeGreaterThanOrEqual(0)
    expect(worpen).toBeLessThan(bal)
  })

  it('laat landing en spelers weg zonder kalibratie — dan is "waar" niet te weten', () => {
    const s = stappen({ kalibratie: null })
    expect(namen(s).some((n) => n.includes('Kandidaat-worpen'))).toBe(true)
    expect(namen(s).some((n) => n.includes('landingszone'))).toBe(false)
    expect(namen(s).some((n) => n.includes('Spelers herkennen'))).toBe(false)
  })

  it('zet bij een bewegende camera het veld-volgen vooraan en geeft het spoor door', () => {
    const s = stappen({ opts: { ...OPTS, bewegend: true } })
    expect(namen(s)[0]).toMatch(/veld volgen/i)
    expect(argvVan(s, 'veld volgen')).toContain('--stand')
    const landing = argvVan(s, 'landingszone')
    expect(landing).toContain('--homografie')
    expect(landing).toContain(path.join('/werk', 'homografie.jsonl'))
  })

  it('bewaart het balspoor, want zonder dat valt er niets te tonen in de controlevideo', () => {
    expect(argvVan(stappen(), 'landingszone')).toContain('--balspoor')
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

describe('bouwKandidaten', () => {
  it('laat CV_PYTHON alleen beslissen — dat is een keuze van wie de server beheert', () => {
    const k = bouwKandidaten({ cvPython: '/eigen/python', venvPython: '/opt/cv-venv/bin/python3' })
    expect(k).toEqual([{ pad: '/eigen/python', pythonpath: null }])
  })

  it('neemt de omgeving van het volume vóór alle andere', () => {
    // Die is bewust door iemand geïnstalleerd; een toevallige python3 in het PATH niet.
    const k = bouwKandidaten({
      volumePython: '/data/cv-runtime/python/bin/python3',
      volumePakketten: '/data/cv-runtime/pakketten',
      venvPython: '/opt/cv-venv/bin/python3',
    })
    expect(k[0]).toEqual({ pad: '/data/cv-runtime/python/bin/python3', pythonpath: '/data/cv-runtime/pakketten' })
    expect(k[1]).toEqual({ pad: '/opt/cv-venv/bin/python3', pythonpath: null })
  })

  it('probeert de venv eerst, dan het systeem-python mét de pakketten uit de venv', () => {
    // Die tweede kandidaat is de redding wanneer de venv wél meekomt in het eindbeeld maar de
    // interpreter waar hij naar wijst niet: de pakketten zijn er dan nog steeds.
    const k = bouwKandidaten({
      venvPython: '/opt/cv-venv/bin/python3',
      sitePackages: '/opt/cv-venv/lib/python3.12/site-packages',
    })
    expect(k).toEqual([
      { pad: '/opt/cv-venv/bin/python3', pythonpath: null },
      { pad: 'python3', pythonpath: '/opt/cv-venv/lib/python3.12/site-packages' },
      { pad: 'python3', pythonpath: null },
    ])
  })

  it('houdt zonder venv gewoon het systeem-python over', () => {
    expect(bouwKandidaten({})).toEqual([{ pad: 'python3', pythonpath: null }])
  })
})

describe('spawnOmgeving', () => {
  it('zet PYTHONPATH alleen wanneer de pakketten ergens anders staan', () => {
    expect(spawnOmgeving({ pad: 'python3', pythonpath: null }).PYTHONPATH).toBe(process.env.PYTHONPATH)
    expect(spawnOmgeving({ pad: 'python3', pythonpath: '/pakketten' }).PYTHONPATH).toBe('/pakketten')
  })

  it('wijst de modelcache naar het volume', () => {
    // Zonder dit haalt het houdingsmodel na elke uitrol opnieuw 100 MB gewichten op — midden
    // in een analyse, zonder dat iemand ziet waarom het zo lang duurt.
    const env = spawnOmgeving({ pad: 'python3', pythonpath: null })
    expect(env.XDG_CACHE_HOME).toBe(modelCacheMap())
    expect(env.XDG_CACHE_HOME).toContain('cv-runtime')
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

describe('bruikbareBeelden', () => {
  it('houdt alleen beelden over die op zichzelf een veld vastleggen (4+ punten)', () => {
    const p = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `l${i}`, x: i, y: i }))
    const uit = bruikbareBeelden({ beelden: [
      { tijd: 12, punten: p(6) },
      { tijd: 3, punten: p(2) },   // te weinig om een matrix uit te fitten
      { tijd: 40, punten: p(4) },
    ] })
    expect(uit.map((b) => b.tijd)).toEqual([12, 40])
  })

  it('leest een oude kalibratie zonder ijkbeelden als één beeld op seconde 0', () => {
    const punten = Array.from({ length: 5 }, (_, i) => ({ label: `l${i}`, x: i, y: i }))
    expect(bruikbareBeelden({ punten })).toEqual([{ tijd: 0, punten }])
  })

  it('geeft niets terug wanneer er nergens genoeg punten staan', () => {
    expect(bruikbareBeelden(null)).toEqual([])
    expect(bruikbareBeelden({ punten: [{ label: 'a', x: 1, y: 1 }] })).toEqual([])
  })
})

describe('bouwStappen met ijkbeelden', () => {
  it('geeft de ankers door in plaats van één kalibratie bij een bewegende camera', () => {
    // Dít is de bug die het oploste: een ijkbeeld op 6:27 werd stilzwijgend op seconde 0
    // geplakt. Met --ankers hoort elke matrix bij zijn eigen moment.
    const s = bouwStappen({
      matchId: 42, video: '/v.mp4', map: '/werk', kalibratie: '/werk/kalibratie.json',
      ankers: '/werk/ankers.json', opts: { ...OPTS, bewegend: true }, fps: 2,
    })
    const argv = argvVan(s, 'veld volgen')
    expect(argv).toContain('--ankers')
    expect(argv).toContain('/werk/ankers.json')
    expect(argv).not.toContain('--kalibratie')
  })

  it('valt terug op de gewone kalibratie zonder ankers', () => {
    const s = bouwStappen({
      matchId: 42, video: '/v.mp4', map: '/werk', kalibratie: '/werk/kalibratie.json',
      ankers: null, opts: { ...OPTS, bewegend: true }, fps: 2,
    })
    expect(argvVan(s, 'veld volgen')).toContain('--kalibratie')
  })
})

describe('leesVolgrapport', () => {
  it('haalt de onderbrekingen en de ongemeten stukken uit het rapport van het volgen', async () => {
    const map = await fs.mkdtemp(path.join(os.tmpdir(), 'volg-'))
    try {
      await fs.writeFile(
        path.join(map, 'homografie.jsonl.rapport.json'),
        JSON.stringify({ breuken: [723.5], gaten: [[723.5, 1040.0]], momenten: 4200 }),
      )
      expect(await leesVolgrapport(map)).toEqual({ onderbrekingen: [723.5], gaten: [[723.5, 1040.0]] })
    } finally {
      await fs.rm(map, { recursive: true, force: true })
    }
  })

  it('zwijgt wanneer er niet gevolgd is (vaste camera) — geen rapport, geen melding', async () => {
    const map = await fs.mkdtemp(path.join(os.tmpdir(), 'volg-'))
    try {
      expect(await leesVolgrapport(map)).toEqual({})
    } finally {
      await fs.rm(map, { recursive: true, force: true })
    }
  })

  it('meldt niets bij een opname zonder onderbrekingen', async () => {
    const map = await fs.mkdtemp(path.join(os.tmpdir(), 'volg-'))
    try {
      await fs.writeFile(path.join(map, 'homografie.jsonl.rapport.json'), JSON.stringify({ breuken: [], gaten: [] }))
      expect(await leesVolgrapport(map)).toEqual({})
    } finally {
      await fs.rm(map, { recursive: true, force: true })
    }
  })
})

describe('argumenten van de worpdetectie', () => {
  it('geeft de precisiekeuze door als metingen per seconde', () => {
    // Dit ging mis: de app gaf '--fps 2' mee, maar dat argument vult enkel het frame-nummer
    // in. De detector keek dus altijd op zijn standaardinstelling, en elk voorstel kreeg een
    // frame-nummer alsof de video 2 beelden per seconde had.
    const argv = argvVan(stappen({ fps: 10 }), 'Kandidaat-worpen')
    expect(argv).toContain('--analyse-fps')
    expect(argv[argv.indexOf('--analyse-fps') + 1]).toBe('10')
    expect(argv).not.toContain('--fps')
  })
})

describe('worpen zoeken met het houdingsmodel', () => {
  it('gebruikt houding.py in plaats van de beeldverschil-spotter', () => {
    const s = stappen({ opts: { ...OPTS, ai: true }, fps: 10 })
    const namenLijst = namen(s)
    expect(namenLijst.some((n) => n.includes('houding'))).toBe(true)
    expect(namenLijst.some((n) => n.includes('Kandidaat-worpen'))).toBe(false)
    const argv = argvVan(s, 'houding')
    expect(argv[0]).toMatch(/houding\.py$/)
    expect(argv).toContain('--analyse-fps')
  })

  it('laat de precisiekeuze echt meetellen — anders kost snel evenveel als nauwkeurig', () => {
    // Dit is de duurste stap van de keten: het aantal beelden én de modelgrootte bepalen samen
    // of een wedstrijdvideo tien minuten of drie uur kost. Eerder stonden ze allebei vast.
    const van = (stand: 'snel' | 'gewoon' | 'nauwkeurig') =>
      argvVan(stappen({ opts: { ...OPTS, ai: true, stand } }), 'houding')
    const fpsVan = (a: string[]) => Number(a[a.indexOf('--analyse-fps') + 1])
    const modeVan = (a: string[]) => a[a.indexOf('--mode') + 1]

    expect(fpsVan(van('snel'))).toBeLessThan(fpsVan(van('gewoon')))
    expect(fpsVan(van('gewoon'))).toBeLessThan(fpsVan(van('nauwkeurig')))
    expect(modeVan(van('snel'))).toBe('lightweight')
    expect(modeVan(van('gewoon'))).toBe('balanced')
    expect(modeVan(van('nauwkeurig'))).toBe('performance')
  })

  it('meet nooit zo grof dat een worp onzichtbaar wordt', () => {
    // De loslaatfase duurt ~0,08 s en wordt gemeten over een venster van 0,08-0,22 s. Onder de
    // 5 metingen per seconde valt er geen enkel venster binnen die band en zie je de worp niet.
    for (const stand of ['snel', 'gewoon', 'nauwkeurig', 'ultra'] as const) {
      const argv = argvVan(stappen({ opts: { ...OPTS, ai: true, stand } }), 'houding')
      expect(Number(argv[argv.indexOf('--analyse-fps') + 1])).toBeGreaterThanOrEqual(5)
    }
  })

  it('kijkt op élke stand elk beeld na rond de kandidaten', () => {
    // Geen luxe voor de fijne standen maar een invariant: de beslissing valt altijd op metingen
    // van volle beeldfrequentie. Anders heeft elke stand zijn eigen schaal — dezelfde worp
    // piekt op 0,31 bij 5 metingen/s en op 0,47 vanaf 20/s — en betekent één getrainde drempel
    // op de ene stand iets anders dan op de andere.
    for (const stand of ['snel', 'gewoon', 'nauwkeurig', 'ultra'] as const) {
      const argv = argvVan(stappen({ opts: { ...OPTS, ai: true, stand } }), 'houding')
      expect(argv).toContain('--twee-passages')
    }
  })

  it('zoekt met een model dat niet zwaarder is dan waarmee het nakijkt', () => {
    // Klein zoeken en groot nakijken mag; groot zoeken en klein nakijken is het omgekeerde van
    // wat de tweede passage moet doen — dan is nakijken een verslechtering.
    const rang = { lightweight: 0, balanced: 1, performance: 2 } as const
    for (const stand of ['snel', 'gewoon', 'nauwkeurig', 'ultra'] as const) {
      const a = argvVan(stappen({ opts: { ...OPTS, ai: true, stand } }), 'houding')
      const zoek = a[a.indexOf('--zoek-mode') + 1] as keyof typeof rang
      const na = a[a.indexOf('--mode') + 1] as keyof typeof rang
      expect(rang[zoek]).toBeLessThanOrEqual(rang[na])
    }
  })

  it('schrijft naar hetzelfde bestand, zodat de rest van de keten niets merkt', () => {
    const metAi = argvVan(stappen({ opts: { ...OPTS, ai: true } }), 'houding')
    const zonder = argvVan(stappen(), 'Kandidaat-worpen')
    expect(metAi[metAi.indexOf('--uit') + 1]).toBe(zonder[zonder.indexOf('--uit') + 1])
  })

  it('bewaart de meetreeks — anders moet je voor elke bijstelling opnieuw uren video kijken', () => {
    const argv = argvVan(stappen({ opts: { ...OPTS, ai: true } }), 'houding')
    const pad = argv[argv.indexOf('--reeks-uit') + 1]
    expect(pad).toMatch(/houding-reeks\.jsonl$/)
    // In de werkmap van deze wedstrijd, naast de andere tussenbestanden: die map staat op het
    // volume en overleeft dus de analyse. Trainingsdata in /tmp is trainingsdata die weg is.
    expect(pad.startsWith('/werk/')).toBe(true)
  })
})

describe('de ultra-stand', () => {
  // "Ultra" is geen vierde tandje maar een andere afspraak: je zet ze aan vóór je gaat slapen.
  // Elke stap die kwaliteit tegen rekentijd ruilt, hoort dan naar de kwaliteitskant te gaan —
  // een ultra die stiekem hetzelfde doet als 'gewoon' is een nacht wachten voor niets.
  it('kijkt fijner én met het zwaarste model naar de houding', () => {
    const argv = argvVan(stappen({ opts: { ...OPTS, ai: true, stand: 'ultra' } }), 'houding')
    expect(Number(argv[argv.indexOf('--analyse-fps') + 1])).toBeGreaterThanOrEqual(15)
    expect(argv[argv.indexOf('--mode') + 1]).toBe('performance')
  })

  it('volgt het veld op de fijnste stand', () => {
    const argv = argvVan(stappen({ opts: { ...OPTS, bewegend: true, stand: 'ultra' } }), 'veld volgen')
    expect(argv[argv.indexOf('--stand') + 1]).toBe('ultra')
  })

  it('geeft de balbaan meer kansen om de bal terug te vinden', () => {
    const rondesVan = (stand: 'gewoon' | 'ultra') => {
      const a = argvVan(stappen({ opts: { ...OPTS, stand } }), 'worpbaan')
      return Number(a[a.indexOf('--rondes') + 1])
    }
    expect(rondesVan('ultra')).toBeGreaterThan(rondesVan('gewoon'))
  })

  it('bemonstert de spelerstracking dichter — anders zijn er geen sprintjes te zien', () => {
    const fpsVan = (stand: 'gewoon' | 'ultra') => {
      const a = argvVan(stappen({ opts: { ...OPTS, tracking: true, stand } }), 'Spelersposities')
      return Number(a[a.indexOf('--fps') + 1])
    }
    expect(fpsVan('ultra')).toBeGreaterThan(fpsVan('gewoon'))
  })
})

describe('de bal als worpbaan', () => {
  it('zoekt de balbanen vóór de landing berekend wordt', () => {
    const s = stappen()
    const baan = namen(s).findIndex((n) => n.includes('worpbaan'))
    const landing = namen(s).findIndex((n) => n.includes('landingszone'))
    expect(baan).toBeGreaterThanOrEqual(0)
    expect(baan).toBeLessThan(landing)
  })

  it('geeft die banen door aan de landingsberekening', () => {
    const argv = argvVan(stappen(), 'landingszone')
    expect(argv).toContain('--balbanen')
    expect(argv).toContain(path.join('/werk', 'balbanen.jsonl'))
  })

  it('slaat het hele balverhaal over zonder kalibratie — dan is "waar" niet te weten', () => {
    expect(namen(stappen({ kalibratie: null })).some((n) => n.includes('worpbaan'))).toBe(false)
  })
})

describe('leesVoortgang', () => {
  // De Python-stappen melden onderweg hoe ver ze staan (cv/voortgang.py). Herkent deze lezer
  // die regel niet, dan staat de balk in de app weer stil zonder dat iemand weet waarom.
  it('leest de fractie en de tekst van een melding', () => {
    expect(leesVoortgang('VOORTGANG 0.412 4:13 van 10:14, 1250 metingen')).toEqual({
      fractie: 0.412,
      tekst: '4:13 van 10:14, 1250 metingen',
    })
  })

  it('verdraagt een onbekende noemer', () => {
    // Niet elke video draagt een betrouwbare lengte mee; dan is er geen percentage, maar de
    // melding is nog altijd een teken van leven.
    expect(leesVoortgang('VOORTGANG ? 0:42 bekeken')).toEqual({ fractie: null, tekst: '0:42 bekeken' })
  })

  it('houdt de fractie tussen 0 en 1', () => {
    expect(leesVoortgang('VOORTGANG 1.7 x')?.fractie).toBe(1)
    expect(leesVoortgang('VOORTGANG 0 x')?.fractie).toBe(0)
  })

  it('negeert gewone uitvoer van de stap', () => {
    expect(leesVoortgang('Houdingsmodel laden (balanced) …')).toBeNull()
    expect(leesVoortgang('')).toBeNull()
    expect(leesVoortgang('VOORTGANGx 0.5 iets')).toBeNull()
  })
})
