import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import type { Payload } from 'payload'

import { heeftRuntime, runtimeMap, runtimePython } from './cv-runtime'
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
  rapport?: {
    voorstellen?: number
    detecties?: number
    metLanding?: number
    zonderHomografie?: number
    duurSeconden?: number
    /** Is er een controlevideo gemaakt? (Zo ja: te bekijken via .../overlay.) */
    overlay?: boolean
  }
  instellingen?: { stand: string; bewegend: boolean; tracking: boolean; overlay: boolean }
}

export type AnalyseOpties = {
  stand: 'snel' | 'gewoon' | 'nauwkeurig'
  bewegend: boolean
  tracking: boolean
  overlay: boolean
}

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

/** De omgeving waarin een analyse-proces draait (PYTHONPATH als de pakketten elders staan). */
export function spawnOmgeving(keuze: PythonKeuze): NodeJS.ProcessEnv {
  return keuze.pythonpath ? { ...process.env, PYTHONPATH: keuze.pythonpath } : process.env
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
  opts: AnalyseOpties
  fps: number
}): { naam: string; argv: string[] }[] {
  const { video, map, kalibratie, opts, fps } = opties
  const cv = cvMap()
  const bestand = (naam: string) => path.join(map, naam)
  const stappen: { naam: string; argv: string[] }[] = []

  // Bewegende camera: eerst het veld volgen, daarna rekent alles met de matrix van dát moment.
  if (opts.bewegend && kalibratie) {
    stappen.push({
      naam: 'Het veld volgen in het bewegende beeld',
      argv: [path.join(cv, 'volg_veld.py'), '--video', video, '--kalibratie', kalibratie,
             '--stand', opts.stand, '--uit', bestand('homografie.jsonl')],
    })
  }

  stappen.push({
    naam: 'Kandidaat-worpen zoeken in de video',
    argv: [path.join(cv, 'detect_worpen.py'), video, '--match', String(opties.matchId),
           '--fps', String(fps), '--uit', bestand('detecties.jsonl')],
  })

  // Zonder kalibratie weten we wél wannéér er geworpen wordt, maar niet waar de bal landt.
  if (kalibratie) {
    stappen.push({
      naam: 'Bal volgen → landingszone en afstand',
      argv: [path.join(cv, 'landing.py'), '--video', video,
             ...(opts.bewegend ? ['--homografie', bestand('homografie.jsonl')] : []),
             '--kalibratie', kalibratie,
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
             '--fps', '4', '--uit', bestand('posities.jsonl')],
    })
  }

  if (opts.overlay && kalibratie) {
    stappen.push({
      naam: 'Controlevideo maken (veldmodel, lijnen, bal)',
      argv: [path.join(cv, 'overlay.py'), '--video', video, '--uit', bestand('controle.mp4'),
             '--balspoor', bestand('balspoor.jsonl'), '--lijnen',
             ...(opts.bewegend ? ['--homografie', bestand('homografie.jsonl')]
                               : ['--kalibratie', kalibratie]),
             ...(opts.tracking ? ['--posities', bestand('posities.jsonl')] : [])],
    })
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

/** Kalibratiepunten (aangeklikt in de app) → een kalibratie-JSON die de scripts lezen. */
export async function schrijfKalibratie(
  map: string,
  kalibratie: { punten?: { label: string; x: number; y: number }[] } | null,
  veld: { diepte: number; breedte: number | null; speelveld: number | null },
): Promise<string | null> {
  const punten = kalibratie?.punten ?? []
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
  const kalibratie = await schrijfKalibratie(
    map,
    (match.cvKalibratie ?? null) as { punten?: { label: string; x: number; y: number }[] } | null,
    {
      diepte: (match.goalAreaDepth as number) ?? 10,
      breedte: (match.veldBreedte as number | null) ?? null,
      speelveld: (match.veldSpeelveld as number | null) ?? null,
    },
  )

  const stappen = bouwStappen({ matchId, video: video.pad, map, kalibratie, opts, fps: 2 })
  const begin = Date.now()
  const stand: AnalyseStand = {
    status: 'bezig',
    stap: stappen[0]?.naam ?? 'Starten',
    stapNummer: 1,
    stappen: stappen.length + 1, // + het importeren van de voorstellen
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
        huidig = { ...huidig, stap: stappen[i].naam, stapNummer: i + 1 }
        await schrijfStand(payload, matchId, huidig)
        const code = await draaiStap(matchId, stappen[i].argv)
        if (code !== 0) throw new Error(`${stappen[i].naam} — Python stopte met code ${code}`)
      }

      huidig = { ...huidig, stap: 'Voorstellen klaarzetten voor review', stapNummer: stappen.length + 1 }
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

function draaiStap(matchId: number, argv: string[]): Promise<number> {
  // De keuze staat vast: startAnalyse controleerde de omgeving voor het eerste stapje.
  const python = huidigePython()
  return new Promise((resolve) => {
    const kind = spawn(python.pad, argv, { stdio: ['ignore', 'pipe', 'pipe'], env: spawnOmgeving(python) })
    lopend = { matchId, kind }
    let laatsteFout = ''
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
