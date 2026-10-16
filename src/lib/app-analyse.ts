import { createHmac, timingSafeEqual } from 'node:crypto'
import fs from 'fs/promises'
import path from 'path'

import { resolveMediaDir } from './media-dir'

// Analyse uit de krachtbal-analyse-app (de desktop-app die de video verwerkt). De app levert per
// analysewedstrijd een pakket bestanden: de volledige meetdata (wedstrijd_data.json), haar
// interactieve wedstrijdcentrum, de samenvatting (pdf/png), het veldbeeld, coachtekst, spelers.csv
// en video's (de wedstrijdvideo, volgcamera-reels, doelpuntclips). Die staan op het volume onder
// media/app-analyse/<matchId>/ en de analysepagina bouwt zich daaruit op.
//
// Een pakket hoort enkel bij een eigen analyse-opname (analyseOnly) en is privé: alleen wie de
// analyse mag zien, krijgt de bestanden — rechtstreeks met zijn sessie, of via een ondertekende
// link (nodig binnen het afgeschermde iframe van het wedstrijdcentrum, dat zonder cookies werkt).

/** Bestandsnamen die in een pakket mogen: plat, kleine letters, bekende soorten. */
const BESTAND_RE = /^[a-z0-9][a-z0-9_.-]{0,80}\.(json|html|pdf|png|jpg|csv|txt|mp4)$/

export function geldigBestand(naam: string): boolean {
  return BESTAND_RE.test(naam) && !naam.includes('..')
}

const SOORTEN: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  mp4: 'video/mp4',
}

export function inhoudSoort(naam: string): string {
  return SOORTEN[naam.split('.').pop() ?? ''] ?? 'application/octet-stream'
}

export function appMap(matchId: number): string {
  return path.join(resolveMediaDir(), 'app-analyse', String(Math.trunc(matchId)))
}

export interface AppBestand {
  naam: string
  bytes: number
  /** Korte omschrijving voor de pagina (bv. "Volgcamera · alle spelers"). */
  titel?: string
}

export interface AppManifest {
  wedstrijd: string
  gemaakt: string
  appVersie?: string
  bestanden: AppBestand[]
}

/** Het manifest van het pakket (null = deze wedstrijd heeft geen analyse uit de app). */
export async function leesManifest(matchId: number): Promise<AppManifest | null> {
  try {
    const m = JSON.parse(await fs.readFile(path.join(appMap(matchId), 'manifest.json'), 'utf8')) as AppManifest
    if (!m || !Array.isArray(m.bestanden)) return null
    return { ...m, bestanden: m.bestanden.filter((b) => b && geldigBestand(String(b.naam))) }
  } catch {
    return null
  }
}

/** Een JSON-bestand uit het pakket (null als het ontbreekt of onleesbaar is). */
export async function leesAppJson<T>(matchId: number, naam: string): Promise<T | null> {
  if (!geldigBestand(naam) || !naam.endsWith('.json')) return null
  try {
    return JSON.parse(await fs.readFile(path.join(appMap(matchId), naam), 'utf8')) as T
  } catch {
    return null
  }
}

/** Een tekstbestand uit het pakket (null als het ontbreekt). */
export async function leesAppTekst(matchId: number, naam: string): Promise<string | null> {
  if (!geldigBestand(naam)) return null
  return fs.readFile(path.join(appMap(matchId), naam), 'utf8').catch(() => null)
}

// ── Ondertekende links ──
// HMAC over (wedstrijd, bestand, vervaltijd) met het server-geheim. Zo kan het afgeschermde iframe
// (geen cookies) toch de video en de bestanden van dít pakket laden, en niets anders.

function geheim(): string {
  return process.env.PAYLOAD_SECRET || process.env.CV_BRIDGE_TOKEN || ''
}

export function teken(matchId: number, naam: string, tot: number): string {
  return createHmac('sha256', `app-analyse:${geheim()}`).update(`${Math.trunc(matchId)}/${naam}/${tot}`).digest('hex').slice(0, 32)
}

