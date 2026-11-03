import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

// De Android-apps (APK's) die je op de site kan downloaden (pagina /app, bestanden via /api/app/<id>).
//
// De bestanden staan in `app-downloads/`, NIET in `public/`: zo gaan ze altijd door de route, die het juiste
// bestandstype, de bestandsnaam en hervatbare downloads (Range) meegeeft. Welke versie er staat, staat in
// `app-downloads/manifest.json`; de grootte en het controlegetal (SHA-256) rekenen we hier uit het bestand zelf,
// zodat ze nooit achterlopen. Een nieuwe versie uitbrengen: docs/APP-DOWNLOAD.md.

export const DOWNLOAD_MAP = path.join(process.cwd(), 'app-downloads')

export type AppItem = {
  /** Sleutel in de URL: /api/app/<id>. */
  id: string
  naam: string
  bestand: string
  versie: string
  versieCode: number
  /** ISO-datum (yyyy-mm-dd) van deze versie. */
  datum: string
}

export type AppBestand = AppItem & { grootte: number; sha256: string }

/** Enkel gewone bestandsnamen op .apk: nooit een pad, nooit `..`. */
const VEILIGE_NAAM = /^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/

export function veiligBestand(bestand: string): boolean {
  return VEILIGE_NAAM.test(bestand) && !bestand.includes('..')
}

export function bestandsPad(bestand: string): string | null {
  if (!veiligBestand(bestand)) return null
  const pad = path.join(DOWNLOAD_MAP, bestand)
  return pad.startsWith(DOWNLOAD_MAP + path.sep) ? pad : null
}

export async function leesManifest(): Promise<AppItem[]> {
  const ruw = JSON.parse(await readFile(path.join(DOWNLOAD_MAP, 'manifest.json'), 'utf8')) as { apps?: AppItem[] }
  return (ruw.apps ?? []).filter((a) => a && typeof a.id === 'string' && typeof a.bestand === 'string' && veiligBestand(a.bestand))
}

// Het controlegetal van een bestand van 2 MB is goedkoop, maar niet bij elk bezoek nodig: onthouden per
// bestand zolang het bestand niet wijzigt (tijdstip + grootte).
const onthouden = new Map<string, { sleutel: string; sha256: string }>()

export async function leesApp(item: AppItem): Promise<AppBestand | null> {
  const pad = bestandsPad(item.bestand)
  if (!pad) return null
  let info
  try {
    info = await stat(pad)
  } catch {
    return null
  }
  const sleutel = `${info.mtimeMs}:${info.size}`
  let hit = onthouden.get(pad)
  if (!hit || hit.sleutel !== sleutel) {
    hit = { sleutel, sha256: createHash('sha256').update(await readFile(pad)).digest('hex') }
    onthouden.set(pad, hit)
  }
  return { ...item, grootte: info.size, sha256: hit.sha256 }
}

/** Alle apps uit het manifest waarvan het bestand er ook echt staat. */
export async function alleApps(): Promise<AppBestand[]> {
  const uit: AppBestand[] = []
  for (const item of await leesManifest()) {
    const app = await leesApp(item)
    if (app) uit.push(app)
  }
  return uit
}

export async function appVoorId(id: string): Promise<AppBestand | null> {
  const item = (await leesManifest()).find((a) => a.id === id)
  return item ? leesApp(item) : null
}

/** "2,2 MB" — met een komma, zoals we het in het Nederlands schrijven. */
export function grootteTekst(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * Eén bytebereik uit een `Range`-header (`bytes=0-499`, `bytes=500-`, `bytes=-200`).
 * `null` = geen (bruikbare) header → het hele bestand; `'ongeldig'` = buiten het bestand (416).
 * Meerdere bereiken ondersteunen we niet: dan sturen we gewoon het hele bestand.
 */
export function leesBereik(header: string | null, grootte: number): { start: number; eind: number } | 'ongeldig' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, a, b] = m
  if (a === '' && b === '') return null
  let start: number
  let eind: number
  if (a === '') {
    // laatste N bytes
    const n = Number(b)
    if (!Number.isFinite(n) || n <= 0) return 'ongeldig'
    start = Math.max(0, grootte - n)
    eind = grootte - 1
  } else {
    start = Number(a)
    eind = b === '' ? grootte - 1 : Math.min(Number(b), grootte - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(eind) || start >= grootte || start > eind) return 'ongeldig'
  return { start, eind }
}
