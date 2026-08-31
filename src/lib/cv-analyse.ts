import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import ffmpegPath from 'ffmpeg-static'
import type { Payload } from 'payload'

import { heeftRuntime, modelOmgeving, runtimeMap, runtimePython } from './cv-runtime'
import { resolveMediaDir } from './media-dir'

// De video-analyse op de server: video erin, worpvoorstellen eruit. Wat de gebruiker in de
// cv/-map met de hand zou draaien, gebeurt hier als achtergrondtaak, met de stand in de
// database zodat de analysepagina kan tonen hoe ver het staat — ook nadat je wegklikte of
// de server tussendoor herstartte.
//
// Bewust GEEN aparte wachtrij-infrastructuur: één analyse tegelijk per server volstaat
// (het is rekenwerk van minuten, geen verkeer van duizenden taken), en de stand in de DB
// is de enige bron van waarheid. Een taak die door een herstart verdween wordt bij de
// volgende blik herkend en als afgebroken gemarkeerd — geen spooktaak die eeuwig "bezig" is.

export type AnalyseStatus = 'wachtrij' | 'bezig' | 'klaar' | 'mislukt' | 'afgebroken'

export type AnalyseStand = {
  status: AnalyseStatus
  /** Wat er nu draait, in mensentaal. */
  stap: string
  stapNummer: number
  stappen: number
  gestart: string
  geeindigd?: string
  fout?: string
  /** Proces-id, om een lopende taak te kunnen afbreken en herstarts te herkennen. */
  pid?: number
  /** Draait deze taak in dít serverproces? Zo niet en de status is 'bezig', dan is ze verdwenen. */
  procesStart?: number
  /** Hoe ver de huidige stap staat (0..1), als ze dat meldt (zie cv/voortgang.py). */
  stapFractie?: number
  /** Wat die stap laatst meldde, in mensentaal ("4:13 van 10:24, 1250 metingen"). */
  stapDetail?: string
  /** Wanneer er voor het laatst iets van de stap gehoord werd — zo zie je "traag" versus "vast". */
  laatsteTeken?: string
  /** Alle stapnamen in volgorde: dan zie je wat er nog komt in plaats van alleen "stap 1 van 2". */
  stappenNamen?: string[]
  rapport?: {
    voorstellen?: number
    detecties?: number
    metLanding?: number
    zonderHomografie?: number
    duurSeconden?: number
    /** Is er een controlevideo gemaakt? (Zo ja: te bekijken via .../overlay.) */
    overlay?: boolean
    /** Onderbrekingen in de opname (seconden), en de stukken zonder ijkbeeld. */
    onderbrekingen?: number[]
    gaten?: [number, number][]
    /** Wat de detector werkelijk bekeken heeft. */
    bekekenS?: number
    duurS?: number
    metingenPerS?: number
    /** Wat er overgeslagen is omdat de kalibratie ontbrak. */
    overgeslagen?: string[]
  }
  instellingen?: { stand: string; bewegend: boolean; tracking: boolean; overlay: boolean }
}

export type AnalyseOpties = {
  /**
   * Hoeveel rekenwerk mag deze analyse kosten?
   *
   * 'ultra' is bewust géén vierde tandje op dezelfde schaal maar een andere afspraak: je zet
   * ze 's avonds aan en kijkt de volgende ochtend. Alles wat kwaliteit tegen rekentijd
   * afruilt gaat dan naar de kwaliteitskant.
   */
  stand: 'snel' | 'gewoon' | 'nauwkeurig' | 'ultra'
  bewegend: boolean
  tracking: boolean
  overlay: boolean
  /** Worpen zoeken met het houdingsmodel in plaats van met beeldverschil. */
  ai?: boolean
}

/** Hoogstens één keer per zoveel milliseconden de voortgang naar de database schrijven. */
const VOORTGANG_SCHRIJF_MS = 8000

/** Wanneer dit serverproces startte — om te zien of een 'bezig'-taak nog van ons is. */
const PROCES_START = Date.now()

/** Eén analyse tegelijk: het is zwaar rekenwerk en de server draait ook de site. */
let lopend: { matchId: number; kind: ChildProcess } | null = null

export function looptErEenAnalyse(): number | null {
  return lopend ? lopend.matchId : null
}

/**
 * Waar een analyse-omgeving verwacht wordt als iemand er één klaarzet.
 *
 * De productie-image heeft die (nog) niet: twee pogingen om de Railway-build uit te breiden
 * lieten de deploy mislukken, dus is die config weggehaald — zie docs/DEPLOY.md. Tot dat
 * opgelost is meldt `analyseOmgeving()` gewoon dat opencv ontbreekt en blijft de knop uit.
 */
const VENV = '/opt/cv-venv'

/** Een manier om Python te starten: het commando, plus eventueel waar de pakketten staan. */
export type PythonKeuze = { pad: string; pythonpath: string | null }

/**
 * De kandidaten om de analyse mee te draaien, in volgorde van voorkeur.
 *
 * Puur, zodat de volgorde te testen valt: welke paden er zijn wordt apart op schijf gezocht.
 * `CV_PYTHON` is een bewuste keuze van wie de server beheert en krijgt het rijk alleen.
 */
