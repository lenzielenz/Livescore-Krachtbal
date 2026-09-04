import path from 'path'

import type { Payload } from 'payload'

import { leesJsonl, werkmap, werkmapCamera2 } from './cv-analyse'
import { CAMERA2_BASIS } from './cv-samenvoegen'
import { leesToewijzing } from './cv-werpers'

// Loopafstand, sprintjes en topsnelheid — op de server, uit de tracking-posities.
//
// cv/fysiek.py kon dit al vanaf de commandolijn, maar de keten was niet dichtgelast: de
// server-analyse eindigde bij posities.jsonl en niemand zonder terminal kon er fysieke stats
// van maken. Deze module is de TypeScript-spiegel van de telling in fysiek.py — dezélfde
// parameters, dezelfde volgorde (eerst gladstrijken, dan tellen met dode band) — zodat het
// getal "gelopen meters" niet afhangt van wáár het berekend werd.
//
// De toewijzing spoor → speler blijft een menselijke stap (de tracker wisselt bij occlusie al
// eens van identiteit), maar krijgt nu een scherm in plaats van een wie.json op de terminal:
// matches.cvSporen, beheerd via /api/cv/match/[id]/sporen. Het resultaat gaat als geheel naar
// matches.cvFysiek — een eigen méting, geen afgeleide van worp-events, dus dat mág opgeslagen.

// Zelfde afspraken als cv/fysiek.py — wijzig je er hier één, wijzig hem dan óók daar, anders
// meet het losse script een andere wedstrijd dan de server.
export const SPRINT_DREMPEL_M_S = 4.0
export const SPRINT_MIN_DUUR_S = 1.0
export const MAX_GAT_S = 2.0
export const MAX_SNELHEID_M_S = 8.0
export const GLAD_VENSTER_S = 0.75
export const RUIS_DREMPEL_M = 0.4

/** Eén tracking-waarneming: spoor `spoor` stond op tijd `t` op (xM, yM), in veldmeters. */
export type Positie = { t: number; spoor: number; xM: number; yM: number }

type Punt = { t: number; x: number; y: number }

/**
 * De JSONL-regels van tracking.py ({t, track, x_m, y_m}) als posities.
 *
 * Sporen van camera 2 krijgen CAMERA2_BASIS erbij: de spoornummers beginnen per video opnieuw,
 * dus "spoor 3" van camera 1 en van camera 2 zijn twee verschillende mensen. De tijden blijven
 * in de eigen tijdlijn van de camera — voor afstand en sprints telt alleen het verschil tussen
 * opeenvolgende waarnemingen, en wie een spoor wil herkennen spoelt tóch die camera's beeld af.
 */
export function leesPosities(regels: Record<string, unknown>[], camera: 1 | 2 = 1): Positie[] {
  const uit: Positie[] = []
  for (const r of regels) {
    const t = Number(r.t)
    const spoor = Number(r.track)
    const xM = Number(r.x_m)
    const yM = Number(r.y_m)
    if (!Number.isFinite(t) || !Number.isInteger(spoor) || !Number.isFinite(xM) || !Number.isFinite(yM)) continue
    // Een spoornummer dat de camera 2-basis raakt kan niet meer eenduidig genamespacet worden:
    // meenemen zou twee mensen op één sleutel zetten, en dat is erger dan dit (pathologische)
    // spoor laten vallen.
    if (spoor < 0 || spoor >= CAMERA2_BASIS) continue
    uit.push({ t, spoor: camera === 2 ? spoor + CAMERA2_BASIS : spoor, xM, yM })
  }
  return uit
}

/**
 * Glijdend gemiddelde over de positie, binnen ±venster/2 seconden (spiegel van glad_spoor).
 *
 * Zonder dit telt elke meetruis mee als afgelegde weg: hoe dichter bemonsterd, hoe meer
 * ruis-kronkels er optellen. De tijdstempels blijven staan; alleen x en y worden gemiddeld.
 */
export function gladSpoor(punten: Punt[], vensterS = GLAD_VENSTER_S): Punt[] {
  if (vensterS <= 0 || punten.length < 3) return punten
  const half = vensterS / 2
  const uit: Punt[] = []
  let begin = 0
  let einde = 0
  for (let i = 0; i < punten.length; i++) {
    const t = punten[i].t
    while (punten[begin].t < t - half) begin++
    while (einde + 1 < punten.length && punten[einde + 1].t <= t + half) einde++
    const venster = punten.slice(begin, einde + 1)
    uit.push({
      t,
      x: venster.reduce((s, p) => s + p.x, 0) / venster.length,
      y: venster.reduce((s, p) => s + p.y, 0) / venster.length,
    })
    if (i >= einde) einde = i
  }
  return uit
}