export function ondertekendeUrl(matchId: number, naam: string, geldigS = 24 * 3600, nu = Date.now()): string {
  const tot = Math.floor(nu / 1000) + geldigS
  return `/api/analyse/app/${Math.trunc(matchId)}/${naam}?tot=${tot}&sig=${teken(matchId, naam, tot)}`
}

export function handtekeningGeldig(matchId: number, naam: string, tot: string | null, sig: string | null, nu = Date.now()): boolean {
  if (!geheim() || !tot || !sig || !/^\d+$/.test(tot) || !/^[a-f0-9]{32}$/.test(sig)) return false
  if (Number(tot) * 1000 < nu) return false
  const a = Buffer.from(teken(matchId, naam, Number(tot)))
  const b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Range-header → bytebereik; null = geen (geldige) range gevraagd, 'buiten' = 416. */
export function leesRange(header: string | null, totaal: number): { start: number; einde: number } | 'buiten' | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header) : null
  if (!m || (m[1] === '' && m[2] === '')) return null
  const achteraan = m[1] === '' && m[2] !== ''
  const start = achteraan ? Math.max(0, totaal - parseInt(m[2], 10)) : parseInt(m[1], 10)
  const einde = achteraan || m[2] === '' ? totaal - 1 : Math.min(parseInt(m[2], 10), totaal - 1)
  if (!Number.isFinite(start) || start >= totaal || start > einde) return 'buiten'
  return { start, einde }
}

// ── Deellink (zoals bij Veo: een link die je naar spelers of ouders stuurt) ──
// Wie de link heeft, ziet de analyse en de GEDEELDE notities, zonder account. De eigenaar maakt
// ze aan en kan ze intrekken (dan werkt de oude link meteen niet meer). Bewaard op het volume:
// deel/<token>.json → { matchId } en deel/wedstrijd-<id>.json → { token }.

const TOKEN_RE = /^[a-f0-9]{32}$/

function deelMap(): string {
  return path.join(resolveMediaDir(), 'app-analyse-deel')
}

export async function deelToken(matchId: number): Promise<string | null> {
  try {
    const d = JSON.parse(await fs.readFile(path.join(deelMap(), `wedstrijd-${Math.trunc(matchId)}.json`), 'utf8'))
    return typeof d?.token === 'string' && TOKEN_RE.test(d.token) ? d.token : null
  } catch {
    return null
  }
}

export async function maakDeelToken(matchId: number): Promise<string> {
  const bestaand = await deelToken(matchId)
  if (bestaand) return bestaand
  const { randomBytes } = await import('node:crypto')
  const token = randomBytes(16).toString('hex')
  await fs.mkdir(deelMap(), { recursive: true })
  await fs.writeFile(path.join(deelMap(), `${token}.json`), JSON.stringify({ matchId: Math.trunc(matchId), gemaakt: new Date().toISOString() }))
  await fs.writeFile(path.join(deelMap(), `wedstrijd-${Math.trunc(matchId)}.json`), JSON.stringify({ token }))
  return token
}

export async function trekDeelTokenIn(matchId: number): Promise<void> {
  const token = await deelToken(matchId)
  if (token) await fs.rm(path.join(deelMap(), `${token}.json`), { force: true })
  await fs.rm(path.join(deelMap(), `wedstrijd-${Math.trunc(matchId)}.json`), { force: true })
}

/** De wedstrijd achter een deellink (null = onbekende of ingetrokken link). */
export async function wedstrijdVanDeelToken(token: string): Promise<number | null> {
  if (!TOKEN_RE.test(token)) return null
  try {
    const d = JSON.parse(await fs.readFile(path.join(deelMap(), `${token}.json`), 'utf8'))
    const id = Number(d?.matchId)
    // Dubbel gecontroleerd: de wedstrijd moet deze token nog altijd als haar link hebben.
    return Number.isInteger(id) && (await deelToken(id)) === token ? id : null
  } catch {
    return null
  }
}