export function bouwKandidaten(gevonden: {
  cvPython?: string | null
  volumePython?: string | null
  volumePakketten?: string | null
  venvPython?: string | null
  sitePackages?: string | null
}): PythonKeuze[] {
  if (gevonden.cvPython) return [{ pad: gevonden.cvPython, pythonpath: null }]
  const lijst: PythonKeuze[] = []
  // De omgeving die vanuit de app op het volume geïnstalleerd is (zie cv-runtime.ts).
  if (gevonden.volumePython) {
    lijst.push({ pad: gevonden.volumePython, pythonpath: gevonden.volumePakketten ?? null })
  }
  if (gevonden.venvPython) lijst.push({ pad: gevonden.venvPython, pythonpath: null })
  // Staat de venv er wel, maar wijst zijn python naar een interpreter die in het eindbeeld
  // niet meer bestaat, dan kan het systeem-python de pakketten er nog altijd uit laden.
  if (gevonden.sitePackages) lijst.push({ pad: 'python3', pythonpath: gevonden.sitePackages })
  lijst.push({ pad: 'python3', pythonpath: null })
  return lijst
}

function zoekPython(): Parameters<typeof bouwKandidaten>[0] {
  let sitePackages: string | null = null
  try {
    for (const naam of readdirSync(path.join(VENV, 'lib'))) {
      const kandidaat = path.join(VENV, 'lib', naam, 'site-packages')
      if (existsSync(kandidaat)) {
        sitePackages = kandidaat
        break
      }
    }
  } catch {
    // Geen venv op deze machine — dan blijft het systeem-python over.
  }
  return {
    cvPython: process.env.CV_PYTHON || null,
    volumePython: heeftRuntime() ? runtimePython() : null,
    volumePakketten: path.join(runtimeMap(), 'pakketten'),
    venvPython: existsSync(path.join(VENV, 'bin', 'python3')) ? path.join(VENV, 'bin', 'python3') : null,
    sitePackages,
  }
}

/**
 * De omgeving waarin een analyse-proces draait.
 *
 * PYTHONPATH als de pakketten elders staan, en altijd de modelcache op het volume: zonder dat
 * laatste haalt het houdingsmodel zijn 100 MB gewichten opnieuw op na elke uitrol, midden in
 * een analyse, zonder dat iemand ziet waarom het zo lang duurt.
 */
export function spawnOmgeving(keuze: PythonKeuze): NodeJS.ProcessEnv {
  const basis = keuze.pythonpath ? { ...process.env, PYTHONPATH: keuze.pythonpath } : process.env
  return modelOmgeving(basis)
}

/** Probeer één kandidaat: kan hij cv2 en numpy importeren? */
function probeer(keuze: PythonKeuze): Promise<{ ok: boolean; ontbreekt: boolean; geenPython: boolean }> {
  return new Promise((resolve) => {
    const kind = spawn(keuze.pad, ['-c', 'import cv2, numpy; print(cv2.__version__)'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: spawnOmgeving(keuze),
    })
    let err = ''
    kind.stderr?.on('data', (d) => {
      err += String(d)
    })
    kind.on('error', () => resolve({ ok: false, ontbreekt: false, geenPython: true }))
    kind.on('close', (code) =>
      resolve({ ok: code === 0, ontbreekt: err.includes('No module named'), geenPython: false }),
    )
  })
}

/** De kandidaat die het bij de controle deed; tot dan de eerste van de lijst. */
let gekozen: PythonKeuze | null = null

export function huidigePython(): PythonKeuze {
  return gekozen ?? bouwKandidaten(zoekPython())[0]
}

/** Het pad van het Python dat de analyse draait (zonder de omgeving errond). */
export function pythonPad(): string {
  return huidigePython().pad
}

/**
 * Kan deze server überhaupt analyseren? (Python aanwezig én opencv geïnstalleerd.)
 *
 * De analyse leunt op een Python-omgeving die niet overal staat — lokaal vaak niet, en op een
 * server pas na de juiste build. Zonder deze controle zou de knop een taak starten die na
 * seconden stukloopt op een cryptische Python-fout. Nu zegt de app vooraf wat er ontbreekt.
 *
 * Alle kandidaten worden geprobeerd: een venv waarvan de interpreter in het eindbeeld ontbreekt
 * mag de analyse niet tegenhouden als het systeem-python de pakketten wél kan laden. De keuze
 * en het antwoord worden onthouden — ze veranderen niet tijdens de looptijd van het proces.
 */
let omgevingCache: { ok: boolean; melding: string | null } | null = null

/** Na het installeren van de omgeving: opnieuw kijken in plaats van het oude antwoord herhalen. */
export function vergeetOmgeving(): void {
  omgevingCache = null
  gekozen = null
}