export type SpoorFysiek = {
  afstandM: number
  sprints: number
  topsnelheidMS: number
  actieveS: number
}

/**
 * Per spoor: afstand, sprints, topsnelheid en actieve seconden (spiegel van fysiek_per_spoor).
 *
 * Segmenten met een gat > MAX_GAT_S of een snelheid > MAX_SNELHEID_M_S worden overgeslagen
 * (spoor kwijt / identiteitswissel) — liever iets te weinig meters dan spooksprints. Meters
 * tellen via een dode band van RUIS_DREMPEL_M: jitter danst rond één plek en haalt de drempel
 * niet, echte verplaatsing schuift het referentiepunt gewoon mee.
 */
export function fysiekPerSpoor(posities: Positie[]): Map<number, SpoorFysiek> {
  const perSpoor = new Map<number, Punt[]>()
  for (const p of posities) {
    const lijst = perSpoor.get(p.spoor) ?? []
    lijst.push({ t: p.t, x: p.xM, y: p.yM })
    perSpoor.set(p.spoor, lijst)
  }

  const uit = new Map<number, SpoorFysiek>()
  for (const [spoor, ruwePunten] of perSpoor) {
    ruwePunten.sort((a, b) => a.t - b.t)
    const punten = gladSpoor(ruwePunten)
    let afstand = 0
    let top = 0
    let actief = 0
    let sprints = 0
    let sprintStart: number | null = null
    let sprintGeteld = false // één aaneengesloten sprint telt één keer, hoe lang die ook duurt
    let referentie: { x: number; y: number } | null = null // dode band: laatste getelde plek
    for (let i = 0; i + 1 < punten.length; i++) {
      const a = punten[i]
      const b = punten[i + 1]
      const dt = b.t - a.t
      if (dt <= 0 || dt > MAX_GAT_S) {
        sprintStart = null
        sprintGeteld = false
        referentie = null
        continue
      }
      const stap = Math.hypot(b.x - a.x, b.y - a.y)
      const snelheid = stap / dt
      if (snelheid > MAX_SNELHEID_M_S) {
        sprintStart = null
        sprintGeteld = false
        referentie = null
        continue
      }
      if (referentie == null) referentie = { x: a.x, y: a.y }
      const verplaatsing = Math.hypot(b.x - referentie.x, b.y - referentie.y)
      if (verplaatsing >= RUIS_DREMPEL_M) {
        afstand += verplaatsing
        referentie = { x: b.x, y: b.y }
      }
      actief += dt
      top = Math.max(top, snelheid)
      if (snelheid >= SPRINT_DREMPEL_M_S) {
        if (sprintStart == null) sprintStart = a.t
        if (!sprintGeteld && b.t - sprintStart >= SPRINT_MIN_DUUR_S) {
          sprints++
          sprintGeteld = true
        }
      } else {
        sprintStart = null
        sprintGeteld = false
      }
    }
    uit.set(spoor, {
      afstandM: Math.round(afstand * 10) / 10,
      sprints,
      topsnelheidMS: Math.round(top * 100) / 100,
      actieveS: Math.round(actief * 10) / 10,
    })
  }
  return uit
}

export type SpoorInfo = {
  spoor: number
  /** Uit welke opname dit spoor komt (spoornummers ≥ CAMERA2_BASIS zijn camera 2). */
  camera: 1 | 2
  /** Wanneer het spoor leefde (seconden in de eigen opname) en waar het gemiddeld stond. */
  eerste: number
  laatste: number
  gemXM: number
  gemYM: number
} & SpoorFysiek

/**
 * De sporen met hun hints, meeste meters eerst — wat een mens nodig heeft om te zeggen wie wie
 * is (het scherm-equivalent van het --sjabloon-bestand van fysiek.py).
 */
