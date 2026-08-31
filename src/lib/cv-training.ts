import { spawn } from 'child_process'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import type { Payload } from 'payload'

import { cvMap, instellingenPad, pythonVoorSpawn, spawnOmgeving, werkmap } from './cv-analyse'
import { resolveMediaDir } from './media-dir'
import { reeksHalfDurationSeconds, type Reeks } from './reeksen'
import { momentToVideo, readSync } from './video-sync'

// Het model bijstellen op de eigen wedstrijden — vanuit de app, niet vanaf een commandolijn.
//
// De lus die cv/train.py mogelijk maakt, heeft twee kanten die allebei al bestaan:
//   • de meting — elke AI-analyse laat `houding-reeks.jsonl` achter in de werkmap van die
//     wedstrijd (op het volume, dus die stapelt zich op);
//   • de waarheid — de worpen die de aantekenaar tijdens de wedstrijd invoerde, met hun helft
//     en wedstrijdklok, via de ijkpunten om te rekenen naar videotijd.
// Hier worden die twee bij elkaar gebracht en door de trainer gehaald.
//
// Belangrijk voor de plek waar het resultaat landt: NIET in de repo. Die wordt bij elke uitrol
// opnieuw uitgepakt, dus een `cv/model-houding.json` daar zou telkens verdwijnen. Het bestand
// staat op het volume, naast de werkmappen, en `houding.py` krijgt het pad mee.

export { instellingenPad }

export type Wedstrijdlabel = { half: number; gameClock: number }

/**
 * De worpen van een wedstrijd als labels-JSONL, op videotijd.
 *
 * Zelfde vorm als `cv/sync.py` levert, zodat de trainer niet hoeft te weten waar zijn labels
 * vandaan komen. Puur, zodat de omrekening zonder database te testen valt: staat die scheef,
 * dan traint het model op verkeerde momenten en is er niets aan te zien.
 */
export function labelRegels(
  worpen: Wedstrijdlabel[],
  sync: { offsetH1: number; offsetH2: number | null },
  halfSeconds: number,
): string {
  return worpen
    .map((w) => momentToVideo(w, sync, halfSeconds))
    .sort((a, b) => a - b)
    .map((t) => JSON.stringify({ video_time_s: Number(t.toFixed(3)), event_type: 'worp' }))
    .join('\n')
}

export type Trainingskandidaat = {
  matchId: number
  /** Pad naar de meetreeks van die wedstrijd. */
  reeks: string
  /** Pad naar de labels die we ernaast schreven. */
  labels: string
  worpen: number
  metingen: number
}

export type Overgeslagen = { matchId: number; reden: string }

/** Elke matchmap op het volume die een meetreeks bevat, nieuwste eerst. */
async function mappenMetReeks(): Promise<number[]> {
  const wortel = path.join(resolveMediaDir(), 'cv-analyse')
  const namen = await fs.readdir(wortel).catch(() => [] as string[])
  return namen
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0)
    .filter((n) => existsSync(path.join(werkmap(n), 'houding-reeks.jsonl')))
    .sort((a, b) => a - b)
}

/**
 * Alle wedstrijden waarop getraind kan worden, met de labels er meteen naast geschreven.
 *
 * Een wedstrijd valt af wanneer er geen ijking is (dan staan de worpen op de verkeerde
 * videotijd — dat is erger dan geen labels), of wanneer er geen worpen ingevoerd zijn. Wat
 * afvalt en waarom komt mee terug: stilzwijgend overslaan is precies hoe je maandenlang op
 * twee wedstrijden traint zonder het te weten.
 */