export async function analyseOmgeving(): Promise<{ ok: boolean; melding: string | null }> {
  if (omgevingCache) return omgevingCache
  let ontbreekt = false
  let geenPython = true
  for (const keuze of bouwKandidaten(zoekPython())) {
    const uitkomst = await probeer(keuze)
    if (uitkomst.ok) {
      gekozen = keuze
      omgevingCache = { ok: true, melding: null }
      return omgevingCache
    }
    ontbreekt = ontbreekt || uitkomst.ontbreekt
    geenPython = geenPython && uitkomst.geenPython
  }
  omgevingCache = {
    ok: false,
    melding: geenPython
      ? 'Deze server heeft geen Python — de video-analyse kan hier niet draaien.'
      : ontbreekt
        ? 'Python staat er wel, maar opencv ontbreekt op deze server.'
        : 'De Python-omgeving voor de video-analyse werkt niet op deze server.',
  }
  return omgevingCache
}

/** Het Python om mee te spawnen, na de controle (die de beste kandidaat kiest). */
export async function pythonVoorSpawn(): Promise<PythonKeuze> {
  await analyseOmgeving()
  return huidigePython()
}

/** Het ffmpeg dat met de app meekomt (ffmpeg-static), of null als het er niet is. */
export function ffmpegPad(): string | null {
  return ffmpegPath && existsSync(ffmpegPath) ? ffmpegPath : null
}

/** Waar de scripts staan (cv/ naast de app). */
export function cvMap(): string {
  return process.env.CV_DIR || path.resolve(process.cwd(), 'cv')
}

/**
 * Van videoUrl naar een bestand op schijf.
 *
 * Alleen een geüploade video (/api/clip/<naam>) staat als bestand op het volume. Een
 * YouTube-link kan de server niet analyseren: die zou gedownload moeten worden, en dat is
 * zowel technisch als qua voorwaarden een ander verhaal. Dat is geen verborgen beperking
 * maar een expliciete melding aan de gebruiker.
 */
export function videoBestand(videoUrl: string | null | undefined): { pad: string } | { fout: string } {
  const url = (videoUrl ?? '').trim()
  if (!url) return { fout: 'Er hangt nog geen video aan deze wedstrijd.' }
  const match = /^\/api\/clip\/([A-Za-z0-9_.-]+)$/.exec(url)
  // '..' voldoet aan de tekenset hierboven maar wijst uit de clips-map wég: expliciet weren,
  // anders kan een geknutselde videoUrl een ander bestand op de server laten inlezen.
  if (match && (match[1] === '..' || match[1] === '.' || match[1].includes('..'))) {
    return { fout: 'Ongeldige videoverwijzing.' }
  }
  if (!match) {
    return {
      fout:
        'De server kan alleen een geüploade video analyseren. Een YouTube-link kan hij niet ' +
        'ophalen — upload het bestand (mp4/webm) om te laten analyseren.',
    }
  }
  return { pad: path.join(resolveMediaDir(), 'clips', match[1]) }
}

/** De werkmap voor deze analyse: alle tussenbestanden bij elkaar, per wedstrijd. */
export function werkmap(matchId: number): string {
  return path.join(resolveMediaDir(), 'cv-analyse', String(matchId))
}

/**
 * Waar de getrainde instellingen van het houdingsmodel staan (cv/train.py).
 *
 * Op het volume, náást de werkmappen — niet in de repo: die wordt bij elke uitrol opnieuw
 * uitgepakt, dus daar zou het bestand telkens verdwijnen.
 */
export function instellingenPad(): string {
  return path.join(resolveMediaDir(), 'cv-analyse', 'model-houding.json')
}

// Wat de precisiekeuze betekent voor het houdingsmodel. Dit is de duurste stap van de keten:
// elk bemonsterd beeld kost het model een halve tot enkele seconden op een gedeelde processor,
// dus déze twee getallen bepalen of een wedstrijdvideo tien minuten of drie uur kost.
//
// Ze stonden eerder allebei vast (altijd 5 metingen/s, altijd 'balanced'), waardoor de keuze
// "snel / gewoon / nauwkeurig" voor de AI-stand geen enkel verschil maakte.
//
// 'ultra' meet 15 keer per seconde met het zwaarste model. Dat is geen willekeurig hoger getal:
// een worp duurt van aanloop tot loslaten ongeveer een halve seconde, en de piek waar het om
// draait hooguit twee tienden. Bij 5 metingen/s valt die piek soms tússen twee metingen; bij 15
// is elke worp met minstens drie metingen gedekt. Meer dan de beeldfrequentie van de video heeft
// geen zin — houding.py knijpt daar zelf op af.
const AI_METINGEN_PER_S = { snel: 3, gewoon: 5, nauwkeurig: 8, ultra: 15 } as const
const AI_MODELGROOTTE = {
  snel: 'lightweight', gewoon: 'balanced', nauwkeurig: 'performance', ultra: 'performance',
} as const
// Hoe vaak RANSAC een balbaan probeert. Dit kost bijna niets naast het decoderen van de video,
// maar bepaalt wel of de bal wordt teruggevonden op een druk beeld: met veertig bewegende
// blobs is 200 keer proberen niet altijd genoeg om de juiste drie punten te treffen.
const BAAN_RONDES = { snel: 120, gewoon: 200, nauwkeurig: 500, ultra: 2000 } as const
// Bemonstering van de spelerstracking. Te dun meten middelt elke versnelling weg en levert nul
// sprintjes op een wedstrijd waarin volop gesprint werd (zie cv/README.md).
const TRACKING_PER_S = { snel: 3, gewoon: 4, nauwkeurig: 6, ultra: 10 } as const

