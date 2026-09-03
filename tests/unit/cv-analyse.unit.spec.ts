import { describe, it, expect } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  besluitHervatten,
  bruikbareBeelden,
  leesVoortgang,
  leesVolgrapport,
  bouwKandidaten,
  bouwStappen,
  isVerweesd,
  resultaatBestand,
  markeerStapKlaar,
  merktekenPad,
  pythonFout,
  spawnOmgeving,
  stapAlKlaar,
  stapFoutTekst,
  stapHandtekening,
  telMerktekens,
  videoBestand,
  wisMerktekens,
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
    // Ruime tijdslimiet, want dit is de enige test in dit bestand die een écht Python-proces
    // start (en er soms meerdere kandidaten voor aftast). Met de standaard vijf seconden viel
    // hij op een drukke machine willekeurig om, terwijl hij alleen bij het starten traag is —
    // een fout in de meting, niet in de code.
  }, 30_000)
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

  it('gaat verder waar een onderbroken poging gebleven was', () => {
    // Dit is de langste stap van de keten — uren op een wedstrijdvideo. Zonder dit kost elke
    // herstart van de server precies die uren opnieuw.
    expect(argvVan(stappen({ opts: { ...OPTS, ai: true }, hervat: true }), 'houding')).toContain('--hervat')
    // En niet bij een gewone, verse start: dan hoort de video écht opnieuw bekeken te worden.
    expect(argvVan(stappen({ opts: { ...OPTS, ai: true } }), 'houding')).not.toContain('--hervat')
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

describe('besluitHervatten', () => {
  // Regressie: hervatten hing enkel aan de vorige status, nooit aan de instellingen. Wie een
  // op 'snel' gestrande analyse herstartte op 'nauwkeurig' kreeg één stilzwijgend heterogene
  // meetreeks — dezelfde worp scoort in het oude deel tot een derde lager en valt onder de
  // drempel — en die reeks voedde daarna ook nog de training.
  const onderbroken = (instellingen?: AnalyseStand['instellingen']): AnalyseStand => ({
    status: 'afgebroken', stap: 'x', stapNummer: 1, stappen: 3,
    gestart: new Date().toISOString(),
    instellingen: instellingen ?? { stand: 'snel', bewegend: false, tracking: false, overlay: false, ai: true },
  })
  const opts = { stand: 'snel' as const, bewegend: false, tracking: false, overlay: false, ai: true }

  it('hervat een onderbroken poging met dezelfde instellingen', () => {
    expect(besluitHervatten(onderbroken(), opts)).toEqual({ hervatten: true })
    expect(besluitHervatten({ ...onderbroken(), status: 'mislukt' }, opts)).toEqual({ hervatten: true })
  })

  it('begint vers wanneer de stand veranderd is — en zegt waarom', () => {
    const besluit = besluitHervatten(onderbroken(), { ...opts, stand: 'nauwkeurig' })
    expect(besluit.hervatten).toBe(false)
    expect(besluit.melding).toMatch(/instellingen verschillen/i)
  })

  it('vergelijkt ook bewegend, tracking en ai — alles wat de meting zelf verandert', () => {
    expect(besluitHervatten(onderbroken(), { ...opts, bewegend: true }).hervatten).toBe(false)
    expect(besluitHervatten(onderbroken(), { ...opts, tracking: true }).hervatten).toBe(false)
    expect(besluitHervatten(onderbroken(), { ...opts, ai: false }).hervatten).toBe(false)
    // Een oude stand zonder ai-veld is hetzelfde als ai uit — geen onnodige herstart.
    const zonderAi = onderbroken({ stand: 'snel', bewegend: false, tracking: false, overlay: false })
    expect(besluitHervatten(zonderAi, { ...opts, ai: undefined }).hervatten).toBe(true)
  })

  it('laat overlay buiten beschouwing — dat verandert niets aan de meting', () => {
    expect(besluitHervatten(onderbroken(), { ...opts, overlay: true }).hervatten).toBe(true)
  })

  it('hervat nooit een voltooide of lopende analyse', () => {
    expect(besluitHervatten({ ...onderbroken(), status: 'klaar' }, opts)).toEqual({ hervatten: false })
    expect(besluitHervatten({ ...onderbroken(), status: 'bezig' }, opts)).toEqual({ hervatten: false })
    expect(besluitHervatten(null, opts)).toEqual({ hervatten: false })
  })

  it('begint vers wanneer de vorige poging geen instellingen droeg', () => {
    const zonder = { ...onderbroken(), instellingen: undefined }
    const besluit = besluitHervatten(zonder, opts)
    expect(besluit.hervatten).toBe(false)
    expect(besluit.melding).toMatch(/geen instellingen/i)
  })
})

describe('hervatten na een herstart', () => {
  // Een analyse van drie uur overleeft geen herstart van de server: het Python-proces is een kind
  // van de webserver en verdwijnt mét de container. Bij een bewuste uitrol is dat te aanvaarden —
  // maar dan opnieuw beginnen niet. De tussenresultaten staan op het volume; wat ontbrak was
  // weten wélke stappen af waren, want een half geschreven uitvoerbestand ziet er hetzelfde uit
  // als een volledig.

  const stap = { naam: 'Worpen herkennen aan de houding', argv: ['/cv/houding.py', '--analyse-fps', '8'] }

  async function tijdelijkeMap() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'cv-hervat-'))
  }

  it('herkent een stap pas als af nadat ze afgewerkt is', async () => {
    const map = await tijdelijkeMap()
    expect(await stapAlKlaar(map, 1, stap)).toBe(false)
    await markeerStapKlaar(map, 1, stap)
    expect(await stapAlKlaar(map, 1, stap)).toBe(true)
  })

  it('draait een stap opnieuw zodra de instellingen veranderen', () => {
    // Anders zou een fijnere precisiestand het grove resultaat van gisteren overslaan en
    // hergebruiken — een analyse die zegt dat ze op "ultra" draaide maar dat niet deed.
    const fijner = { ...stap, argv: ['/cv/houding.py', '--analyse-fps', '15'] }
    expect(stapHandtekening(fijner)).not.toBe(stapHandtekening(stap))
  })

  it('houdt de stappen uit elkaar', () => {
    const a = merktekenPad('/werk', 1, 'Het veld volgen')
    const b = merktekenPad('/werk', 2, 'Het veld volgen')
    expect(a).not.toBe(b)
    // Geen schuine strepen of spaties in een bestandsnaam.
    expect(path.basename(a)).toMatch(/^\.stap-01-[a-z0-9-]+\.klaar$/)
  })

  it('telt hoeveel er klaarstaat en kan alles wissen', async () => {
    const map = await tijdelijkeMap()
    await markeerStapKlaar(map, 1, stap)
    await markeerStapKlaar(map, 2, { ...stap, naam: 'De bal volgen' })
    expect(await telMerktekens(map)).toBe(2)
    await wisMerktekens(map)
    expect(await telMerktekens(map)).toBe(0)
    expect(await stapAlKlaar(map, 1, stap)).toBe(false)
  })

  it('valt terug op "nog niet gedaan" bij een map die niet bestaat', async () => {
    // De werkmap wordt pas bij de eerste analyse aangemaakt; dat mag geen uitzondering geven.
    expect(await stapAlKlaar('/bestaat/niet', 1, stap)).toBe(false)
    expect(await telMerktekens('/bestaat/niet')).toBe(0)
  })
})

