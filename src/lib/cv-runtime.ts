import { spawn } from 'child_process'
import crypto from 'crypto'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import { pakUit } from './cv-tar'
import { resolveMediaDir } from './media-dir'

// De analyse-omgeving vanuit de app installeren.
//
// De productieserver heeft géén Python — en twee pogingen om dat via de build te regelen lieten
// de deploy mislukken. Dus halen we de omgeving op ná de deploy, naar het volume waar ook de
// video's staan: een zelfstandige CPython (python-build-standalone, één map, geen systeem-
// afhankelijkheden) plus numpy en opencv-python-headless. Faalt dat, dan staat de knop uit met
// de reden erbij en draait de site gewoon door — precies zoals nu.
//
// Op het volume en dus herstart-bestendig: één keer installeren volstaat.

/** Vastgezet, zodat een herinstallatie exact hetzelfde oplevert. */
export const PYTHON_VERSIE = '3.12.11'
const PYTHON_RELEASE = '20250818'
/** De sha256 van precies dat bestand — we halen een programma binnen dat we daarna uitvoeren. */
export const PYTHON_SHA256 = 'a1fb9e8f108ab31ca72ed488e79370873721a2a4fe7e625b07964c380721a87f'
const PAKKETTEN = ['numpy==1.26.4', 'opencv-python-headless==4.10.0.84']
/**
 * Het houdingsmodel: herkent spelers en hun gewrichten, en daarmee worpen.
 *
 * Apart van de basis omdat het er ~200 MB bij zet en niet iedereen het nodig heeft. rtmlib
 * haalt zijn gewichten (± 100 MB) bij de eerste run zelf op; daarom is er in de app een knop
 * die het model op één beeld probeert — dan weet je meteen of dat gelukt is.
 */
const AI_PAKKETTEN = ['rtmlib==0.0.13', 'onnxruntime==1.22.0', 'tqdm']

export type RuntimeStand = {
  status: 'bezig' | 'klaar' | 'mislukt'
  stap: string
  stapNummer: number
  stappen: number
  gestart: string
  geeindigd?: string
  fout?: string
  /** Waar de omgeving staat, zodra ze werkt. */
  python?: string
  versie?: string
}

/** De map op het volume waarin de omgeving belandt. */
export function runtimeMap(): string {
  return process.env.CV_RUNTIME_DIR || path.join(resolveMediaDir(), 'cv-runtime')
}

export function runtimePython(): string {
  return path.join(runtimeMap(), 'python', 'bin', 'python3')
}

export function heeftRuntime(): boolean {
  return existsSync(runtimePython())
}

/** Staat het houdingsmodel erbij? (rtmlib in de pakkettenmap.) */
export function heeftAiModel(): boolean {
  return existsSync(path.join(runtimeMap(), 'pakketten', 'rtmlib'))
}

/**
 * De download-URL van de zelfstandige Python.
 *
 * `x86_64_v2` draait op elke server van na 2009 en is wat Railway gebruikt. Op een andere
 * architectuur (bv. arm) zet je `CV_PYTHON_URL` naar het juiste bestand van dezelfde release.
 */
export function pythonUrl(): string {
  return (
    process.env.CV_PYTHON_URL ||
    `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/` +
      `cpython-${PYTHON_VERSIE}%2B${PYTHON_RELEASE}-x86_64_v2-unknown-linux-gnu-install_only_stripped.tar.gz`
  )
}

/** Alleen ons eigen, vastgezette bestand kennen we op voorhand; een eigen URL niet. */
export function verwachteSom(url: string): string | null {
  return url === pythonUrl() && !process.env.CV_PYTHON_URL ? PYTHON_SHA256 : null
}

const standBestand = () => path.join(runtimeMap(), 'stand.json')

export async function leesRuntimeStand(): Promise<RuntimeStand | null> {
  try {
    return JSON.parse(await fs.readFile(standBestand(), 'utf8')) as RuntimeStand
  } catch {
    return null
  }
}

async function schrijfRuntimeStand(stand: RuntimeStand): Promise<void> {
  await fs.mkdir(runtimeMap(), { recursive: true })
  await fs.writeFile(standBestand(), JSON.stringify(stand, null, 2))
}

/** Eén installatie tegelijk; een tweede knopdruk mag er geen tweede starten. */
let bezig = false
export function installatieLoopt(): boolean {
  return bezig
}

/** Haal het bestand op en leg het naast het controlegetal dat in deze code vastligt. */
export async function haalEnControleer(url: string): Promise<Buffer> {
  const bestand = await fetch(url)
  if (!bestand.ok) throw new Error(`Downloaden mislukte (${bestand.status}) — is deze server online?`)
  const data = Buffer.from(await bestand.arrayBuffer())
  const verwacht = verwachteSom(url)
  if (verwacht) {
    const gekregen = crypto.createHash('sha256').update(data).digest('hex')
    if (verwacht !== gekregen) {
      throw new Error('De gedownloade Python klopt niet met zijn controlegetal — installatie gestopt.')
    }
  }
  return data
}