export async function verzamelWedstrijden(
  payload: Payload,
): Promise<{ kandidaten: Trainingskandidaat[]; overgeslagen: Overgeslagen[] }> {
  const kandidaten: Trainingskandidaat[] = []
  const overgeslagen: Overgeslagen[] = []

  for (const matchId of await mappenMetReeks()) {
    const map = werkmap(matchId)
    const reeks = path.join(map, 'houding-reeks.jsonl')
    const match = await payload
      .findByID({ collection: 'matches', id: matchId, depth: 0 })
      .catch(() => null)
    if (!match) {
      overgeslagen.push({ matchId, reden: 'wedstrijd bestaat niet meer' })
      continue
    }
    if (typeof match.videoOffsetH1 !== 'number') {
      overgeslagen.push({ matchId, reden: 'de video is niet geijkt — de worpen zouden op de verkeerde seconde staan' })
      continue
    }
    const worpenRes = await payload
      .find({ collection: 'throws', where: { match: { equals: matchId } }, depth: 0, limit: 2000 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const worpen = worpenRes.docs.map((t) => ({
      half: Number((t as { period?: unknown }).period ?? 1),
      gameClock: Number((t as { gameClock?: unknown }).gameClock ?? 0),
    }))
    if (!worpen.length) {
      overgeslagen.push({ matchId, reden: 'geen ingevoerde worpen om mee te vergelijken' })
      continue
    }

    const sync = readSync({ offsetH1: match.videoOffsetH1, offsetH2: match.videoOffsetH2 })
    const labels = path.join(map, 'labels.jsonl')
    await fs.writeFile(labels, labelRegels(worpen, sync, reeksHalfDurationSeconds(match.reeks as Reeks)) + '\n', 'utf8')
    const metingen = (await fs.readFile(reeks, 'utf8').catch(() => '')).split('\n').filter(Boolean).length
    kandidaten.push({ matchId, reeks, labels, worpen: worpen.length, metingen })
  }
  return { kandidaten, overgeslagen }
}

/**
 * Welke wedstrijd buiten het fitten blijft.
 *
 * De laatste (hoogste id = meest recente analyse): dan meet je op beelden die het model niet
 * gezien heeft, en dat is het enige cijfer dat iets zegt. Met één wedstrijd kan het niet — dan
 * geeft de trainer zelf de waarschuwing mee.
 */
export function kiesHoldout(kandidaten: Trainingskandidaat[]): number | null {
  if (kandidaten.length < 2) return null
  return kandidaten[kandidaten.length - 1].matchId
}

/** De argumenten voor cv/train.py — puur, zodat een verkeerde vlag hier opvalt in een test. */
export function trainArgv(
  kandidaten: Trainingskandidaat[],
  holdout: number | null,
  uit: string,
  cv = cvMap(),
): string[] {
  const argv = [path.join(cv, 'train.py')]
  for (const k of kandidaten) argv.push('--wedstrijd', k.reeks, k.labels)
  // De naam van een wedstrijd in het rapport is <match-id>/houding-reeks (cv/train.py zet de
  // map ervoor omdat alle reeksen dezelfde bestandsnaam hebben), dus zo vindt --holdout ze.
  if (holdout != null) argv.push('--holdout', String(holdout))
  argv.push('--uit', uit)
  return argv
}

export type Trainingsrapport = {
  drempel: number
  min_afstand_s: number
  getraind_op: string[]
  holdout_wedstrijden: string[]
  training: Record<string, number | null>
  holdout: Record<string, number | null> | null
  gemaakt: string
}

export type Trainingsresultaat =
  | { ok: true; rapport: Trainingsrapport; uitvoer: string; kandidaten: Trainingskandidaat[]; overgeslagen: Overgeslagen[] }
  | { ok: false; fout: string; code: number; overgeslagen?: Overgeslagen[] }

/** Het huidige model: wat er getraind is, of niets. */
export async function leesInstellingen(): Promise<Trainingsrapport | null> {
  const ruw = await fs.readFile(instellingenPad(), 'utf8').catch(() => null)
  if (!ruw) return null
  try {
    const g = JSON.parse(ruw) as Trainingsrapport
    return typeof g?.drempel === 'number' ? g : null
  } catch {
    return null
  }
}

/**
 * Trainen: reeksen + labels verzamelen, cv/train.py draaien, het rapport teruggeven.
 *
 * Dit duurt seconden (het dure meten gebeurde al tijdens de analyses), dus het mag gewoon in
 * het verzoek zelf — geen achtergrondtaak met een stand in de database zoals bij de analyse.
 */
export async function trainModel(payload: Payload): Promise<Trainingsresultaat> {
  const { kandidaten, overgeslagen } = await verzamelWedstrijden(payload)
  if (!kandidaten.length) {
    return {
      ok: false,
      code: 400,
      overgeslagen,
      fout: 'Nog geen bruikbare wedstrijd. Er is een analyse met het houdingsmodel nodig (die '
        + 'bewaart de meting), plus een geijkte video en ingevoerde worpen om mee te vergelijken.',
    }
  }

  const uit = instellingenPad()
  await fs.mkdir(path.dirname(uit), { recursive: true })
  const argv = trainArgv(kandidaten, kiesHoldout(kandidaten), uit)
  const python = await pythonVoorSpawn()

  const uitvoer = await new Promise<{ code: number; tekst: string; fout: string }>((resolve) => {
    const kind = spawn(python.pad, argv, { stdio: ['ignore', 'pipe', 'pipe'], env: spawnOmgeving(python) })
    let tekst = ''
    let fout = ''
    kind.stdout?.on('data', (d) => {
      tekst += String(d)
    })
    kind.stderr?.on('data', (d) => {
      fout += String(d)
    })
    kind.on('error', (e) => resolve({ code: -1, tekst, fout: e.message }))
    kind.on('close', (code) => resolve({ code: code ?? -1, tekst, fout }))
  })

  if (uitvoer.code !== 0) {
    return { ok: false, code: 500, overgeslagen, fout: uitvoer.fout.trim() || `de trainer stopte met code ${uitvoer.code}` }
  }
  const rapport = await leesInstellingen()
  if (!rapport) return { ok: false, code: 500, overgeslagen, fout: 'de trainer schreef geen bruikbaar resultaat weg' }
  return { ok: true, rapport, uitvoer: uitvoer.tekst.trim(), kandidaten, overgeslagen }
}