/** Eén stap uit de keten. Zonder `commando` draait ze op de Python van deze server. */
export type Stap = { naam: string; argv: string[]; commando?: string }

/**
 * De stappen die gedraaid worden, in volgorde.
 *
 * Puur (geen I/O) zodat de volgorde en de argumenten getest kunnen worden zonder Python:
 * een verkeerde vlag hier kost een analyse van een halfuur.
 */
export function bouwStappen(opties: {
  matchId: number
  video: string
  map: string
  kalibratie: string | null
  /** Meerdere ijkbeelden met hun tijdstip; wint van `kalibratie` bij een bewegende camera. */
  ankers?: string | null
  opts: AnalyseOpties
  fps: number
  /** Pad naar ffmpeg (ffmpeg-static); ontbreekt dat, dan vervalt het omzetten. */
  ffmpeg?: string | null
  /** Getrainde drempels voor het houdingsmodel (cv/train.py); ontbreekt het bestand, dan
   *  valt houding.py terug op zijn geschatte waarden. */
  instellingen?: string | null
}): Stap[] {
  const { video, map, kalibratie, ankers, opts, fps, ffmpeg, instellingen } = opties
  const cv = cvMap()
  const bestand = (naam: string) => path.join(map, naam)
  const stappen: Stap[] = []

  // Bewegende camera: eerst het veld volgen, daarna rekent alles met de matrix van dát moment.
  // Zijn er meerdere ijkbeelden, dan gaan die er allemaal in — elk op hun eigen tijdstip.
  if (opts.bewegend && (ankers || kalibratie)) {
    stappen.push({
      naam: 'Het veld volgen in het bewegende beeld',
      argv: [path.join(cv, 'volg_veld.py'), '--video', video,
             ...(ankers ? ['--ankers', ankers] : ['--kalibratie', kalibratie as string]),
             '--stand', opts.stand, '--uit', bestand('homografie.jsonl')],
    })
  }

  // Twee manieren om worpen te zoeken. Het houdingsmodel kijkt naar de spelers zelf en werkt
  // dus ook bij een bewegende camera; de beeldverschil-spotter is sneller maar meet bij een
  // pannende gsm vooral de camera (gemeten: nul van de acht worpen gevonden).
  //
  // Let ook op welk argument wat doet: --fps vult enkel het frame-nummer in (en moet dus de
  // beeldfrequentie van de vídeo zijn), terwijl --analyse-fps bepaalt hoe fijn er gekeken
  // wordt. Die stond eerder verkeerd om: de precisiekeuze bereikte de detector nooit.
  stappen.push(
    opts.ai
      ? {
          naam: 'Worpen herkennen aan de houding van de spelers',
          // --reeks-uit bewaart de meting per beeld. Dat is het dure deel van de analyse, en
          // meteen de trainingsdata: met die reeks + de worpen die de aantekenaar invoerde
          // stelt cv/train.py de drempels bij zonder de video opnieuw te bekijken.
          argv: [path.join(cv, 'houding.py'), video, '--match', String(opties.matchId),
                 '--analyse-fps', String(AI_METINGEN_PER_S[opts.stand]),
                 '--mode', AI_MODELGROOTTE[opts.stand],
                 '--uit', bestand('detecties.jsonl'),
                 '--reeks-uit', bestand('houding-reeks.jsonl'),
                 ...(instellingen ? ['--instellingen', instellingen] : [])],
        }
      : {
          naam: 'Kandidaat-worpen zoeken in de video',
          argv: [path.join(cv, 'detect_worpen.py'), video, '--match', String(opties.matchId),
                 '--analyse-fps', String(fps), '--uit', bestand('detecties.jsonl')],
        },
  )

  // Zonder kalibratie weten we wél wannéér er geworpen wordt, maar niet waar de bal landt.
  if (kalibratie) {
    // Eerst de balbanen apart zoeken: camerabeweging weggerekend en een echte worpbaan gefit,
    // in plaats van per beeld de dichtstbijzijnde blob te grijpen. Op een proefvideo met een
    // pannende camera gaf dat een landingspunt op 0,40 m van de echte plek.
    stappen.push({
      naam: 'De bal volgen als worpbaan',
      argv: [path.join(cv, 'bal.py'), video,
             '--rondes', String(BAAN_RONDES[opts.stand]),
             '--detecties', bestand('detecties.jsonl'), '--uit', bestand('balbanen.jsonl')],
    })
    stappen.push({
      naam: 'Bal volgen → landingszone en afstand',
      argv: [path.join(cv, 'landing.py'), '--video', video,
             ...(opts.bewegend ? ['--homografie', bestand('homografie.jsonl')] : []),
             '--kalibratie', kalibratie, '--balbanen', bestand('balbanen.jsonl'),
             '--detecties', bestand('detecties.jsonl'), '--uit', bestand('met_landing.jsonl'),
             '--balspoor', bestand('balspoor.jsonl')],
    })
    stappen.push({
      naam: 'Spelers herkennen (ploeg via truitjeskleur)',
      argv: [path.join(cv, 'spelers.py'), '--video', video,
             '--detecties', bestand('met_landing.jsonl'), '--uit', bestand('met_spelers.jsonl')],
    })
  }

  if (opts.tracking && kalibratie) {
    stappen.push({
      naam: 'Spelersposities volgen (voor loopafstand en sprintjes)',
      argv: [path.join(cv, 'tracking.py'), '--video', video, '--kalibratie', kalibratie,
             ...(opts.bewegend ? ['--homografie', bestand('homografie.jsonl')] : []),
             '--fps', String(TRACKING_PER_S[opts.stand]), '--uit', bestand('posities.jsonl')],
    })
  }

  if (opts.overlay && kalibratie) {
    stappen.push({
      naam: 'Controlevideo maken (veldmodel, lijnen, bal)',
      argv: [path.join(cv, 'overlay.py'), '--video', video, '--uit', bestand('ruw.mp4'),
             '--balspoor', bestand('balspoor.jsonl'), '--lijnen',
             ...(opts.bewegend ? ['--homografie', bestand('homografie.jsonl')]
                               : ['--kalibratie', kalibratie]),
             ...(opts.tracking ? ['--posities', bestand('posities.jsonl')] : [])],
    })
    // opencv-headless kan alleen mp4v schrijven (geen H.264-encoder in het wiel), en dát speelt
    // geen enkele browser af — de controlevideo zou een zwart vlak zijn. ffmpeg-static zit al
    // in het project voor de replay-clips; die zet ze om naar H.264.
    if (ffmpeg) {
      stappen.push({
        naam: 'Controlevideo omzetten naar een formaat dat de browser speelt',
        commando: ffmpeg,
        argv: ['-hide_banner', '-loglevel', 'error', '-y', '-i', bestand('ruw.mp4'),
               '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
               '-movflags', '+faststart', bestand('controle.mp4')],
      })
    }
  }

  return stappen
}