export function spoorOverzicht(posities: Positie[]): SpoorInfo[] {
  const fysiek = fysiekPerSpoor(posities)
  const perSpoor = new Map<number, Positie[]>()
  for (const p of posities) {
    const lijst = perSpoor.get(p.spoor) ?? []
    lijst.push(p)
    perSpoor.set(p.spoor, lijst)
  }
  const uit: SpoorInfo[] = []
  for (const [spoor, lijst] of perSpoor) {
    const tijden = lijst.map((p) => p.t)
    const f = fysiek.get(spoor)
    if (!f) continue
    uit.push({
      spoor,
      camera: spoor >= CAMERA2_BASIS ? 2 : 1,
      eerste: Math.min(...tijden),
      laatste: Math.max(...tijden),
      gemXM: Math.round((lijst.reduce((s, p) => s + p.xM, 0) / lijst.length) * 10) / 10,
      gemYM: Math.round((lijst.reduce((s, p) => s + p.yM, 0) / lijst.length) * 10) / 10,
      ...f,
    })
  }
  return uit.sort((a, b) => b.afstandM - a.afstandM || a.spoor - b.spoor)
}

/** Dezelfde vorm als het fysiek-endpoint verwacht (en AnalyseDetailView toont). */
export type FysiekSpeler = {
  team: 'thuis' | 'uit'
  rugnummer: number
  naam?: string
  afstand_m: number
  sprints: number
  topsnelheid_m_s: number
  actieve_s: number
}

/**
 * Sporen → spelers (spiegel van bundel_per_speler): meerdere sporen op één speler tellen op —
 * identiteitswissels en de twee camera's leveren allebei extra sporen voor dezelfde mens.
 * Let wel: staat een speler in de overlapzone tegelijk op beide camera's, dan telt dat stuk
 * dubbel; wijs bij twijfel per speler de camera toe die hem het best zag.
 */
export function bundelPerSpeler(
  perSpoor: Map<number, SpoorFysiek>,
  toewijzing: Record<string, number>,
  spelers: Map<number, { team: 'thuis' | 'uit'; rugnummer: number; naam?: string }>,
): { spelers: FysiekSpeler[]; anoniem: number[] } {
  const perSpeler = new Map<string, FysiekSpeler>()
  const anoniem: number[] = []
  for (const [spoor, f] of [...perSpoor.entries()].sort((a, b) => a[0] - b[0])) {
    const spelerId = toewijzing[String(spoor)]
    const wie = spelerId != null ? spelers.get(spelerId) : undefined
    if (!wie) {
      anoniem.push(spoor)
      continue
    }
    const sleutel = `${wie.team}#${wie.rugnummer}`
    const s = perSpeler.get(sleutel) ?? {
      team: wie.team,
      rugnummer: wie.rugnummer,
      ...(wie.naam ? { naam: wie.naam } : {}),
      afstand_m: 0,
      sprints: 0,
      topsnelheid_m_s: 0,
      actieve_s: 0,
    }
    s.afstand_m = Math.round((s.afstand_m + f.afstandM) * 10) / 10
    s.sprints += f.sprints
    s.topsnelheid_m_s = Math.max(s.topsnelheid_m_s, f.topsnelheidMS)
    s.actieve_s = Math.round((s.actieve_s + f.actieveS) * 10) / 10
    perSpeler.set(sleutel, s)
  }
  return { spelers: [...perSpeler.values()], anoniem }
}

/** De tracking-posities van deze wedstrijd, beide camera's, met genamespacete spoornummers. */
export async function leesMatchPosities(matchId: number): Promise<Positie[]> {
  const cam1 = leesPosities(await leesJsonl(path.join(werkmap(matchId), 'posities.jsonl')), 1)
  const cam2 = leesPosities(await leesJsonl(path.join(werkmapCamera2(matchId), 'posities.jsonl')), 2)
  return [...cam1, ...cam2]
}

/**
 * Een vingerafdruk van déze tracking-run.
 *
 * De spoornummers zijn een artefact van één run: draait de tracking opnieuw (andere stand,
 * andere bemonstering), dan is "spoor 3" een ándere persoon. De toewijzing spoor → speler
 * bewaart daarom de vingerafdruk van de run waar ze bij hoort (sleutel "_posities" in
 * cvSporen), en de herrekening weigert een toewijzing die bij andere posities hoort — anders
 * krijgen de verkeerde spelers stilzwijgend elkaars meters. Volgorde-onafhankelijk (sommen),
 * zodat de leesvolgorde van de twee camerabestanden er niet toe doet.
 */