// Wat er op het scherm komt als een stap onderuitgaat.
//
// Aanleiding: `❌ Mislukt: Worpen herkennen aan de houding van de spelers — Python stopte met
// code -1`. Die −1 bestaat niet in Python; het was ónze verzamelbak voor "geen afsluitcode",
// en precies de twee dingen die het wél zeggen — het signaal dat het proces velde en de
// FOUT-regel op stderr — gooiden we weg.
describe('stapFoutTekst', () => {
  const naam = 'Worpen herkennen aan de houding van de spelers'

  it('noemt het geheugen bij een proces dat door de kernel geveld is', () => {
    // SIGKILL komt van buiten: Python krijgt geen kans om iets te zeggen, dus het scherm bleef
    // leeg op een getal na. Dit is het geval dat in productie stond.
    const t = stapFoutTekst(naam, { code: null, signaal: 'SIGKILL' })
    expect(t).toContain(naam)
    expect(t).toMatch(/geheugen/i)
    expect(t).not.toMatch(/code -1|code null/)
    // En een uitweg: het al gemeten werk blijft staan.
    expect(t).toMatch(/opnieuw/i)
  })

  it('geeft de eigen foutregel van het script door', () => {
    const t = stapFoutTekst(naam, {
      code: 2,
      signaal: null,
      stderr: 'Traceback (most recent call last):\n  …\nFOUT: rtmlib ontbreekt — installeer met: pip install -r cv/requirements-pose.txt\n',
    })
    expect(t).toContain('rtmlib ontbreekt')
    expect(t).not.toContain('Traceback')
  })

  it('zegt het wanneer Python zelf niet startte', () => {
    const t = stapFoutTekst(naam, { code: null, signaal: null, startFout: 'spawn python3 ENOENT' })
    expect(t).toMatch(/niet gestart/i)
    expect(t).toContain('ENOENT')
  })

  it('valt terug op de code, maar zegt er dan bij dat er geen uitleg is', () => {
    const t = stapFoutTekst(naam, { code: 1, signaal: null })
    expect(t).toContain('code 1')
    expect(t).toMatch(/serverlogs/i)
  })
})

describe('pythonFout', () => {
  it('kiest de FOUT-regel, ook als er nog stacktrace achter komt', () => {
    // De scripts schrijven hun uitleg als `FOUT: …`; die is voor de gebruiker geschreven en
    // staat lang niet altijd als laatste regel.
    expect(pythonFout('FOUT: het houdingsmodel kon niet geladen worden\nSystemExit: 2\n'))
      .toBe('het houdingsmodel kon niet geladen worden')
  })

  it('neemt anders de laatste zinvolle regel', () => {
    expect(pythonFout('  \nMemoryError: unable to allocate array\n\n'))
      .toBe('MemoryError: unable to allocate array')
  })

  it('geeft niets terug bij lege stderr', () => {
    expect(pythonFout('')).toBeNull()
    expect(pythonFout(undefined)).toBeNull()
  })

  it('kapt een eindeloze regel af', () => {
    expect((pythonFout('x'.repeat(5000)) ?? '').length).toBe(300)
  })
})