/** Het eindbestand met de voorstellen: het laatste dat de keten opleverde. */
export function resultaatBestand(map: string, kalibratie: string | null, tracking: boolean): string {
  void tracking
  return path.join(map, kalibratie ? 'met_spelers.jsonl' : 'detecties.jsonl')
}

/**
 * Is deze stand nog geldig, of komt ze van een server die intussen herstart is?
 *
 * Een taak die 'bezig' zegt maar uit een vorig serverproces komt, draait niet meer: het
 * proces is met de container verdwenen. Die als 'bezig' blijven tonen zou de gebruiker
 * eeuwig laten wachten.
 */
export function isVerweesd(stand: AnalyseStand | null | undefined): boolean {
  if (!stand) return false
  if (stand.status !== 'bezig' && stand.status !== 'wachtrij') return false
  return stand.procesStart !== PROCES_START
}

export async function leesStand(payload: Payload, matchId: number): Promise<AnalyseStand | null> {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  const stand = (match?.cvAnalyse ?? null) as AnalyseStand | null
  if (isVerweesd(stand)) {
    const afgebroken: AnalyseStand = {
      ...(stand as AnalyseStand),
      status: 'afgebroken',
      fout: 'De server is herstart terwijl de analyse liep. Start ze opnieuw.',
      geeindigd: new Date().toISOString(),
    }
    await schrijfStand(payload, matchId, afgebroken)
    return afgebroken
  }
  return stand
}

export async function schrijfStand(payload: Payload, matchId: number, stand: AnalyseStand): Promise<void> {
  await payload
    .update({ collection: 'matches', id: matchId, data: { cvAnalyse: stand }, overrideAccess: true })
    .catch(() => undefined)
}

export type KalibratiePunt = { label: string; x: number; y: number }
export type KalibratieBeeld = { tijd: number; punten: KalibratiePunt[] }
export type KalibratieData = { punten?: KalibratiePunt[]; beelden?: KalibratieBeeld[] } | null

/**
 * De ijkbeelden uit de opgeslagen kalibratie, op tijd gesorteerd.
 *
 * Puur, zodat de keuze te testen valt: alleen beelden met vier of meer punten kunnen een
 * homografie opleveren. Een oude kalibratie zonder `beelden` telt als één beeld op seconde 0.
 */
export function bruikbareBeelden(kalibratie: KalibratieData): KalibratieBeeld[] {
  const uit = (kalibratie?.beelden ?? []).filter((b) => (b.punten?.length ?? 0) >= 4)
  if (uit.length > 0) return [...uit].sort((a, b) => a.tijd - b.tijd)
  const punten = kalibratie?.punten ?? []
  return punten.length >= 4 ? [{ tijd: 0, punten }] : []
}