export function positiesVingerafdruk(posities: Positie[]): string {
  let somT = 0
  let somSpoor = 0
  let somX = 0
  for (const p of posities) {
    somT += p.t
    somSpoor += p.spoor
    somX += p.xM
  }
  return `${posities.length}|${Math.round(somT * 1000)}|${somSpoor}|${Math.round(somX * 1000)}`
}

/** De bewaarde vingerafdruk uit matches.cvSporen (sleutel "_posities"), of null. */
export function leesSporenVingerafdruk(ruw: unknown): string | null {
  if (!ruw || typeof ruw !== 'object') return null
  const v = (ruw as Record<string, unknown>)._posities
  return typeof v === 'string' && v ? v : null
}

export type Fysiekrapport = {
  sporen: number
  spelers: number
  /** Sporen zonder toewijzing — die tellen nergens in mee. */
  anoniem: number[]
  /** De bewaarde toewijzing hoort bij een vórige tracking-run: niets herrekend. */
  verouderd?: boolean
}

/**
 * De fysieke stats van deze wedstrijd herrekenen uit de posities op het volume en wegschrijven
 * naar matches.cvFysiek — hetzelfde contract als POST /api/cv/match/[id]/fysiek: elke
 * herberekening vervangt de vorige meting volledig.
 *
 * Zonder toegewezen sporen wordt er niets geschreven (en blijft een eerdere upload staan):
 * anonieme cijfers zouden op de spelerskaarten niets betekenen.
 */
export async function herrekenFysiek(payload: Payload, matchId: number): Promise<Fysiekrapport | null> {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return null
  const toewijzing = leesToewijzing(match.cvSporen)
  const posities = await leesMatchPosities(matchId)
  if (!posities.length) return null
  const perSpoor = fysiekPerSpoor(posities)
  if (!Object.keys(toewijzing).length) {
    return { sporen: perSpoor.size, spelers: 0, anoniem: [...perSpoor.keys()].sort((a, b) => a - b) }
  }
  // Hoort de toewijzing wel bij déze posities? Na een her-analyse nummert de tracker de sporen
  // opnieuw; de oude toewijzing toepassen zou de verkeerde spelers elkaars meters geven — en
  // een eerdere, correcte meting stil overschrijven. Dan liever niets doen en het zeggen.
  const bewaard = leesSporenVingerafdruk(match.cvSporen)
  if (bewaard != null && bewaard !== positiesVingerafdruk(posities)) {
    return {
      sporen: perSpoor.size,
      spelers: 0,
      anoniem: [...perSpoor.keys()].sort((a, b) => a - b),
      verouderd: true,
    }
  }

  // Wie is wie: spelers van beide ploegen, met hun kant volgens déze wedstrijd.
  const homeId = typeof match.homeTeam === 'object' ? (match.homeTeam as { id: number }).id : Number(match.homeTeam)
  const awayId = typeof match.awayTeam === 'object' ? (match.awayTeam as { id: number }).id : Number(match.awayTeam)
  const res = await payload
    .find({
      collection: 'players',
      where: { team: { in: [homeId, awayId] } },
      depth: 0,
      limit: 400,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const spelers = new Map<number, { team: 'thuis' | 'uit'; rugnummer: number; naam?: string }>()
  for (const p of res.docs) {
    const teamId = typeof p.team === 'object' && p.team ? Number((p.team as { id: number }).id) : Number(p.team)
    const rugnummer = Number((p as { shirtNumber?: unknown }).shirtNumber)
    if (!Number.isInteger(rugnummer) || rugnummer < 0 || rugnummer > 99) continue
    spelers.set(Number((p as { id: number }).id), {
      team: teamId === awayId ? 'uit' : 'thuis',
      rugnummer,
      ...(typeof (p as { name?: unknown }).name === 'string' ? { naam: (p as { name: string }).name } : {}),
    })
  }

  const bundel = bundelPerSpeler(perSpoor, toewijzing, spelers)
  if (bundel.spelers.length) {
    await payload.update({
      collection: 'matches',
      id: matchId,
      data: {
        cvFysiek: {
          spelers: bundel.spelers.sort((a, b) => a.team.localeCompare(b.team) || a.rugnummer - b.rugnummer),
          bron: 'server-analyse',
          bijgewerkt: new Date().toISOString(),
        },
      },
      overrideAccess: true,
    })
  }
  return { sporen: perSpoor.size, spelers: bundel.spelers.length, anoniem: bundel.anoniem }
}