function draai(commando: string, argv: string[], opties: { env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ code: number; err: string }>((resolve) => {
    const kind = spawn(commando, argv, { stdio: ['ignore', 'ignore', 'pipe'], env: opties.env ?? process.env })
    let err = ''
    kind.stderr?.on('data', (d) => {
      err = (err + String(d)).slice(-800)
    })
    kind.on('error', (e) => resolve({ code: -1, err: e.message }))
    kind.on('close', (code) => resolve({ code: code ?? -1, err }))
  })
}

/**
 * Installeer de analyse-omgeving. Geeft meteen terug; de voortgang staat in `leesRuntimeStand()`.
 *
 * Staat er al een Python op de server, dan slaan we de download over en installeren we de
 * pakketten daarin — dat scheelt 30 MB en een minuut.
 */
export async function startRuntimeInstallatie(
  systeemPython: string | null,
  klaar?: () => void,
  soort: 'basis' | 'ai' = 'basis',
): Promise<{ ok: true; stand: RuntimeStand } | { ok: false; fout: string; code: number }> {
  if (bezig) return { ok: false, code: 409, fout: 'De installatie loopt al.' }
  if (soort === 'ai' && !systeemPython && !heeftRuntime()) {
    return { ok: false, code: 400, fout: 'Installeer eerst de gewone analyse-omgeving.' }
  }
  bezig = true

  const pakketten = soort === 'ai' ? AI_PAKKETTEN : PAKKETTEN
  const stappen = soort === 'ai' ? 3 : systeemPython ? 2 : 3
  let stand: RuntimeStand = {
    status: 'bezig',
    stap: soort === 'ai' ? 'het houdingsmodel installeren' : systeemPython ? 'opencv en numpy installeren' : 'Python ophalen',
    stapNummer: 1,
    stappen,
    gestart: new Date().toISOString(),
  }
  await schrijfRuntimeStand(stand)

  void (async () => {
    const zet = async (stap: string, nummer: number) => {
      stand = { ...stand, stap, stapNummer: nummer }
      await schrijfRuntimeStand(stand)
    }
    try {
      let python = systeemPython ?? (soort === 'ai' && heeftRuntime() ? runtimePython() : null)
      if (!python) {
        const data = await haalEnControleer(pythonUrl())
        await zet('Python uitpakken', 2)
        await fs.rm(path.join(runtimeMap(), 'python'), { recursive: true, force: true })
        await pakUit(data, runtimeMap())
        python = runtimePython()
        if (!existsSync(python)) throw new Error('De uitgepakte Python staat niet waar hij hoort.')
        await zet('opencv en numpy installeren', 3)
      }

      const doel = path.join(runtimeMap(), 'pakketten')
      await fs.mkdir(doel, { recursive: true })
      const pip = await draai(python, ['-m', 'pip', 'install', '--no-cache-dir', '--target', doel, ...pakketten])
      if (pip.code !== 0) throw new Error(`installeren mislukte: ${pip.err.split('\n').pop() || pip.code}`)

      await zet('controleren', soort === 'ai' ? 2 : stappen)
      const proef = soort === 'ai' ? 'import rtmlib, onnxruntime' : 'import cv2, numpy'
      const controle = await draai(python, ['-c', proef], { env: { ...process.env, PYTHONPATH: doel } })
      if (controle.code !== 0) throw new Error(`De omgeving werkt niet: ${controle.err.split('\n').pop() || ''}`)

      if (soort === 'ai') {
        // De gewichten meteen ophalen én het model één keer opbouwen. Doen we dat niet, dan
        // gebeurt die download van ~100 MB pas midden in de eerste analyse — en loopt die vast
        // op een server zonder internet, een halfuur nadat je op de knop drukte.
        await zet('het model ophalen (± 100 MB)', 3)
        const ophalen = await draai(
          python,
          ['-c', "from rtmlib import Body; Body(mode='balanced', backend='onnxruntime', device='cpu'); print('ok')"],
          { env: { ...process.env, PYTHONPATH: doel } },
        )
        if (ophalen.code !== 0) {
          throw new Error(
            `Het model kon niet opgehaald worden: ${ophalen.err.split('\n').pop() || ophalen.code}. ` +
              'rtmlib haalt zijn gewichten bij download.openmmlab.com — kan deze server daarbij?',
          )
        }
      }

      await schrijfRuntimeStand({
        ...stand,
        status: 'klaar',
        stap: 'Klaar',
        stapNummer: stappen,
        geeindigd: new Date().toISOString(),
        python,
        versie: PYTHON_VERSIE,
      })
      klaar?.()
    } catch (err) {
      await schrijfRuntimeStand({
        ...stand,
        status: 'mislukt',
        fout: err instanceof Error ? err.message : 'Onbekende fout',
        geeindigd: new Date().toISOString(),
      })
    } finally {
      bezig = false
    }
  })()

  return { ok: true, stand }
}