/** Kalibratiepunten (aangeklikt in de app) → een kalibratie-JSON die de scripts lezen. */
export async function schrijfKalibratie(
  map: string,
  kalibratie: KalibratieData,
  veld: { diepte: number; breedte: number | null; speelveld: number | null },
): Promise<string | null> {
  const punten = bruikbareBeelden(kalibratie)[0]?.punten ?? []
  if (punten.length < 4) return null
  const pad = path.join(map, 'kalibratie.json')
  // calibrate.py rekent de matrix uit; wij leveren enkel de aangeklikte punten aan.
  const argv = [
    path.join(cvMap(), 'calibrate.py'),
    '--diepte', String(veld.diepte),
    ...(veld.breedte != null ? ['--breedte', String(veld.breedte)] : []),
    ...(veld.speelveld != null ? ['--speelveld', String(veld.speelveld)] : []),
    '--uit', pad,
    ...punten.flatMap((p) => ['--punt', `${Math.round(p.x)},${Math.round(p.y)}=${p.label}`]),
  ]
  const python = await pythonVoorSpawn()
  const klaar = await new Promise<boolean>((resolve) => {
    const kind = spawn(python.pad, argv, { stdio: ['ignore', 'ignore', 'pipe'], env: spawnOmgeving(python) })
    kind.on('error', () => resolve(false))
    kind.on('close', (code) => resolve(code === 0))
  })
  return klaar ? pad : null
}

/**
 * Wat het volgen over de opname zelf te melden had.
 *
 * Onderbrekingen in de video (camera gestopt en opnieuw gestart) worden apart gevolgd; een stuk
 * zonder ijkbeeld krijgt geen veldstand en wordt dus niet gemeten. Dat is precies wat de
 * gebruiker moet weten om er een beeld bij te zetten — vandaar dat het mee in de stand gaat.
 */
export async function leesDetectierapport(
  map: string,
): Promise<{ bekekenS?: number; duurS?: number; metingenPerS?: number }> {
  try {
    const ruw = JSON.parse(await fs.readFile(path.join(map, 'detecties.jsonl.rapport.json'), 'utf8')) as {
      bekeken_s?: number
      duur_s?: number | null
      analyse_fps?: number
    }
    return {
      bekekenS: typeof ruw.bekeken_s === 'number' ? ruw.bekeken_s : undefined,
      duurS: typeof ruw.duur_s === 'number' ? ruw.duur_s : undefined,
      metingenPerS: typeof ruw.analyse_fps === 'number' ? ruw.analyse_fps : undefined,
    }
  } catch {
    return {}
  }
}

export async function leesVolgrapport(
  map: string,
): Promise<{ onderbrekingen?: number[]; gaten?: [number, number][] }> {
  try {
    const ruw = JSON.parse(await fs.readFile(path.join(map, 'homografie.jsonl.rapport.json'), 'utf8')) as {
      breuken?: number[]
      gaten?: [number, number][]
    }
    const uit: { onderbrekingen?: number[]; gaten?: [number, number][] } = {}
    if (Array.isArray(ruw.breuken) && ruw.breuken.length) uit.onderbrekingen = ruw.breuken
    if (Array.isArray(ruw.gaten) && ruw.gaten.length) uit.gaten = ruw.gaten
    return uit
  } catch {
    return {} // geen bewegende camera, of het volgen draaide niet
  }
}

/**
 * Alle ijkbeelden → één ankerbestand voor volg_veld.py.
 *
 * Elk beeld krijgt zijn eigen matrix én zijn eigen tijdstip. Dat laatste is de kern: duid je
 * een beeld aan op 6:27, dan hoort die matrix bij 6:27 en niet bij seconde 0. Met meerdere
 * ankers hoeft geen enkel beeld het volledige veld te tonen — samen dekken ze het.
 *
 * Geeft null als er maar één ijkbeeld op seconde 0 is: dan volstaat de gewone kalibratie.
 */
export async function schrijfAnkers(
  map: string,
  kalibratie: KalibratieData,
  veld: { diepte: number; breedte: number | null; speelveld: number | null },
): Promise<string | null> {
  const beelden = bruikbareBeelden(kalibratie)
  if (beelden.length === 0) return null
  if (beelden.length === 1 && beelden[0].tijd === 0) return null

  const python = await pythonVoorSpawn()
  const ankers: { tijd_s: number; matrix_beeld_naar_veld: number[][] }[] = []
  for (const [i, beeld] of beelden.entries()) {
    const tussen = path.join(map, `anker-${i}.json`)
    const argv = [
      path.join(cvMap(), 'calibrate.py'),
      '--diepte', String(veld.diepte),
      ...(veld.breedte != null ? ['--breedte', String(veld.breedte)] : []),
      ...(veld.speelveld != null ? ['--speelveld', String(veld.speelveld)] : []),
      '--uit', tussen,
      ...beeld.punten.flatMap((p) => ['--punt', `${Math.round(p.x)},${Math.round(p.y)}=${p.label}`]),
    ]
    const klaar = await new Promise<boolean>((resolve) => {
      const kind = spawn(python.pad, argv, { stdio: ['ignore', 'ignore', 'pipe'], env: spawnOmgeving(python) })
      kind.on('error', () => resolve(false))
      kind.on('close', (code) => resolve(code === 0))
    })
    if (!klaar) continue // één rammelend beeld mag de rest niet meeslepen
    const data = JSON.parse(await fs.readFile(tussen, 'utf8')) as { matrix_beeld_naar_veld: number[][] }
    ankers.push({ tijd_s: beeld.tijd, matrix_beeld_naar_veld: data.matrix_beeld_naar_veld })
  }
  if (ankers.length === 0) return null

  const pad = path.join(map, 'ankers.json')
  await fs.writeFile(
    pad,
    JSON.stringify({
      ankers,
      veld: { breedte_m: veld.breedte, speelveld_m: veld.speelveld },
      doelgebied_diepte_m: veld.diepte,
    }),
  )
  return pad
}

/**
 * Start de analyse. Geeft meteen terug; de voortgang loopt via de stand in de database.
 *
 * De import van de voorstellen gebeurt bewust hier en niet via de HTTP-brug: de server
 * praat rechtstreeks met zijn eigen database, zonder token of netwerk in de lus.
 */
export async function startAnalyse(
  payload: Payload,
  matchId: number,
  opts: AnalyseOpties,
  importeer: (regels: Record<string, unknown>[]) => Promise<number>,
): Promise<{ ok: true; stand: AnalyseStand } | { ok: false; fout: string; code: number }> {
  if (lopend) {
    return {
      ok: false,
      code: 409,
      fout: lopend.matchId === matchId
        ? 'De analyse van deze wedstrijd loopt al.'
        : 'Er loopt al een analyse van een andere wedstrijd. Wacht tot die klaar is.',
    }
  }

  const omgeving = await analyseOmgeving()
  if (!omgeving.ok) return { ok: false, code: 503, fout: omgeving.melding ?? 'Analyse niet beschikbaar.' }

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return { ok: false, code: 404, fout: 'Wedstrijd niet gevonden.' }

  const video = videoBestand(match.videoUrl as string | null)
  if ('fout' in video) return { ok: false, code: 400, fout: video.fout }
  try {
    await fs.access(video.pad)
  } catch {
    return { ok: false, code: 400, fout: 'Het videobestand staat niet (meer) op de server. Upload het opnieuw.' }
  }

  const map = werkmap(matchId)
  await fs.mkdir(map, { recursive: true })
  const kalibratieData = (match.cvKalibratie ?? null) as KalibratieData
  const veldmaten = {
    diepte: (match.goalAreaDepth as number) ?? 10,
    breedte: (match.veldBreedte as number | null) ?? null,
    speelveld: (match.veldSpeelveld as number | null) ?? null,
  }
  const kalibratie = await schrijfKalibratie(map, kalibratieData, veldmaten)
  // Alleen zinvol bij een bewegende camera; anders kost het rekentijd zonder iets toe te voegen.
  const ankers = opts.bewegend ? await schrijfAnkers(map, kalibratieData, veldmaten) : null

  // Wat er niet kán zonder kalibratie. Dat stilzwijgend overslaan is precies waarom een
  // analyse "klaar" meldde terwijl de aangevinkte opties niets deden.
  const overgeslagen: string[] = []
  if (!kalibratie) {
    if (opts.bewegend) overgeslagen.push('het veld volgen bij een bewegende camera')
    if (opts.tracking) overgeslagen.push('spelers volgen')
    if (opts.overlay) overgeslagen.push('de controlevideo')
    overgeslagen.push('waar de bal landt (zones en afstanden)')
  }

  // Hoe fijn de detector naar de video kijkt, per precisiekeuze.
  const METINGEN_PER_S = { snel: 5, gewoon: 10, nauwkeurig: 20, ultra: 30 } as const
  const stappen = bouwStappen({
    matchId, video: video.pad, map, kalibratie, ankers, opts,
    fps: METINGEN_PER_S[opts.stand], ffmpeg: ffmpegPad(), instellingen: instellingenPad(),
  })
  const begin = Date.now()
  const IMPORTSTAP = 'Voorstellen klaarzetten voor review'
  const stand: AnalyseStand = {
    status: 'bezig',
    stap: stappen[0]?.naam ?? 'Starten',
    stapNummer: 1,
    stappen: stappen.length + 1, // + het importeren van de voorstellen
    stappenNamen: [...stappen.map((s) => s.naam), IMPORTSTAP],
    gestart: new Date(begin).toISOString(),
    procesStart: PROCES_START,
    instellingen: { ...opts },
  }
  await schrijfStand(payload, matchId, stand)

  // De keten draait losgekoppeld: het HTTP-verzoek is allang beantwoord.
  void (async () => {
    let huidig = { ...stand }
    try {
      for (let i = 0; i < stappen.length; i++) {
        huidig = {
          ...huidig, stap: stappen[i].naam, stapNummer: i + 1,
          stapFractie: 0, stapDetail: undefined, laatsteTeken: new Date().toISOString(),
        }
        await schrijfStand(payload, matchId, huidig)
        // De voortgang van de stap doorgeven aan de pagina, maar geknepen: elke melding naar de
        // database schrijven zou tientallen schrijfacties per minuut kosten voor een balk die
        // toch maar om de vijf seconden opgehaald wordt.
        let laatsteSchrijf = 0
        const code = await draaiStap(matchId, stappen[i], (v) => {
          huidig = {
            ...huidig,
            ...(v.fractie != null ? { stapFractie: v.fractie } : {}),
            stapDetail: v.tekst || undefined,
            laatsteTeken: new Date().toISOString(),
          }
          if (Date.now() - laatsteSchrijf < VOORTGANG_SCHRIJF_MS) return
          laatsteSchrijf = Date.now()
          void schrijfStand(payload, matchId, huidig).catch(() => undefined)
        })
        if (code !== 0) throw new Error(`${stappen[i].naam} — Python stopte met code ${code}`)
      }

      huidig = {
        ...huidig, stap: IMPORTSTAP, stapNummer: stappen.length + 1,
        stapFractie: 0, stapDetail: undefined, laatsteTeken: new Date().toISOString(),
      }
      await schrijfStand(payload, matchId, huidig)
      const regels = await leesJsonl(resultaatBestand(map, kalibratie, opts.tracking))
      const aantal = await importeer(regels)

      await schrijfStand(payload, matchId, {
        ...huidig,
        status: 'klaar',
        stap: 'Klaar',
        geeindigd: new Date().toISOString(),
        rapport: {
          voorstellen: aantal,
          detecties: regels.length,
          metLanding: regels.filter((r) => r.zone && typeof r.zone === 'object').length,
          overlay: existsSync(path.join(map, 'controle.mp4')),
          ...(await leesDetectierapport(map)),
          ...(await leesVolgrapport(map)),
          ...(overgeslagen.length ? { overgeslagen } : {}),
          duurSeconden: Math.round((Date.now() - begin) / 1000),
        },
      })
    } catch (err) {
      await schrijfStand(payload, matchId, {
        ...huidig,
        status: 'mislukt',
        fout: err instanceof Error ? err.message : 'Onbekende fout',
        geeindigd: new Date().toISOString(),
        rapport: { duurSeconden: Math.round((Date.now() - begin) / 1000) },
      })
    } finally {
      lopend = null
    }
  })()

  return { ok: true, stand }
}

/** Eén VOORTGANG-regel van een Python-stap: `VOORTGANG 0.412 4:13 van 10:24, 1250 metingen`. */
export function leesVoortgang(regel: string): { fractie: number | null; tekst: string } | null {
  const m = /^VOORTGANG\s+(\d*\.?\d+|\?)\s*(.*)$/.exec(regel.trim())
  if (!m) return null
  const fractie = m[1] === '?' ? null : Math.min(1, Math.max(0, Number(m[1])))
  if (fractie != null && !Number.isFinite(fractie)) return null
  return { fractie, tekst: m[2].trim() }
}

function draaiStap(
  matchId: number,
  stap: Stap,
  onVoortgang?: (v: { fractie: number | null; tekst: string }) => void,
): Promise<number> {
  // De keuze staat vast: startAnalyse controleerde de omgeving voor het eerste stapje.
  const python = huidigePython()
  const { argv } = stap
  return new Promise((resolve) => {
    const kind = spawn(stap.commando ?? python.pad, argv, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnOmgeving(python),
    })
    lopend = { matchId, kind }
    let laatsteFout = ''
    // De zware stappen melden onderweg hoe ver ze staan (cv/voortgang.py). Zonder dat stond de
    // balk in de app een halfuur stil op "Stap 1 van 2" — niet te onderscheiden van vastgelopen.
    let rest = ''
    kind.stdout?.on('data', (d) => {
      rest += String(d)
      const regels = rest.split('\n')
      rest = regels.pop() ?? ''
      for (const regel of regels) {
        const v = leesVoortgang(regel)
        if (v && onVoortgang) onVoortgang(v)
      }
    })
    kind.stderr?.on('data', (d) => {
      laatsteFout = String(d).slice(-500)
    })
    kind.on('error', () => resolve(-1))
    kind.on('close', (code) => {
      if (code !== 0 && laatsteFout) console.warn(`[cv-analyse] ${laatsteFout.trim()}`)
      resolve(code ?? -1)
    })
  })
}

/** Breek een lopende analyse af (de gebruiker of een nieuwe start). */
export async function breekAf(payload: Payload, matchId: number): Promise<boolean> {
  if (!lopend || lopend.matchId !== matchId) return false
  lopend.kind.kill('SIGTERM')
  lopend = null
  const stand = ((await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null))
    ?.cvAnalyse ?? null) as AnalyseStand | null
  if (stand) {
    await schrijfStand(payload, matchId, {
      ...stand,
      status: 'afgebroken',
      geeindigd: new Date().toISOString(),
    })
  }
  return true
}

export async function leesJsonl(pad: string): Promise<Record<string, unknown>[]> {
  const tekst = await fs.readFile(pad, 'utf8').catch(() => '')
  return tekst
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      try {
        return JSON.parse(r) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .filter((r): r is Record<string, unknown> => r !== null)
}
