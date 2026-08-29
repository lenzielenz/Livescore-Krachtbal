// Server-side match-engine: vertaalt aantekenaar-acties naar immutable worp-events en
// beheert het balbezit-leven. Gebruikt de pure regellogica uit krachtbal-rules.ts.
//
// Alle mutaties draaien met overrideAccess (server is vertrouwd); de Throws-immutability
// (access.update=false) blijft gelden voor externe API-calls.

import type { Payload } from 'payload'

import type { Category } from './categories'
import { type ClubColors, clubColorsFrom, distinguishAway } from './club-colors'
import { type LogoFit, normalizeLogoFit } from './logo-fit'
import { type AttackDir, type Point, FIELD, freeThrowNorm, isOpDoellijn, projectWerpplaats } from './field'
import { buildPassNetwork, type PlayerPassStats } from './pass-network'
import { isForwardPass, passGainM } from './pass-rules'
import { reeksUsesSeniorThrows } from './reeksen'
import { sanitizeTrust, trustView, type TrustView } from './score-trust'
import { isOfficialScore } from './score-trust-store'
import { readSimpleScore } from './simple-score'
import { TRIBUNE_GRACE_MS } from './tribune'
import {
  type SetupSide,
  type TeamSide,
  type ThrowType,
  CROSS_LIMIT,
  attackDirForSide,
  deriveGeometry,
  deriveOutcome,
  isCrossThrow,
  isMidlineFault,
  isTerminalOutcome,
  nextSetup,
  ownGoalPointsForThrow,
  pointsForThrow,
  reduceTotals,
  throwsAllowed,
} from './krachtbal-rules'

export { attackDirForSide }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Aantal veldspelers per ploeg (de enige die mogen werpen). */
export const FIELD_PLAYERS = 4

/** Actieve opstelling: opgeslagen lijst, of (bij leeg) de eerste 4 spelers op rugnummer. */
async function resolveLineup(
  payload: Payload,
  stored: unknown,
  teamId: number,
): Promise<number[]> {
  const ids = Array.isArray(stored)
    ? stored.map((s) => (typeof s === 'object' && s ? (s as { id: number }).id : (s as number))).filter(Boolean)
    : []
  // Maximaal FIELD_PLAYERS staan op het veld; eventuele extra namen in een (oudere)
  // opstelling zijn wissels en worden niet als veldspeler getoond.
  if (ids.length > 0) return ids.slice(0, FIELD_PLAYERS)
  const res = await payload.find({
    collection: 'players',
    where: { team: { equals: teamId } },
    sort: 'shirtNumber',
    depth: 0,
    limit: FIELD_PLAYERS,
  })
  return res.docs.map((p) => p.id)
}

/** Minimaal 3 veldspelers (§4) en unieke rugnummers binnen de ploeg, anders een duidelijke fout. */
async function assertValidLineup(payload: Payload, playerIds: number[], label: string): Promise<void> {
  if (playerIds.length < 3) {
    throw new Error(`De ${label} heeft minder dan 3 veldspelers — vul de opstelling aan (§4).`)
  }
  const res = await payload.find({
    collection: 'players',
    where: { id: { in: playerIds } },
    depth: 0,
    limit: FIELD_PLAYERS,
  })
  const nums = res.docs.map((p) => p.shirtNumber).filter((n): n is number => typeof n === 'number')
  if (new Set(nums).size !== nums.length) {
    throw new Error(`De ${label} heeft twee spelers met hetzelfde rugnummer (§4).`)
  }
}

async function loadMatch(payload: Payload, matchId: number) {
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
  const homeId = typeof match.homeTeam === 'object' ? match.homeTeam.id : match.homeTeam
  const awayId = typeof match.awayTeam === 'object' ? match.awayTeam.id : match.awayTeam
  return { match, homeId, awayId }
}

function sideOfTeam(teamId: number, homeId: number): TeamSide {
  return teamId === homeId ? 'home' : 'away'
}

/** Speler-id uit een kapitein-relatie (object, id of null). */
function captainIdOf(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'object') return (v as { id?: number }).id ?? null
  return typeof v === 'number' ? v : null
}

async function getOpenPossession(payload: Payload, matchId: number) {
  const res = await payload.find({
    collection: 'possessions',
    where: { and: [{ match: { equals: matchId } }, { endOutcome: { exists: false } }] },
    sort: '-createdAt',
    depth: 0,
    limit: 1,
  })
  return res.docs[0] ?? null
}

/**
 * Waar de bal nu ligt binnen een balbezit — de werpplaats voor de volgende worp:
 * het laatste passpunt ná de laatste worp (§6.10), anders de laatste landing, anders het opzetpunt.
 */
async function werpplaatsIn(
  payload: Payload,
  open: { id: number; setupX?: number | null; setupY?: number | null },
  last: { landingX: number; landingY: number } | null,
  throwsSoFar: number,
): Promise<Point> {
  const passRes = await payload.find({
    collection: 'match-events',
    where: {
      and: [
        { possession: { equals: open.id } },
        { type: { equals: 'pass' } },
        { afterThrows: { equals: throwsSoFar } },
        { forward: { not_equals: true } },
      ],
    },
    sort: '-id',
    depth: 0,
    limit: 1,
  })
  const p = passRes.docs[0]
  if (p && typeof p.x === 'number' && typeof p.y === 'number') return { x: clamp01(p.x), y: clamp01(p.y) }
  if (last) return { x: clamp01(last.landingX), y: last.landingY }
  return { x: clamp01(open.setupX ?? 0.5), y: open.setupY ?? 0.5 }
}

/** Toegestane worpen voor deze wedstrijd: categorie-gebaseerd, met U16-meisjes-override (§6.8). */
function matchThrowsAllowed(category: Category, reeks: unknown, setupSide: SetupSide): number {
  if (reeksUsesSeniorThrows(reeks)) return setupSide === 'own' ? 3 : 2
  return throwsAllowed(category, setupSide)
}

async function createPossession(
  payload: Payload,
  args: {
    matchId: number
    teamId: number
    setupSide: SetupSide
    category: Category
    reeks?: unknown
    dir: AttackDir
    point: Point
    half: number
    clock: number
  },
) {
  return payload.create({
    collection: 'possessions',
    data: {
      match: args.matchId,
      team: args.teamId,
      setupSide: args.setupSide,
      throwsAllowed: matchThrowsAllowed(args.category, args.reeks, args.setupSide),
      setupX: clamp01(args.point.x),
      setupY: clamp01(args.point.y),
      dir: args.dir,
      startHalf: args.half,
      startClock: args.clock,
    },
    overrideAccess: true,
  })
}

/** Start de wedstrijd: zet live, helft 1, klok op 0, en maak het eerste balbezit. */
export async function startMatch(payload: Payload, matchId: number, startingTeamId: number) {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  // Veiligheid: een tweede keer starten maakte een tweede balbezit én een tweede half_start-event
  // aan, en zette een afgelopen wedstrijd zomaar terug op live. Eén wedstrijd start één keer.
  if (match.status === 'live') throw new Error('Deze wedstrijd is al gestart.')
  if (match.status === 'finished') {
    throw new Error('Deze wedstrijd is al afgelopen — heropen ze eerst om verder te doen.')
  }
  const side = sideOfTeam(startingTeamId, homeId)
  const dir = attackDirForSide(side, 1)

  // Leg de start-opstelling vast (eerste 4 op rugnummer) als ze nog niet gezet is.
  const homeLineup = await resolveLineup(payload, match.homeLineup, homeId)
  const awayLineup = await resolveLineup(payload, match.awayLineup, awayId)

  // Reglement §4: minstens 3 veldspelers om te spelen, en rugnummers uniek binnen een ploeg.
  // Een demo/oefenwedstrijd mag met minder (de uitleg-flow), dus daar slaan we de controle over.
  if (!match.isDemo) {
    await assertValidLineup(payload, homeLineup, 'thuisploeg')
    await assertValidLineup(payload, awayLineup, 'uitploeg')
  }

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      status: 'live',
      currentHalf: 1,
      clockSeconds: 0,
      clockRunning: false,
      homeLineup,
      awayLineup,
    },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_start', half: 1, gameClock: 0 },
    overrideAccess: true,
  })
  // Opzet bij aftrap: vanaf de eigen vrijeworplijn (diepte-afhankelijk).
  const ftNorm = freeThrowNorm(match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM)
  const ownHalfY = dir === 'up' ? ftNorm : 1 - ftNorm
  await createPossession(payload, {
    matchId,
    teamId: startingTeamId,
    setupSide: 'own',
    category: match.category as Category,
    reeks: match.reeks,
    dir,
    point: { x: 0.5, y: ownHalfY },
    half: 1,
    clock: 0,
  })
  return buildMatchState(payload, matchId)
}

export interface RecordThrowInput {
  matchId: number
  playerId: number
  type: ThrowType
  point: Point
  tapCount: 1 | 2
  touchedBeforeOut?: boolean
  /** Werpplaats (origin x, 0..1): de werper mag vóór de worp zijdelings verschuiven. Enkel de
   *  breedte (x) is vrij; de diepte (y) blijft die van de vorige landing / het opzetpunt. */
  originX?: number
  gameClock?: number
  /** Speler van de tegenploeg die de bal ving (enkel bij een gevangen worp). */
  caughtById?: number
  /** Speler van de tegenploeg die de bal naar de achterman tikte vóór de vangst (optioneel). */
  tappedById?: number
  /** Audit-trail: de gebruiker die de worp registreert. */
  actorId?: number
}

/** Registreer één worp en beheer het balbezit (afsluiten + volgend opzet). */
export async function recordThrow(payload: Payload, input: RecordThrowInput) {
  const { match, homeId, awayId } = await loadMatch(payload, input.matchId)
  // Na het eindsignaal is de uitslag definitief (§12/§19): geen worpen meer (AUDIT §3).
  if (match.status === 'finished') throw new Error('Wedstrijd is afgelopen — heropen ze eerst om te corrigeren.')
  const open = await getOpenPossession(payload, input.matchId)
  if (!open) throw new Error('Geen lopend balbezit — start de wedstrijd eerst.')

  const teamId = typeof open.team === 'object' ? open.team.id : open.team
  const side = sideOfTeam(teamId, homeId)
  const dir = (open.dir as AttackDir | null) ?? attackDirForSide(side, match.currentHalf ?? 1)
  const half = match.currentHalf ?? 1
  const clock = input.gameClock ?? match.clockSeconds ?? 0

  const existing = await payload.find({
    collection: 'throws',
    where: { possession: { equals: open.id } },
    sort: 'throwNumber',
    depth: 0,
    limit: 100,
  })
  const throwNumber = existing.docs.length + 1
  const last = existing.docs[existing.docs.length - 1]

  // De werper moet bij de ploeg horen die aan bal is. Zonder deze controle schrijft een
  // misklik (of een herverzonden actie ná een balbezitwissel) de worp weg op naam van een
  // speler van de ándere ploeg: de worp krijgt dan het teamId van het balbezit, en alle
  // afgeleide statistiek rekent die speler bij de verkeerde kant. De snelscoremodus bewaakt
  // dit al (zie simple-match-engine.ts); het veldschema deed dat niet.
  const thrower = await payload
    .findByID({ collection: 'players', id: input.playerId, depth: 0 })
    .catch(() => null)
  if (!thrower) throw new Error('Onbekende speler.')
  const throwerTeamId = typeof thrower.team === 'object' && thrower.team ? (thrower.team as { id: number }).id : thrower.team
  if (Number(throwerTeamId) !== Number(teamId)) {
    throw new Error('Die speler hoort niet bij de ploeg die aan bal is.')
  }

  // Een speler mag niet twee worpen na elkaar doen binnen hetzelfde balbezit.
  if (last) {
    const lastPlayerId = typeof last.player === 'object' ? last.player.id : last.player
    if (lastPlayerId === input.playerId) {
      throw new Error('Dezelfde speler mag niet 2 worpen na elkaar doen.')
    }
  }

  // Werpplaats: het laatste passpunt, anders de vorige landing, anders het opzetpunt. De
  // aantekenaar kan de werper daarna nog zijdelings verschuiven (alleen de breedte x — de diepte y
  // blijft gelijk), zoals in het spel.
  const hasOriginX = typeof input.originX === 'number' && Number.isFinite(input.originX)
  const base = await werpplaatsIn(payload, open, last, existing.docs.length)
  const rawOrigin: Point = { x: clamp01(hasOriginX ? (input.originX as number) : base.x), y: base.y }

  const depth = match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM
  // §6.4: lag de bal tussen doellijn en vrijeworplijn, dan schuift de werpplaats terug tot op de
  // vrijeworplijn — van dichterbij mag je niet werpen. Zonder deze projectie meet de statistiek
  // worpen te kort (en zou een doelworp van binnen de 4 m als geldig doorgaan).
  // UITZONDERING: bij de EERSTE worp van een balbezit dat opzet vanaf de doellijn (bal gevangen
  // in het doelgebied, of inworp tussen doellijn en achterlijn) is de dóéllijn de beperkende
  // lijn — dan blijft de werpplaats daar staan.
  const vanuitDoelgebied = existing.docs.length === 0 && isOpDoellijn(rawOrigin, depth)
  const origin = projectWerpplaats(rawOrigin, depth, { vanuitDoelgebied })
  const outcome = deriveOutcome({ tapCount: input.tapCount, point: input.point, dir, goalAreaDepthM: depth })
  const geom = deriveGeometry(origin, input.point, dir, depth)

  const created = await payload.create({
    collection: 'throws',
    data: {
      match: input.matchId,
      possession: open.id,
      team: teamId,
      player: input.playerId,
      throwNumber,
      type: input.type,
      outcome,
      landingX: clamp01(input.point.x),
      landingY: clamp01(input.point.y),
      distance: geom.distance,
      zone: geom.zone,
      touchedBeforeOut: outcome === 'out_back' || outcome === 'out_side' ? !!input.touchedBeforeOut : false,
      period: half,
      gameClock: clock,
      // Wie ving de bal (enkel zinvol bij een gevangen worp).
      ...(outcome === 'caught' && input.caughtById ? { caughtBy: input.caughtById } : {}),
      // Wie tikte de bal naar de achterman vóór de vangst (optioneel).
      ...(outcome === 'caught' && input.tappedById ? { tappedBy: input.tappedById } : {}),
      ...(input.actorId ? { createdBy: input.actorId } : {}),
    },
    overrideAccess: true,
  })

  // Is dit een kruisje? En zo ja: het hoeveelste van de ploeg (3e → vrijworp tegenstander)?
  // Een vrije worp is geen doelworp in open spel → telt nooit als kruisje (§6.7).
  const isDoelworp = throwNumber >= (open.throwsAllowed ?? 1)
  const openIsFreeThrow = Boolean(open.freeThrow)
  const isCross = isCrossThrow({ outcome, isDoelworp, touchedBeforeOut: input.touchedBeforeOut, freeThrow: openIsFreeThrow })
  const awardFreeThrow = isCross && (await countCrossesForTeam(payload, input.matchId, teamId)) % CROSS_LIMIT === 0

  // Bepaal of het balbezit eindigt.
  const fault = isMidlineFault({
    setupSide: open.setupSide as SetupSide,
    throwNumber,
    throwsAllowed: open.throwsAllowed ?? undefined,
    outcome,
    landing: input.point,
    dir,
  })
  const terminal = isTerminalOutcome(outcome)
  const exhausted = !terminal && throwNumber >= (open.throwsAllowed ?? 1)

  type PossessionEnd = 'goal' | 'own_goal' | 'caught' | 'out_side' | 'out_back' | 'midline_fault' | 'throws_exhausted'
  const endOutcome: PossessionEnd | null = fault
    ? 'midline_fault'
    : terminal
      ? (outcome as Exclude<typeof outcome, 'in_field'>)
      : exhausted
        ? 'throws_exhausted'
        : null

  if (endOutcome) {
    await payload.update({
      collection: 'possessions',
      id: open.id,
      data: { endOutcome },
      overrideAccess: true,
    })
    {
      // (Een afgesloten wedstrijd is hierboven al geweigerd, dus er is altijd een vervolg-opzet.)
      const ns = nextSetup({
        outcome: endOutcome as Parameters<typeof nextSetup>[0]['outcome'],
        landing: input.point,
        throwerTeam: side,
        throwerDir: dir,
        goalAreaDepthM: depth,
        touchedBeforeOut: input.touchedBeforeOut,
      })
      const nextTeamId = ns.team === 'home' ? homeId : awayId
      if (awardFreeThrow) {
        // 3e kruisje: de inworp wordt vervangen door een vrije worp voor de tegenstander.
        const ftY = ns.dir === 'up' ? 1 - freeThrowNorm(depth) : freeThrowNorm(depth)
        await payload.create({
          collection: 'possessions',
          data: {
            match: input.matchId,
            team: nextTeamId,
            setupSide: 'opponent',
            throwsAllowed: 1,
            freeThrow: true,
            setupX: 0.5,
            setupY: ftY,
            dir: ns.dir,
            startHalf: half,
            startClock: clock,
          },
          overrideAccess: true,
        })
      } else {
        await createPossession(payload, {
          matchId: input.matchId,
          teamId: nextTeamId,
          setupSide: ns.setupSide,
          category: match.category as Category,
          reeks: match.reeks,
          dir: ns.dir,
          point: ns.point,
          half,
          clock,
        })
      }
    }
  }

  return {
    throwId: created.id,
    outcome,
    type: input.type,
    points: pointsForThrow({ type: input.type, outcome, freeThrow: openIsFreeThrow }),
    // Punt voor de TEGENPARTIJ bij een eigen doelpunt (§6.6) — zodat de UI het juist kan melden.
    opponentPoints: ownGoalPointsForThrow({ outcome }),
    isCross,
    awardedFreeThrow: awardFreeThrow,
    state: await buildMatchState(payload, input.matchId),
  }
}

export interface RecordPassInput {
  matchId: number
  /** De speler die de bal vángt — hij bepaalt de nieuwe werpplaats (§6.10). */
  playerId: number
  point: Point
  gameClock?: number
  actorId?: number
}

/**
 * Registreer een pass (§6.10). Een pass verbruikt géén werpbeurt: hij verlegt de werpplaats naar
 * waar de vanger staat. Doorgeven mag enkel zijwaarts of achterwaarts — een voorwaartse pass is een
 * fout (Item 14.10) en levert de tegenpartij een opzet op vanaf de vórige werpplaats.
 *
 * We registreren de vánger, niet de gever: die volgt vanzelf uit de vorige balhouder, en zo blijft
 * de invoer even snel als bij een worp (tik + speler). Daarmee is de keten
 * pass → pass → worp bruikbaar als passnetwerk in de analyse.
 */
export async function recordPass(payload: Payload, input: RecordPassInput) {
  const { match, homeId, awayId } = await loadMatch(payload, input.matchId)
  if (match.status === 'finished') throw new Error('Wedstrijd is afgelopen — heropen ze eerst om te corrigeren.')
  const open = await getOpenPossession(payload, input.matchId)
  if (!open) throw new Error('Geen lopend balbezit — start de wedstrijd eerst.')

  const teamId = typeof open.team === 'object' ? open.team.id : open.team
  const side = sideOfTeam(teamId, homeId)
  const dir = (open.dir as AttackDir | null) ?? attackDirForSide(side, match.currentHalf ?? 1)
  const half = match.currentHalf ?? 1
  const clock = input.gameClock ?? match.clockSeconds ?? 0
  const depth = match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM

  const catcher = await payload.findByID({ collection: 'players', id: input.playerId, depth: 0 }).catch(() => null)
  if (!catcher) throw new Error('Onbekende speler.')
  const catcherTeamId = typeof catcher.team === 'object' && catcher.team ? (catcher.team as { id: number }).id : catcher.team
  if (Number(catcherTeamId) !== Number(teamId)) {
    throw new Error('Die speler hoort niet bij de ploeg die aan bal is.')
  }

  const existing = await payload.find({
    collection: 'throws',
    where: { possession: { equals: open.id } },
    sort: 'throwNumber',
    depth: 0,
    limit: 100,
  })
  const lastThrow = existing.docs[existing.docs.length - 1] ?? null
  const from = await werpplaatsIn(payload, open, lastThrow, existing.docs.length)
  const to: Point = { x: clamp01(input.point.x), y: clamp01(input.point.y) }
  const forward = isForwardPass(from, to, dir, depth)

  await payload.create({
    collection: 'match-events',
    data: {
      match: input.matchId,
      type: 'pass',
      team: teamId,
      possession: open.id,
      player: input.playerId,
      x: to.x,
      y: to.y,
      forward,
      afterThrows: existing.docs.length,
      half,
      gameClock: clock,
      ...(input.actorId ? { createdBy: input.actorId } : {}),
    },
    overrideAccess: true,
  })

  if (forward) {
    // Item 14.10: opzet voor de tegenpartij vanaf de vórige werpplaats (niet vanaf de vangplaats).
    await payload.update({
      collection: 'possessions',
      id: open.id,
      data: { endOutcome: 'pass_fault' },
      overrideAccess: true,
    })
    const ns = nextSetup({ outcome: 'pass_fault', landing: from, throwerTeam: side, throwerDir: dir, goalAreaDepthM: depth })
    await createPossession(payload, {
      matchId: input.matchId,
      teamId: ns.team === 'home' ? homeId : awayId,
      setupSide: ns.setupSide,
      category: match.category as Category,
      reeks: match.reeks,
      dir: ns.dir,
      point: ns.point,
      half,
      clock,
    })
  }

  return {
    forward,
    gainM: passGainM(from, to, dir, depth),
    state: await buildMatchState(payload, input.matchId),
  }
}

/** Ruw aantal kruisjes (zonder reset) voor een ploeg in een wedstrijd. */
async function countCrossesForTeam(payload: Payload, matchId: number, teamId: number): Promise<number> {
  const throwsRes = await payload.find({
    collection: 'throws',
    where: { and: [{ match: { equals: matchId } }, { team: { equals: teamId } }] },
    depth: 0,
    limit: 2000,
  })
  const possIds = [
    ...new Set(throwsRes.docs.map((t) => (typeof t.possession === 'object' ? t.possession.id : t.possession))),
  ]
  const possRes = await payload.find({ collection: 'possessions', where: { id: { in: possIds } }, depth: 0, limit: 1000 })
  const allowedById = new Map(possRes.docs.map((p) => [p.id, p.throwsAllowed ?? 1]))
  const freeThrowById = new Map(possRes.docs.map((p) => [p.id, Boolean(p.freeThrow)]))
  let n = 0
  for (const t of throwsRes.docs) {
    const possId = typeof t.possession === 'object' ? t.possession.id : t.possession
    const allowed = allowedById.get(possId) ?? 1
    if (
      isCrossThrow({
        outcome: t.outcome,
        isDoelworp: t.throwNumber >= allowed,
        touchedBeforeOut: t.touchedBeforeOut ?? false,
        freeThrow: freeThrowById.get(possId) ?? false,
      })
    ) {
      n += 1
    }
  }
  return n
}

/** Undo: verwijder de laatste worp en herstel het balbezit. */
export async function undoLastThrow(payload: Payload, matchId: number) {
  const { match } = await loadMatch(payload, matchId)
  if (match.status === 'finished') throw new Error('Wedstrijd is afgelopen — heropen ze eerst om te corrigeren.')
  // Enkel de laatste worp van de HUIDIGE helft, gesorteerd op het monotone id (niet createdAt —
  // dat kan bij snelle tikken op ms-niveau gelijk zijn). Voorkomt dat undo over de helftgrens
  // heen een oud balbezit heropent (AUDIT §3).
  const res = await payload.find({
    collection: 'throws',
    where: { and: [{ match: { equals: matchId } }, { period: { equals: match.currentHalf ?? 1 } }] },
    sort: '-id',
    depth: 0,
    limit: 1,
  })
  const last = res.docs[0]

  // Een net aangevraagde vrije worp (VW) heeft nog GEEN worp — undo moet ze dan tóch kunnen
  // annuleren: verwijder het lege, openstaande vrijeworp-balbezit en heropen het vorige balbezit.
  const newestPossRes = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    sort: '-id',
    depth: 0,
    limit: 1,
  })
  const newestPoss = newestPossRes.docs[0]
  if (newestPoss && newestPoss.freeThrow && newestPoss.endOutcome == null) {
    const lastPossId = last ? (typeof last.possession === 'object' ? (last.possession as { id: number }).id : last.possession) : null
    const cnt = await payload.count({ collection: 'throws', where: { possession: { equals: newestPoss.id } } })
    if (cnt.totalDocs === 0 && (lastPossId == null || Number(newestPoss.id) > Number(lastPossId))) {
      await payload.delete({ collection: 'possessions', id: newestPoss.id, overrideAccess: true })
      // Heropen het balbezit dat door de VW werd afgesloten (het nieuwste daarvóór).
      const prev = await payload.find({
        collection: 'possessions',
        where: { and: [{ match: { equals: matchId } }, { id: { less_than: newestPoss.id } }] },
        sort: '-id',
        depth: 0,
        limit: 1,
      })
      if (prev.docs[0]) {
        await payload.update({ collection: 'possessions', id: prev.docs[0].id, data: { endOutcome: null }, overrideAccess: true })
      }
      return buildMatchState(payload, matchId)
    }
  }

  // Een pass ná de laatste worp is de jongste gebeurtenis: die moet undo eerst terugdraaien,
  // anders zou een verkeerd getikte pass blijven staan terwijl de worp ervóór verdwijnt (§6.10).
  if (newestPoss && newestPoss.endOutcome == null) {
    const throwsHere = await payload.count({ collection: 'throws', where: { possession: { equals: newestPoss.id } } })
    const lastPass = await payload.find({
      collection: 'match-events',
      where: {
        and: [
          { possession: { equals: newestPoss.id } },
          { type: { equals: 'pass' } },
          { afterThrows: { equals: throwsHere.totalDocs } },
        ],
      },
      sort: '-id',
      depth: 0,
      limit: 1,
    })
    if (lastPass.docs[0]) {
      await payload.delete({ collection: 'match-events', id: lastPass.docs[0].id, overrideAccess: true })
      return buildMatchState(payload, matchId)
    }
  }

  // Een voorwaartse pass sloot het balbezit af zonder worp: dan is er een leeg vervolg-balbezit.
  // Undo draait de fout terug — pass weg, vorig balbezit weer open.
  if (newestPoss && newestPoss.endOutcome == null) {
    const cntNew = await payload.count({ collection: 'throws', where: { possession: { equals: newestPoss.id } } })
    if (cntNew.totalDocs === 0) {
      const prev = await payload.find({
        collection: 'possessions',
        where: { and: [{ match: { equals: matchId } }, { id: { less_than: newestPoss.id } }, { endOutcome: { equals: 'pass_fault' } }] },
        sort: '-id',
        depth: 0,
        limit: 1,
      })
      const vorige = prev.docs[0]
      if (vorige) {
        const fout = await payload.find({
          collection: 'match-events',
          where: { and: [{ possession: { equals: vorige.id } }, { type: { equals: 'pass' } }, { forward: { equals: true } }] },
          sort: '-id',
          depth: 0,
          limit: 1,
        })
        if (fout.docs[0]) await payload.delete({ collection: 'match-events', id: fout.docs[0].id, overrideAccess: true })
        await payload.delete({ collection: 'possessions', id: newestPoss.id, overrideAccess: true })
        await payload.update({ collection: 'possessions', id: vorige.id, data: { endOutcome: null }, overrideAccess: true })
        return buildMatchState(payload, matchId)
      }
    }
  }

  if (!last) return buildMatchState(payload, matchId)

  const possId = typeof last.possession === 'object' ? last.possession.id : last.possession
  await payload.delete({ collection: 'throws', id: last.id, overrideAccess: true })
  // Passes die ná deze worp geregistreerd werden, horen bij de verwijderde worp — weg ermee.
  const naPasses = await payload.find({
    collection: 'match-events',
    where: {
      and: [
        { possession: { equals: possId } },
        { type: { equals: 'pass' } },
        { afterThrows: { greater_than_equal: last.throwNumber } },
      ],
    },
    depth: 0,
    limit: 50,
  })
  for (const p of naPasses.docs) await payload.delete({ collection: 'match-events', id: p.id, overrideAccess: true })

  // Verwijder een eventueel daarna aangemaakt (leeg) vervolg-balbezit.
  const laterEmpty = await payload.find({
    collection: 'possessions',
    where: { and: [{ match: { equals: matchId } }, { id: { greater_than: possId } }] },
    sort: 'createdAt',
    depth: 0,
    limit: 50,
  })
  for (const p of laterEmpty.docs) {
    const count = await payload.count({
      collection: 'throws',
      where: { possession: { equals: p.id } },
    })
    if (count.totalDocs === 0) {
      await payload.delete({ collection: 'possessions', id: p.id, overrideAccess: true })
    }
  }

  // Heropen het balbezit van de verwijderde worp.
  await payload.update({
    collection: 'possessions',
    id: possId,
    data: { endOutcome: null },
    overrideAccess: true,
  })

  return buildMatchState(payload, matchId)
}

/** Start/pauzeer of zet de klok. */
export async function setClock(
  payload: Payload,
  matchId: number,
  data: { running?: boolean; seconds?: number },
) {
  const { match } = await loadMatch(payload, matchId)
  if (match.status === 'finished') throw new Error('Wedstrijd is afgelopen — de klok ligt vast.')

  // Bij het pauzeren moet de reeds verstreken tijd vastgezet worden in clockSeconds.
  // Anders blijft in de DB de oude basiswaarde staan (bv. 0 sinds de start) en springt
  // de klok bij een pauze terug naar die waarde i.p.v. verder te tellen vanaf de huidige tijd.
  let seconds = data.seconds
  if (seconds === undefined && data.running === false && match.clockRunning) {
    const at = match.clockUpdatedAt ? new Date(match.clockUpdatedAt).getTime() : Date.now()
    const elapsed = Math.max(0, (Date.now() - at) / 1000)
    seconds = (match.clockSeconds ?? 0) + elapsed
  }

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      ...(seconds !== undefined ? { clockSeconds: seconds } : {}),
      ...(data.running !== undefined ? { clockRunning: data.running } : {}),
      clockUpdatedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Een toegekende vrije worp waarvan de worp zelf nog niet geregistreerd is (§8). */
async function isPendingFreeThrow(payload: Payload, poss: { id: number; freeThrow?: boolean | null }) {
  if (!poss.freeThrow) return false
  const cnt = await payload.count({ collection: 'throws', where: { possession: { equals: poss.id } } })
  return cnt.totalDocs === 0
}

/**
 * Beëindig de huidige helft (rustsignaal): sluit het lopende balbezit af, log het einde en
 * stop de klok. De volgende helft wordt NIET automatisch gestart — dat gebeurt met startNextHalf.
 */
export async function endHalf(payload: Payload, matchId: number) {
  const { match } = await loadMatch(payload, matchId)
  const half = match.currentHalf ?? 1

  // Reglement §8: na het eindsignaal mag er niet meer gescoord worden, BEHALVE met een vrije worp
  // die binnen de speeltijd werd toegekend — die wordt nog genomen en kan nog een punt opleveren.
  // Een toegekende maar nog niet genomen vrije worp blijft dus openstaan; al de rest sluit af.
  const open = await getOpenPossession(payload, matchId)
  if (open && !(await isPendingFreeThrow(payload, open))) {
    await payload.update({
      collection: 'possessions',
      id: open.id,
      data: { endOutcome: 'throws_exhausted' },
      overrideAccess: true,
    })
  }
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_end', half, gameClock: match.clockSeconds ?? 0 },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { clockRunning: false },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/**
 * Start de volgende helft: klok terug op 0, ploegen wisselen van veldhelft (richting draait om).
 * De 2e helft start met een verse opzet door de ploeg die NIET aftrapte in de 1e helft.
 */
export async function startNextHalf(payload: Payload, matchId: number) {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const nextHalf = (match.currentHalf ?? 1) + 1

  // Bleef er nog een vrije worp openstaan uit de vorige helft (zie endHalf, §8)? Dan is ze niet
  // meer genomen: sluit ze nu af, anders zou de nieuwe helft met twéé open balbezitten starten.
  const leftover = await getOpenPossession(payload, matchId)
  if (leftover) {
    await payload.update({
      collection: 'possessions',
      id: leftover.id,
      data: { endOutcome: 'throws_exhausted' },
      overrideAccess: true,
    })
  }

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { currentHalf: nextHalf, clockSeconds: 0, clockRunning: false },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'half_start', half: nextHalf, gameClock: 0 },
    overrideAccess: true,
  })

  // Wie tikte af in helft 1? De tegenploeg zet op in de volgende helft.
  const first = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 0,
    limit: 1,
  })
  const firstTeamId = first.docs[0]
    ? typeof first.docs[0].team === 'object'
      ? first.docs[0].team.id
      : first.docs[0].team
    : homeId
  const startTeamId = firstTeamId === homeId ? awayId : homeId
  const startSide = sideOfTeam(startTeamId, homeId)
  const dir = attackDirForSide(startSide, nextHalf)
  const ftNorm = freeThrowNorm(match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM)
  const ownHalfY = dir === 'up' ? ftNorm : 1 - ftNorm
  await createPossession(payload, {
    matchId,
    teamId: startTeamId,
    setupSide: 'own',
    category: match.category as Category,
    reeks: match.reeks,
    dir,
    point: { x: 0.5, y: ownHalfY },
    half: nextHalf,
    clock: 0,
  })

  return buildMatchState(payload, matchId)
}

/** Beëindig de huidige helft én start meteen de volgende (combinatie). */
export async function advanceHalf(payload: Payload, matchId: number) {
  await endHalf(payload, matchId)
  return startNextHalf(payload, matchId)
}

export async function finishMatch(payload: Payload, matchId: number) {
  const { match } = await loadMatch(payload, matchId)
  if (match.status === 'finished') return buildMatchState(payload, matchId)
  // Bevries de LIVE klokstand: clockSeconds is enkel de basis; terwijl de klok loopt moet de
  // verstreken tijd sinds clockUpdatedAt erbij. Anders springt de eindtijd terug naar de oude
  // basiswaarde (bv. 0:55) i.p.v. de werkelijk gespeelde tijd te tonen.
  const base = match.clockSeconds ?? 0
  const frozen =
    match.clockRunning && match.clockUpdatedAt
      ? base + Math.max(0, (Date.now() - new Date(match.clockUpdatedAt).getTime()) / 1000)
      : base
  // Sluit het lopende balbezit af zodat er na het eindsignaal geen "open" balbezit blijft hangen.
  const open = await getOpenPossession(payload, matchId)
  if (open) {
    await payload.update({
      collection: 'possessions',
      id: open.id,
      data: { endOutcome: 'throws_exhausted' },
      overrideAccess: true,
    })
  }
  await payload.create({
    collection: 'match-events',
    data: {
      match: matchId,
      type: 'half_end',
      half: match.currentHalf ?? 2,
      gameClock: Math.floor(frozen),
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { status: 'finished', clockRunning: false, clockSeconds: frozen, clockUpdatedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  // Tribunefoto's verdwijnen exact één uur ná het einde: zet de vervaldatum van alle foto's van
  // deze wedstrijd op nu + 1u (de upload gebruikte tijdens de match nog een schatting).
  await payload
    .update({
      collection: 'match-instants',
      where: { match: { equals: matchId } },
      data: { expiresAt: new Date(Date.now() + TRIBUNE_GRACE_MS).toISOString() },
      overrideAccess: true,
    })
    .catch(() => {})
  return buildMatchState(payload, matchId)
}

/**
 * Heropen een afgesloten wedstrijd: er werd per ongeluk op "Einde" gedrukt en het spel loopt nog.
 * Dit is de exacte tegenhanger van `finishMatch`, zodat de aantekenaar gewoon verder kan:
 *  - het `half_end`-event dat het eindsignaal schreef verdwijnt weer,
 *  - het balbezit dat toen werd afgesloten staat terug open (anders weigert `recordThrow` met
 *    "Geen lopend balbezit" en zit je alsnog vast),
 *  - de status gaat terug naar live, met de klok stil op de bevroren stand — de aantekenaar
 *    beslist zelf wanneer ze weer loopt.
 * Alle worpen, de score en de kruisjes blijven staan: heropenen wist niets.
 */
export async function reopenMatch(payload: Payload, matchId: number) {
  const { match } = await loadMatch(payload, matchId)
  if (match.status !== 'finished') return buildMatchState(payload, matchId)

  // Het laatste half_end-event is per definitie dat van het eindsignaal: ná het einde kan er niets
  // meer bijkomen. Enkel dat ene weghalen — een eerder rust-signaal blijft in de tijdlijn staan.
  const eind = await payload.find({
    collection: 'match-events',
    where: { and: [{ match: { equals: matchId } }, { type: { equals: 'half_end' } }] },
    sort: '-id',
    depth: 0,
    limit: 1,
  })
  const eindId = eind.docs[0]?.id
  if (eindId) await payload.delete({ collection: 'match-events', id: eindId, overrideAccess: true }).catch(() => {})

  // Idem voor het balbezit: `finishMatch` sloot het lopende balbezit af en er komt er daarna geen
  // nieuw meer bij, dus het laatste balbezit is precies datgene dat weer open moet.
  const laatste = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    sort: '-id',
    depth: 0,
    limit: 1,
  })
  const poss = laatste.docs[0] as { id: number; endOutcome?: string | null } | undefined
  if (poss?.endOutcome) {
    await payload
      .update({ collection: 'possessions', id: poss.id, data: { endOutcome: null }, overrideAccess: true })
      .catch(() => {})
  }

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { status: 'live', clockRunning: false, clockUpdatedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Hoeveel is er al ingevoerd? Bepaalt of een reset onschuldig is of echt iets vernietigt. */
export async function matchResetImpact(payload: Payload, matchId: number): Promise<{ worpen: number }> {
  const res = await payload
    .count({ collection: 'throws', where: { match: { equals: matchId } }, overrideAccess: true })
    .catch(() => ({ totalDocs: 0 }))
  return { worpen: res.totalDocs }
}

/**
 * Zet een wedstrijd terug op "nog niet gestart": iemand drukte per ongeluk op start terwijl er
 * nog niet gespeeld werd. Omdat alles afgeleid is uit de worp-events volstaat het die events weg
 * te gooien — score, balbezit en statistiek verdwijnen dan vanzelf mee. De `processed-ops` gaan
 * er ook uit, anders zou een herhaalde actie-id na de herstart als "al verwerkt" gelden.
 *
 * Het wedstrijdblad, ongevalsaangiftes en tribunefoto's blijven onaangeroerd: dat is aparte
 * administratie die niets met de aantekening te maken heeft.
 */
export async function resetMatch(payload: Payload, matchId: number) {
  const { match } = await loadMatch(payload, matchId)
  if (match.status === 'scheduled') return buildMatchState(payload, matchId)

  for (const collection of ['throws', 'possessions', 'match-events', 'processed-ops'] as const) {
    await payload.delete({ collection, where: { match: { equals: matchId } }, overrideAccess: true }).catch(() => {})
  }
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: {
      status: 'scheduled',
      currentHalf: 1,
      clockSeconds: 0,
      clockRunning: false,
      clockUpdatedAt: null,
      simpleScore: null,
    },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/**
 * Vrije worp voor een ploeg: sluit het lopende balbezit af en maakt een balbezit met
 * exact één worp (vanaf de vrijeworplijn richting het tegendoel). Daarna gaat het spel verder.
 */
export async function startFreeThrow(payload: Payload, matchId: number, teamId: number) {
  const { match, homeId } = await loadMatch(payload, matchId)
  if (match.status === 'finished') throw new Error('Wedstrijd is afgelopen.')
  const half = match.currentHalf ?? 1
  const side = sideOfTeam(teamId, homeId)
  const dir = attackDirForSide(side, half)

  const open = await getOpenPossession(payload, matchId)
  if (open) {
    await payload.update({
      collection: 'possessions',
      id: open.id,
      data: { endOutcome: 'throws_exhausted' },
      overrideAccess: true,
    })
  }

  // Vrijeworplijn ligt 4 m vóór de aangevallen doellijn (diepte-afhankelijk).
  const ftNorm = freeThrowNorm(match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM)
  const setupY = dir === 'up' ? 1 - ftNorm : ftNorm
  await payload.create({
    collection: 'possessions',
    data: {
      match: matchId,
      team: teamId,
      setupSide: 'opponent',
      throwsAllowed: 1,
      freeThrow: true,
      setupX: 0.5,
      setupY,
      dir,
      startHalf: half,
      startClock: match.clockSeconds ?? 0,
    },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Wissel: vervang een veldspeler door een bankspeler in de opstelling van een ploeg. */
export async function substitute(
  payload: Payload,
  matchId: number,
  side: TeamSide,
  outPlayerId: number,
  inPlayerId: number,
) {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const teamId = side === 'home' ? homeId : awayId
  const stored = side === 'home' ? match.homeLineup : match.awayLineup
  const current = await resolveLineup(payload, stored, teamId)

  if (!current.includes(outPlayerId) || current.includes(inPlayerId)) {
    return buildMatchState(payload, matchId)
  }
  const next = current.map((id) => (id === outPlayerId ? inPlayerId : id))
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: side === 'home' ? { homeLineup: next } : { awayLineup: next },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/**
 * Zet de veldspelers (de actieve opstelling) van één ploeg op precies FIELD_PLAYERS spelers.
 * Gebruikt vóór de aftrap om uit de volledige selectie de vier veldspelers te kiezen; de rest
 * zijn wissels. Alleen veldspelers kunnen werpen, dus enkel deze namen verschijnen in het
 * worp-keuzescherm. Valideert dat alle gekozen spelers bij de ploeg horen.
 */
export async function setLineup(
  payload: Payload,
  matchId: number,
  side: TeamSide,
  playerIds: number[],
) {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const teamId = side === 'home' ? homeId : awayId

  const res = await payload.find({
    collection: 'players',
    where: { team: { equals: teamId } },
    depth: 0,
    limit: 200,
  })
  const teamPlayerIds = new Set(res.docs.map((p) => p.id))
  // Ontdubbel en behoud enkel spelers van deze ploeg.
  const chosen = Array.from(new Set(playerIds)).filter((id) => teamPlayerIds.has(id))
  if (chosen.length !== FIELD_PLAYERS) {
    throw new Error(`Kies precies ${FIELD_PLAYERS} veldspelers.`)
  }

  // Als de huidige kapitein niet meer in de opstelling staat, de aanduiding wissen.
  const curCaptain = captainIdOf((match as { homeCaptain?: unknown; awayCaptain?: unknown })[side === 'home' ? 'homeCaptain' : 'awayCaptain'])
  const captainPatch =
    curCaptain != null && !chosen.includes(curCaptain)
      ? side === 'home'
        ? { homeCaptain: null }
        : { awayCaptain: null }
      : {}

  // Vorige veldspelers vóór de update — tijdens een lopende wedstrijd is het verschil een
  // VERVANGING en hoort die (wie eruit, wie erin) op het officiële wedstrijdblad (reglement §9).
  const prevRaw = side === 'home' ? match.homeLineup : match.awayLineup
  const prev = Array.isArray(prevRaw)
    ? prevRaw
        .map((v) => (v && typeof v === 'object' ? (v as { id?: number }).id : v))
        .filter((v): v is number => typeof v === 'number')
    : []

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: side === 'home' ? { homeLineup: chosen, ...captainPatch } : { awayLineup: chosen, ...captainPatch },
    overrideAccess: true,
  })

  if (match.status === 'live' && prev.length) {
    const byId = new Map(res.docs.map((p) => [p.id, p]))
    const wie = (id: number | undefined) => {
      const p = id != null ? byId.get(id) : undefined
      return p ? `#${p.shirtNumber} ${p.name}` : '—'
    }
    const outs = prev.filter((id) => !chosen.includes(id))
    const ins = chosen.filter((id) => !prev.includes(id))
    for (let i = 0; i < Math.max(outs.length, ins.length); i++) {
      await payload
        .create({
          collection: 'match-events',
          data: {
            match: matchId,
            type: 'substitution',
            team: teamId,
            half: match.currentHalf ?? 1,
            gameClock: match.clockSeconds ?? 0,
            note: `${wie(outs[i])} → ${wie(ins[i])}`,
          },
          overrideAccess: true,
        })
        .catch(() => {}) // best-effort: een gemiste logregel mag de wissel zelf niet blokkeren
    }
  }
  return buildMatchState(payload, matchId)
}

/** Kapitein van een ploeg aanduiden (moet een speler van die ploeg zijn). */
export async function setCaptain(payload: Payload, matchId: number, side: TeamSide, playerId: number) {
  const { homeId, awayId } = await loadMatch(payload, matchId)
  const teamId = side === 'home' ? homeId : awayId
  const player = await payload.findByID({ collection: 'players', id: playerId, depth: 0 }).catch(() => null)
  const pTeam = player ? (typeof player.team === 'object' && player.team ? player.team.id : player.team) : null
  if (pTeam !== teamId) throw new Error('De kapitein moet een speler van deze ploeg zijn.')
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: side === 'home' ? { homeCaptain: playerId } : { awayCaptain: playerId },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Maximaal aantal time-outs per ploeg per helft. */
export const TIMEOUTS_PER_HALF = 2

/** Time-out registreren — max. 2 per ploeg per helft (reglement §8.1). */
export async function recordTimeout(payload: Payload, matchId: number, teamId: number, actorId?: number) {
  const { match } = await loadMatch(payload, matchId)
  if (match.status === 'finished') throw new Error('Wedstrijd is afgelopen.')
  const half = match.currentHalf ?? 1

  const used = await payload.count({
    collection: 'match-events',
    where: {
      and: [
        { match: { equals: matchId } },
        { type: { equals: 'timeout' } },
        { team: { equals: teamId } },
        { half: { equals: half } },
      ],
    },
  })
  if (used.totalDocs >= TIMEOUTS_PER_HALF) {
    throw new Error(`Maximaal ${TIMEOUTS_PER_HALF} time-outs per ploeg per helft.`)
  }

  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'timeout', team: teamId, half, gameClock: match.clockSeconds ?? 0, ...(actorId ? { createdBy: actorId } : {}) },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

/** Scheidsrechter-onderbreking (minuut) registreren — door de scheidsrechter aangevraagd.
 * Onbeperkt (geen ploeg-limiet); verschijnt op de tijdlijn. */
export async function recordRefereeStop(payload: Payload, matchId: number, actorId?: number) {
  const { match } = await loadMatch(payload, matchId)
  const half = match.currentHalf ?? 1
  await payload.create({
    collection: 'match-events',
    data: { match: matchId, type: 'referee_stop', half, gameClock: match.clockSeconds ?? 0, ...(actorId ? { createdBy: actorId } : {}) },
    overrideAccess: true,
  })
  return buildMatchState(payload, matchId)
}

// ── Afgeleide match-state (voor scorekeeper, scorebord, SSE) ──────────────────

export interface MatchState {
  match: {
    id: number
    title: string | null
    status: string
    category: Category
    /** Reekscode (bv. 1NAD) — bepaalt o.a. het voorgeschreven balgewicht (§3). */
    reeks: string | null
    currentHalf: number
    clockSeconds: number
    clockRunning: boolean
    clockUpdatedAt: string | null
    /** Diepte van het doelgebied (m) — bepaalt veldlengte + afstandsschaal. */
    goalAreaDepth: number
    /** Tijdstip waarop de wedstrijd op 'finished' ging (voor het 1u-navenster van de tribune). */
    finishedAt: string | null
    /** Aftrap (ISO) — bepaalt of de tribune al open is op de speeldag zelf, vóór de aftrap. */
    date: string | null
  }
  teams: {
    home: { id: number; name: string; logoUrl: string | null; logoFit: LogoFit | null; colors: ClubColors | null }
    away: { id: number; name: string; logoUrl: string | null; logoFit: LogoFit | null; colors: ClubColors | null }
  }
  /** Spelers die momenteel op het veld staan (selecteerbaar om te werpen). */
  lineup: { home: number[]; away: number[] }
  /** Kapitein per ploeg (speler-id), aangeduid bij de opstelling. */
  captain: { home: number | null; away: number | null }
  score: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: number; away: number }
  /** Scheidsrechter-minuten (onderbrekingen) in de huidige helft. */
  refereeStops: number
  /**
   * Het laatst doorgegeven doelpunt in de snelscoremodus — wat "undo" zou wegnemen. De
   * aantekenaar tikt op een telefoon, naast de knoppen van de ándere ploeg; door te tonen wát er
   * verdwijnt, is undo een gerust gebaar i.p.v. een gok. Null zodra er niets (meer) weg te nemen is.
   */
  lastSimpleGoal: { side: TeamSide; points: number; half: number; clock: number; scorer: string | null } | null
  /** Rust: de huidige helft is beëindigd, de volgende nog niet gestart. */
  atHalfTime: boolean
  /** Hoe betrouwbaar deze stand is: 🟢 officieel/bevestigd, 🟡 nog niet bevestigd, 🔴 betwist. */
  trust: TrustView
  possession: {
    side: TeamSide
    teamId: number
    setupSide: SetupSide
    throwsAllowed: number
    throwsUsed: number
    nextThrowNumber: number
    dir: AttackDir
    /** Speler van de vorige worp in dit balbezit — mag niet 2× na elkaar werpen. */
    lastPlayerId: number | null
    /** Vrije worp: één worp richting het tegendoel. */
    freeThrow: boolean
    /** Opzetpunt (genormaliseerd) van dit balbezit — de werpplaats voor de eerste worp. */
    setupX: number
    setupY: number
  } | null
}

export interface SheetGoal {
  half: number
  gameClock: number
  side: TeamSide
  shirtNumber: number
  playerName: string
  type: ThrowType
  points: number
}

export interface SheetSubstitution {
  half: number
  gameClock: number
  side: TeamSide
  /** Leesbaar "wie eruit → wie erin" (uit de event-notitie). */
  wissel: string
}

export interface MatchSheet {
  match: { id: number; title: string | null; date: string; category: Category; status: string }
  teams: { home: { id: number; name: string }; away: { id: number; name: string } }
  rosters: { home: { shirtNumber: number; name: string }[]; away: { shirtNumber: number; name: string }[] }
  goals: SheetGoal[]
  halfScores: { home: [number, number]; away: [number, number] }
  totals: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: [number, number]; away: [number, number] }
  substitutions: SheetSubstitution[]
}

/** Geldig digitaal aantekenblad: opstellingen, doelpunten, helft-scores, time-outs, kruisjes. */
export async function buildMatchSheet(payload: Payload, matchId: number): Promise<MatchSheet> {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const [home, away] = await Promise.all([
    payload.findByID({ collection: 'teams', id: homeId, depth: 0 }),
    payload.findByID({ collection: 'teams', id: awayId, depth: 0 }),
  ])

  const playersRes = await payload.find({
    collection: 'players',
    where: { team: { in: [homeId, awayId] } },
    sort: 'shirtNumber',
    depth: 0,
    limit: 200,
  })
  const rosters = { home: [] as { shirtNumber: number; name: string }[], away: [] as { shirtNumber: number; name: string }[] }
  for (const p of playersRes.docs) {
    const tId = typeof p.team === 'object' ? p.team.id : p.team
    ;(tId === homeId ? rosters.home : rosters.away).push({ shirtNumber: p.shirtNumber, name: p.name })
  }

  // Kapiteins: een eigen doelpunt komt op hun naam te staan (§6.6).
  const captainOf = (v: unknown) => {
    const id = captainIdOf(v)
    const p = id == null ? null : playersRes.docs.find((d) => d.id === id)
    return p ? { shirtNumber: p.shirtNumber, name: p.name } : null
  }
  const homeCaptain = captainOf((match as { homeCaptain?: unknown }).homeCaptain)
  const awayCaptain = captainOf((match as { awayCaptain?: unknown }).awayCaptain)

  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 1,
    limit: 2000,
  })
  const sheetPoss = await payload.find({ collection: 'possessions', where: { match: { equals: matchId } }, depth: 0, limit: 1000 })
  const sheetPossById = new Map(sheetPoss.docs.map((p) => [p.id, p]))

  const goals: SheetGoal[] = []
  const halfScores = { home: [0, 0] as [number, number], away: [0, 0] as [number, number] }
  const crosses = { home: 0, away: 0 }

  for (const t of throwsRes.docs) {
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    const side = sideOfTeam(teamId, homeId)
    const halfIdx = (t.period ?? 1) === 2 ? 1 : 0
    const possId = typeof t.possession === 'object' ? t.possession.id : t.possession
    const poss = sheetPossById.get(possId)
    const isFreeThrow = Boolean(poss?.freeThrow)
    if (t.outcome === 'goal') {
      const points = pointsForThrow({ type: t.type, outcome: t.outcome, freeThrow: isFreeThrow })
      const player = typeof t.player === 'object' && t.player ? t.player : null
      goals.push({
        half: t.period,
        gameClock: t.gameClock,
        side,
        shirtNumber: player?.shirtNumber ?? 0,
        playerName: player?.name ?? '—',
        type: t.type,
        points,
      })
      halfScores[side][halfIdx] += points
    } else if (t.outcome === 'own_goal') {
      // §6.6: een eigen doelpunt telt voor de tegenpartij en komt op naam van de KAPITEIN van de
      // ploeg die het maakte — zo staat het ook op het papieren wedstrijdblad.
      const other = side === 'home' ? 'away' : 'home'
      const kap = side === 'home' ? homeCaptain : awayCaptain
      goals.push({
        half: t.period,
        gameClock: t.gameClock,
        side: other,
        shirtNumber: kap?.shirtNumber ?? 0,
        playerName: kap ? `${kap.name} (eigen doelpunt)` : 'Eigen doelpunt',
        type: 'nek',
        points: 1,
      })
      halfScores[other][halfIdx] += 1
    } else {
      const allowed = poss?.throwsAllowed ?? 1
      if (
        isCrossThrow({
          outcome: t.outcome,
          isDoelworp: t.throwNumber >= allowed,
          touchedBeforeOut: t.touchedBeforeOut ?? false,
          freeThrow: isFreeThrow,
        })
      ) {
        crosses[side] += 1
      }
    }
  }

  // snelscoremodus: simpele doelpunten (+1/+2, zonder speler) en kruisjes meenemen
  // zodat het blad dezelfde stand toont als het scorebord.
  const simpleSheet = readSimpleScore(match)
  for (const g of simpleSheet.goals) {
    const halfIdx = g.half === 2 ? 1 : 0
    goals.push({
      half: g.half,
      gameClock: g.clock,
      side: g.side,
      shirtNumber: g.scorerNumber ?? 0,
      playerName: g.scorerName ?? '—',
      type: g.points === 2 ? 'rug' : 'nek',
      points: g.points,
    })
    halfScores[g.side][halfIdx] += g.points
  }
  crosses.home += simpleSheet.crosses.home
  crosses.away += simpleSheet.crosses.away

  const eventsRes = await payload.find({
    collection: 'match-events',
    where: { and: [{ match: { equals: matchId } }, { type: { in: ['timeout', 'substitution'] } }] },
    sort: 'createdAt',
    depth: 0,
    limit: 400,
  })
  const timeouts = { home: [0, 0] as [number, number], away: [0, 0] as [number, number] }
  const substitutions: SheetSubstitution[] = []
  for (const e of eventsRes.docs) {
    const tId = typeof e.team === 'object' && e.team ? e.team.id : e.team
    if (!tId) continue
    const side = sideOfTeam(tId, homeId)
    if (e.type === 'timeout') {
      timeouts[side][(e.half ?? 1) === 2 ? 1 : 0] += 1
    } else {
      substitutions.push({ half: e.half ?? 1, gameClock: e.gameClock ?? 0, side, wissel: e.note ?? '—' })
    }
  }

  return {
    match: {
      id: match.id,
      title: match.title ?? null,
      date: match.date,
      category: match.category as Category,
      status: match.status,
    },
    teams: { home: { id: home.id, name: home.name }, away: { id: away.id, name: away.name } },
    rosters,
    goals,
    halfScores,
    totals: {
      home: halfScores.home[0] + halfScores.home[1],
      away: halfScores.away[0] + halfScores.away[1],
    },
    crosses,
    timeouts,
    substitutions,
  }
}

export interface ShotPoint {
  x: number
  y: number
  /** Vertrekpunt van de worp (vorige landing in het balbezit, of de opzet) — voor het traject. */
  fromX: number
  fromY: number
  outcome: string
  type: ThrowType
  playerId: number
  shirtNumber: number
  teamSide: TeamSide
  throwNumber: number
  isLastThrow: boolean
  /** Helft (1 of 2) — nodig om posities te spiegelen voor een seizoens-gevaarkaart. */
  period: number
  /** Worpafstand in meters (afgeleid), indien beschikbaar. */
  distance: number | null
}

/**
 * Laadt de ruwe worp-events van één wedstrijd en reconstrueert per worp het
 * vertrekpunt en `isLastThrow` (doelpoging) uit de balbezit-context. Hergebruikt
 * door zowel `buildMatchStats` als het verwachte-punten-model (xG).
 */
export async function loadMatchThrowData(
  payload: Payload,
  matchId: number,
): Promise<{ stat: import('./stats').StatThrow[]; shots: ShotPoint[] }> {
  const { homeId } = await loadMatch(payload, matchId)
  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 1,
    limit: 2000,
  })
  const possRes = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    depth: 0,
    limit: 1000,
  })
  const possById = new Map(possRes.docs.map((p) => [p.id, p]))

  const stat: import('./stats').StatThrow[] = []
  const shots: ShotPoint[] = []
  // Vertrekpunt per worp: de vorige landing in hetzelfde balbezit, anders de opzet-positie.
  const lastLanding = new Map<number, { x: number; y: number }>()

  for (const t of throwsRes.docs) {
    const possId = typeof t.possession === 'object' ? t.possession.id : t.possession
    const poss = possById.get(possId)
    const allowed = poss?.throwsAllowed ?? 1
    const prev = lastLanding.get(possId)
    const fromX = prev ? prev.x : (poss?.setupX ?? 0.5)
    const fromY = prev ? prev.y : (poss?.setupY ?? 0.5)
    const player = typeof t.player === 'object' && t.player ? t.player : null
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    const side = sideOfTeam(teamId, homeId)
    stat.push({
      playerId: player?.id ?? 0,
      playerName: player?.name ?? '—',
      shirtNumber: player?.shirtNumber ?? 0,
      teamSide: side,
      throwNumber: t.throwNumber,
      isLastThrow: t.throwNumber >= allowed,
      type: t.type,
      outcome: t.outcome,
      distance: t.distance ?? null,
      zone: t.zone ?? null,
    })
    shots.push({
      x: t.landingX,
      y: t.landingY,
      fromX,
      fromY,
      outcome: t.outcome,
      type: t.type,
      playerId: player?.id ?? 0,
      shirtNumber: player?.shirtNumber ?? 0,
      teamSide: side,
      throwNumber: t.throwNumber,
      isLastThrow: t.throwNumber >= allowed,
      period: t.period ?? 1,
      distance: t.distance ?? null,
    })
    lastLanding.set(possId, { x: t.landingX, y: t.landingY })
  }

  return { stat, shots }
}

/** Statistiek-aggregaten + shot map-punten voor de matchdetailpagina. */
export async function buildMatchStats(payload: Payload, matchId: number) {
  const { stat, shots } = await loadMatchThrowData(payload, matchId)
  const { aggregateStats } = await import('./stats')
  return { stats: aggregateStats(stat), shots }
}

export interface PassPlayer extends PlayerPassStats {
  name: string
  shirtNumber: number
  teamSide: TeamSide
}

export interface PassStats {
  spelers: PassPlayer[]
  lijnen: { from: PassPlayer; to: PassPlayer; count: number }[]
  totaal: number
  fouten: number
}

/**
 * Passstatistiek (§6.10): wie geeft aan wie, en wie legt het doelpunt klaar. Enkel gevuld wanneer
 * de aantekenaar passes registreert (pass-modus) — anders leeg, en dan tonen we de kaart niet.
 */
export async function buildPassStats(payload: Payload, matchId: number): Promise<PassStats> {
  const { homeId } = await loadMatch(payload, matchId)
  const [passRes, throwRes] = await Promise.all([
    payload.find({
      collection: 'match-events',
      where: { and: [{ match: { equals: matchId } }, { type: { equals: 'pass' } }] },
      sort: 'id',
      depth: 0,
      limit: 2000,
    }),
    payload.find({ collection: 'throws', where: { match: { equals: matchId } }, sort: 'id', depth: 0, limit: 2000 }),
  ])
  if (passRes.docs.length === 0) return { spelers: [], lijnen: [], totaal: 0, fouten: 0 }

  const idOf = (v: unknown) => (v && typeof v === 'object' ? Number((v as { id?: number }).id) : Number(v))
  const net = buildPassNetwork(
    passRes.docs.map((p) => ({
      possessionId: idOf(p.possession),
      afterThrows: Number(p.afterThrows ?? 0),
      playerId: idOf(p.player),
      forward: Boolean(p.forward),
    })),
    throwRes.docs.map((t) => ({
      possessionId: idOf(t.possession),
      throwNumber: t.throwNumber,
      playerId: idOf(t.player),
      isGoal: t.outcome === 'goal',
    })),
  )

  // Ook de eindpunten van de passlijnen ophalen: een werper die zelf nooit een pass ving, staat
  // niet in net.spelers maar moet wél een naam krijgen in het netwerk.
  const ids = [
    ...new Set([
      ...net.spelers.map((s) => s.playerId),
      ...net.lijnen.flatMap((l) => [l.fromPlayerId, l.toPlayerId]),
    ]),
  ]
  const playersRes = ids.length
    ? await payload.find({ collection: 'players', where: { id: { in: ids } }, depth: 0, limit: 200 })
    : { docs: [] as { id: number; name: string; shirtNumber: number; team: unknown }[] }
  const byId = new Map(playersRes.docs.map((p) => [p.id, p]))
  const verrijk = (s: PlayerPassStats): PassPlayer => {
    const p = byId.get(s.playerId)
    return {
      ...s,
      name: p?.name ?? '?',
      shirtNumber: p?.shirtNumber ?? 0,
      teamSide: sideOfTeam(idOf(p?.team), homeId) ?? 'home',
    }
  }
  const spelers = net.spelers.map(verrijk)
  const perId = new Map(spelers.map((s) => [s.playerId, s]))
  const lijnen = net.lijnen
    .map((l) => {
      const from = perId.get(l.fromPlayerId)
      const to = perId.get(l.toPlayerId) ?? verrijk(leegPassStats(l.toPlayerId))
      return from ? { from, to, count: l.count } : null
    })
    .filter((l): l is { from: PassPlayer; to: PassPlayer; count: number } => l !== null)

  return { spelers, lijnen, totaal: net.totaal, fouten: net.fouten }
}

function leegPassStats(playerId: number): PlayerPassStats {
  return { playerId, gegeven: 0, ontvangen: 0, aangevers: 0, fouten: 0, winstM: 0 }
}

export interface DefensePlayer {
  playerId: number
  name: string
  shirtNumber: number
  teamSide: TeamSide
  /** Vangsten (de bal van de tegenstander gevangen). */
  catches: number
  /** Tikken naar de achterman (verdedigende assist). */
  taps: number
  /** Totale verdedigende acties (vangsten + tikken). */
  total: number
}

/** Verdedigende statistiek per speler (vangsten + tikken). Enkel zinvol op analyse-wedstrijden,
 * waar de aantekenaar de vanger/tikker registreert. */
export async function buildDefenseStats(payload: Payload, matchId: number): Promise<DefensePlayer[]> {
  const { homeId } = await loadMatch(payload, matchId)
  const res = await payload.find({
    collection: 'throws',
    where: { and: [{ match: { equals: matchId } }, { outcome: { equals: 'caught' } }] },
    depth: 1,
    limit: 2000,
  })
  const by = new Map<number, DefensePlayer>()
  const ensure = (pl: unknown): DefensePlayer | null => {
    if (!pl || typeof pl !== 'object') return null
    const p = pl as { id?: number; name?: string; shirtNumber?: number; team?: unknown }
    if (typeof p.id !== 'number') return null
    let d = by.get(p.id)
    if (!d) {
      const teamId = p.team && typeof p.team === 'object' ? (p.team as { id?: number }).id ?? -1 : (p.team as number) ?? -1
      d = { playerId: p.id, name: p.name ?? '?', shirtNumber: p.shirtNumber ?? 0, teamSide: sideOfTeam(teamId, homeId) ?? 'home', catches: 0, taps: 0, total: 0 }
      by.set(p.id, d)
    }
    return d
  }
  for (const t of res.docs) {
    const c = ensure(t.caughtBy)
    if (c) { c.catches += 1; c.total += 1 }
    const tp = ensure(t.tappedBy)
    if (tp) { tp.taps += 1; tp.total += 1 }
  }
  return [...by.values()].sort((a, b) => b.total - a.total || b.catches - a.catches)
}

export interface TimelineItem {
  id: string
  kind: 'goal' | 'cross' | 'timeout' | 'half_start' | 'half_end' | 'referee_stop' | 'substitution'
  half: number
  gameClock: number
  side: TeamSide | null
  label: string
}

/** Chronologische tijdlijn (doelpunten, kruisjes, time-outs, helft-grenzen). */
export async function buildTimeline(payload: Payload, matchId: number): Promise<TimelineItem[]> {
  const { match, homeId } = await loadMatch(payload, matchId)

  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 1,
    limit: 1000,
  })
  const eventsRes = await payload.find({
    collection: 'match-events',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 0,
    limit: 1000,
  })
  const tlPoss = await payload.find({ collection: 'possessions', where: { match: { equals: matchId } }, depth: 0, limit: 1000 })
  const tlPossById = new Map(tlPoss.docs.map((p) => [p.id, p]))

  const items: (TimelineItem & { _t: string })[] = []

  for (const t of throwsRes.docs) {
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    const side = sideOfTeam(teamId, homeId)
    const tlPossId = typeof t.possession === 'object' ? t.possession.id : t.possession
    const tlPossDoc = tlPossById.get(tlPossId)
    const tlAllowed = tlPossDoc?.throwsAllowed ?? 1
    const tlFreeThrow = Boolean(tlPossDoc?.freeThrow)
    if (t.outcome === 'goal') {
      const pts = pointsForThrow({ type: t.type, outcome: t.outcome, freeThrow: tlFreeThrow })
      const player = typeof t.player === 'object' && t.player ? t.player : null
      const who = player ? `#${player.shirtNumber} ${player.name}` : ''
      items.push({
        id: `t${t.id}`,
        kind: 'goal',
        half: t.period,
        gameClock: t.gameClock,
        side,
        label: `Doelpunt +${pts} ${who}`.trim(),
        _t: t.createdAt,
      })
    } else if (t.outcome === 'own_goal') {
      // Het punt staat op de tegenpartij (§6.6) — dus ook op hun kant van de tijdlijn.
      const player = typeof t.player === 'object' && t.player ? t.player : null
      const who = player ? `#${player.shirtNumber} ${player.name}` : ''
      items.push({
        id: `t${t.id}`,
        kind: 'goal',
        half: t.period,
        gameClock: t.gameClock,
        side: side === 'home' ? 'away' : 'home',
        label: who ? `Doelpunt +1 (eigen doelpunt ${who})` : 'Doelpunt +1 (eigen doelpunt)',
        _t: t.createdAt,
      })
    } else if (isCrossThrow({ outcome: t.outcome, isDoelworp: t.throwNumber >= tlAllowed, touchedBeforeOut: t.touchedBeforeOut ?? false, freeThrow: tlFreeThrow })) {
      items.push({
        id: `c${t.id}`,
        kind: 'cross',
        half: t.period,
        gameClock: t.gameClock,
        side,
        label: 'Kruisje',
        _t: t.createdAt,
      })
    }
  }

  // snelscoremodus: simpele doelpunten (+1/+2) als tijdlijn-items toevoegen.
  const tlSimple = readSimpleScore(match)
  for (const g of tlSimple.goals) {
    items.push({
      id: `s${g.ts}`,
      kind: 'goal',
      half: g.half,
      gameClock: g.clock,
      side: g.side,
      label: g.scorerName
        ? `Doelpunt +${g.points} #${g.scorerNumber ?? '?'} ${g.scorerName}`.trim()
        : `Doelpunt +${g.points}`,
      _t: new Date(g.ts).toISOString(),
    })
  }

  for (const e of eventsRes.docs) {
    // Passes zijn spelverloop, geen tijdlijn-gebeurtenis voor het publiek — die zouden de lijn
    // overspoelen. Ze zitten wel in de analyse (passnetwerk).
    if (e.type === 'pass') continue
    const teamId = typeof e.team === 'object' && e.team ? e.team.id : e.team
    const side = teamId ? sideOfTeam(teamId, homeId) : null
    const label =
      e.type === 'timeout'
        ? 'Time-out'
        : e.type === 'substitution'
          ? `Wissel${e.note ? ` ${e.note}` : ''}`
          : e.type === 'referee_stop'
            ? 'Scheidsrechter-onderbreking'
            : e.type === 'half_start'
              ? `Start helft ${e.half}`
              : `Einde helft ${e.half}`
    items.push({ id: `e${e.id}`, kind: e.type, half: e.half, gameClock: e.gameClock, side, label, _t: e.createdAt })
  }

  items.sort((a, b) => (a._t < b._t ? -1 : a._t > b._t ? 1 : 0))
  return items.map(({ _t, ...rest }) => rest)
}

export function clubLogoUrl(team: unknown): string | null {
  const club = (team as { club?: unknown })?.club
  if (club && typeof club === 'object') {
    // Geüpload logo heeft voorrang; anders een logo-URL (extern).
    const logo = (club as { logo?: unknown }).logo
    if (logo && typeof logo === 'object' && 'url' in logo && typeof logo.url === 'string') return logo.url
    const url = (club as { logoUrl?: unknown }).logoUrl
    if (typeof url === 'string' && url.trim()) return url.trim()
  }
  return null
}

// Weergave-instelling (zoom + positie) van het clublogo binnen de ronde badge.
export function clubLogoFit(team: unknown): LogoFit | null {
  const club = (team as { club?: unknown })?.club
  if (!club || typeof club !== 'object') return null
  const c = club as { logoZoom?: number | null; logoOffsetX?: number | null; logoOffsetY?: number | null }
  const fit = normalizeLogoFit({
    zoom: c.logoZoom ?? 1,
    offsetX: c.logoOffsetX ?? 0,
    offsetY: c.logoOffsetY ?? 0,
  })
  return fit.zoom === 1 && fit.offsetX === 0 && fit.offsetY === 0 ? null : fit
}

// Clubkleuren (primair + secundair) van de ploeg, waarop de live-weergaven hun stijl bouwen.
export function clubColors(team: unknown): ClubColors | null {
  const club = (team as { club?: unknown })?.club
  if (!club || typeof club !== 'object') return null
  const c = club as { colorPrimary?: unknown; colorSecondary?: unknown }
  return clubColorsFrom(c.colorPrimary, c.colorSecondary)
}

export async function buildMatchState(payload: Payload, matchId: number): Promise<MatchState> {
  const { match, homeId, awayId } = await loadMatch(payload, matchId)
  const [home, away] = await Promise.all([
    payload.findByID({ collection: 'teams', id: homeId, depth: 2 }),
    payload.findByID({ collection: 'teams', id: awayId, depth: 2 }),
  ])

  const throwsRes = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: 'createdAt',
    depth: 0,
    limit: 1000,
  })
  const possRes = await payload.find({
    collection: 'possessions',
    where: { match: { equals: matchId } },
    depth: 0,
    limit: 1000,
  })
  const possById = new Map(possRes.docs.map((p) => [p.id, p]))

  const reducible = throwsRes.docs.map((t) => {
    const possId = typeof t.possession === 'object' ? t.possession.id : t.possession
    const poss = possById.get(possId)
    const allowed = poss?.throwsAllowed ?? 1
    const teamId = typeof t.team === 'object' ? t.team.id : t.team
    return {
      team: sideOfTeam(teamId, homeId),
      type: t.type,
      outcome: t.outcome,
      isDoelworp: t.throwNumber >= allowed,
      touchedBeforeOut: t.touchedBeforeOut ?? false,
      freeThrow: Boolean(poss?.freeThrow),
    }
  })
  const totals = reduceTotals(reducible)

  // snelscoremodus: snelle doelpunten (+1/+2) en kruisjes staan los van de
  // worp-events op de match. Tel ze hier mee zodat het scorebord ze toont.
  const simple = readSimpleScore(match)
  for (const g of simple.goals) totals.score[g.side] += g.points
  totals.crosses.home += simple.crosses.home
  totals.crosses.away += simple.crosses.away

  // Wat "undo" in de snelscoremodus zou wegnemen: het laatst toegevoegde doelpunt (op ts, want zo
  // ordent de snelscoremodus ze ook bij het terugdraaien).
  const laatste = simple.goals.length
    ? simple.goals.reduce((a, b) => (b.ts >= a.ts ? b : a))
    : null
  const lastSimpleGoal = laatste
    ? {
        side: laatste.side as TeamSide,
        points: laatste.points,
        half: laatste.half,
        clock: laatste.clock,
        scorer: laatste.scorerName ?? null,
      }
    : null

  const half = match.currentHalf ?? 1
  const timeoutRes = await payload.find({
    collection: 'match-events',
    where: {
      and: [
        { match: { equals: matchId } },
        { type: { equals: 'timeout' } },
        { half: { equals: half } },
      ],
    },
    depth: 0,
    limit: 100,
  })
  const timeouts = { home: 0, away: 0 }
  for (const e of timeoutRes.docs) {
    const tId = typeof e.team === 'object' && e.team ? e.team.id : e.team
    if (tId === homeId) timeouts.home += 1
    else if (tId === awayId) timeouts.away += 1
  }

  // Scheidsrechter-minuten (onderbrekingen) in deze helft — telt ook als een minuut.
  const refStopRes = await payload.count({
    collection: 'match-events',
    where: {
      and: [{ match: { equals: matchId } }, { type: { equals: 'referee_stop' } }, { half: { equals: half } }],
    },
  })
  const refereeStops = refStopRes.totalDocs

  // Rust: de huidige helft is beëindigd (half_end gelogd) maar de volgende nog niet gestart.
  const halfEndRes = await payload.count({
    collection: 'match-events',
    where: {
      and: [{ match: { equals: matchId } }, { type: { equals: 'half_end' } }, { half: { equals: half } }],
    },
  })
  const atHalfTime = match.status === 'live' && half < 2 && halfEndRes.totalDocs > 0

  // Vertrouwenslabel op de stand: in de federatieflow is ze officieel, in supporters-modus moet
  // ze bevestigd worden door andere kijkers (zie score-trust.ts).
  const official = await isOfficialScore(payload)

  const open = await getOpenPossession(payload, matchId)
  let possession: MatchState['possession'] = null
  if (open) {
    const teamId = typeof open.team === 'object' ? open.team.id : open.team
    const side = sideOfTeam(teamId, homeId)
    const inPoss = await payload.find({
      collection: 'throws',
      where: { possession: { equals: open.id } },
      sort: '-throwNumber',
      depth: 0,
      limit: 1,
    })
    const used = inPoss.totalDocs
    const lastThrow = inPoss.docs[0]
    const lastPlayerId = lastThrow ? (typeof lastThrow.player === 'object' ? lastThrow.player.id : lastThrow.player) : null
    possession = {
      side,
      teamId,
      setupSide: open.setupSide as SetupSide,
      throwsAllowed: open.throwsAllowed ?? 1,
      throwsUsed: used,
      nextThrowNumber: used + 1,
      dir: (open.dir as AttackDir) ?? attackDirForSide(side, half),
      lastPlayerId,
      freeThrow: Boolean(open.freeThrow),
      setupX: open.setupX ?? 0.5,
      setupY: open.setupY ?? 0.5,
    }
  }

  return {
    match: {
      id: match.id,
      title: match.title ?? null,
      status: match.status,
      category: match.category as Category,
      reeks: (match.reeks as string | null | undefined) ?? null,
      currentHalf: half,
      clockSeconds: match.clockSeconds ?? 0,
      clockRunning: match.clockRunning ?? false,
      clockUpdatedAt: match.clockUpdatedAt ?? null,
      goalAreaDepth: match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM,
      finishedAt: (match.finishedAt as string | null | undefined) ?? null,
      date: (match.date as string | null | undefined) ?? null,
    },
    teams: {
      home: { id: home.id, name: home.name, logoUrl: clubLogoUrl(home), logoFit: clubLogoFit(home), colors: clubColors(home) },
      away: { id: away.id, name: away.name, logoUrl: clubLogoUrl(away), logoFit: clubLogoFit(away), colors: distinguishAway(clubColors(home), clubColors(away)) },
    },
    lineup: {
      home: await resolveLineup(payload, match.homeLineup, homeId),
      away: await resolveLineup(payload, match.awayLineup, awayId),
    },
    captain: {
      home: captainIdOf((match as { homeCaptain?: unknown }).homeCaptain),
      away: captainIdOf((match as { awayCaptain?: unknown }).awayCaptain),
    },
    score: totals.score,
    crosses: totals.crosses,
    timeouts,
    refereeStops,
    lastSimpleGoal,
    atHalfTime,
    trust: trustView(sanitizeTrust((match as { scoreTrust?: unknown }).scoreTrust), { official }),
    possession,
  }
}

// ── Gebatcht scorebord voor een hele dag (publiek live-bord) ──
// buildMatchState doet ~10 queries per wedstrijd; bij een vol weekend (100+
// wedstrijden, sequentieel) wordt dat onwerkbaar traag. Het publieke overzicht
// heeft enkel stand, kruisjes, time-outs en ploeg-info nodig. Deze functie haalt
// dat voor ALLE wedstrijden samen op in vier queries en rekent in-memory uit.
export interface ScoreboardData {
  status: string
  score: { home: number; away: number }
  crosses: { home: number; away: number }
  timeouts: { home: number; away: number }
  refereeStops: number
  /** Vertrouwenslabel op de stand — zodat het live-bord fan-scores als zodanig toont. */
  trust: TrustView
  teams: {
    home: ScoreboardTeam
    away: ScoreboardTeam
  }
}

export interface ScoreboardTeam {
  id: number
  name: string
  logoUrl: string | null
  logoFit: LogoFit | null
  colors: ClubColors | null
  clubId: number | null
  clubName: string | null
  /** Locatie van het clubterrein (voor het weer per wedstrijd). */
  plaats: string | null
  lat: number | null
  lng: number | null
}

// Moederclub-id en -naam van een ploeg (voor club-favorieten op het live-bord).
function clubIdOf(team: unknown): number | null {
  const club = (team as { club?: unknown })?.club
  return club && typeof club === 'object' ? ((club as { id?: number }).id ?? null) : typeof club === 'number' ? club : null
}
function clubNameOf(team: unknown): string | null {
  const club = (team as { club?: unknown })?.club
  return club && typeof club === 'object' ? ((club as { name?: string }).name ?? null) : null
}
// Terreinlocatie van de (moeder)club: gemeente + optionele exacte coördinaten — voor het weer.
function clubLocationOf(team: unknown): { plaats: string | null; lat: number | null; lng: number | null } {
  const club = (team as { club?: unknown })?.club
  if (!club || typeof club !== 'object') return { plaats: null, lat: null, lng: null }
  const c = club as { plaats?: unknown; lat?: unknown; lng?: unknown }
  return {
    plaats: typeof c.plaats === 'string' && c.plaats.trim() ? c.plaats.trim() : null,
    lat: typeof c.lat === 'number' && Number.isFinite(c.lat) ? c.lat : null,
    lng: typeof c.lng === 'number' && Number.isFinite(c.lng) ? c.lng : null,
  }
}

type ScoreboardMatch = {
  id: number
  homeTeam: unknown
  awayTeam: unknown
  currentHalf?: number | null
  status?: string | null
  simpleScore?: unknown
  scoreTrust?: unknown
}

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function buildScoreboards(
  payload: Payload,
  matches: ScoreboardMatch[],
): Promise<Map<number, ScoreboardData>> {
  const out = new Map<number, ScoreboardData>()
  if (matches.length === 0) return out

  const matchIds = matches.map((m) => m.id)
  const teamIds = [
    ...new Set(
      matches.flatMap((m) => [relId(m.homeTeam), relId(m.awayTeam)]).filter((x): x is number => x != null),
    ),
  ]

  // Eén query per collectie i.p.v. per wedstrijd (pagination:false = alle documenten).
  const [teamsRes, throwsRes, possRes, eventsRes] = await Promise.all([
    teamIds.length
      ? payload.find({ collection: 'teams', where: { id: { in: teamIds } }, depth: 2, pagination: false })
      : Promise.resolve({ docs: [] }),
    payload.find({ collection: 'throws', where: { match: { in: matchIds } }, sort: 'createdAt', depth: 0, pagination: false }),
    payload.find({ collection: 'possessions', where: { match: { in: matchIds } }, depth: 0, pagination: false }),
    payload.find({
      collection: 'match-events',
      where: { and: [{ match: { in: matchIds } }, { type: { in: ['timeout', 'referee_stop'] } }] },
      depth: 0,
      pagination: false,
    }),
  ])

  const teamById = new Map(teamsRes.docs.map((t) => [t.id, t]))
  const possById = new Map(possRes.docs.map((p) => [p.id, p]))
  // Eén keer voor de hele lijst: de aantekenmodus is globaal (federatieflow = officiële uitslag).
  const official = await isOfficialScore(payload)

  // Worpen per wedstrijd (volgorde via de createdAt-sortering hierboven behouden).
  const throwsByMatch = new Map<number, typeof throwsRes.docs>()
  for (const t of throwsRes.docs) {
    const mId = relId(t.match)
    if (mId == null) continue
    const arr = throwsByMatch.get(mId) ?? []
    arr.push(t)
    throwsByMatch.set(mId, arr)
  }
  const eventsByMatch = new Map<number, typeof eventsRes.docs>()
  for (const e of eventsRes.docs) {
    const mId = relId(e.match)
    if (mId == null) continue
    const arr = eventsByMatch.get(mId) ?? []
    arr.push(e)
    eventsByMatch.set(mId, arr)
  }

  for (const m of matches) {
    const homeId = relId(m.homeTeam)
    const awayId = relId(m.awayTeam)
    if (homeId == null || awayId == null) continue
    const home = teamById.get(homeId)
    const away = teamById.get(awayId)
    if (!home || !away) continue

    const reducible = (throwsByMatch.get(m.id) ?? []).map((t) => {
      const possId = relId(t.possession)
      const poss = possId != null ? possById.get(possId) : undefined
      const allowed = poss?.throwsAllowed ?? 1
      const teamId = relId(t.team) ?? homeId
      return {
        team: sideOfTeam(teamId, homeId),
        type: t.type,
        outcome: t.outcome,
        isDoelworp: t.throwNumber >= allowed,
        touchedBeforeOut: t.touchedBeforeOut ?? false,
        freeThrow: Boolean(poss?.freeThrow),
      }
    })
    const totals = reduceTotals(reducible)

    // snelscoremodus: snelle doelpunten (+1/+2) en kruisjes staan los van de worp-events.
    const simple = readSimpleScore(m)
    for (const g of simple.goals) totals.score[g.side] += g.points
    totals.crosses.home += simple.crosses.home
    totals.crosses.away += simple.crosses.away

    const half = m.currentHalf ?? 1
    const timeouts = { home: 0, away: 0 }
    let refereeStops = 0
    for (const e of eventsByMatch.get(m.id) ?? []) {
      if ((e.half ?? 1) !== half) continue
      if (e.type === 'referee_stop') {
        refereeStops += 1
      } else if (e.type === 'timeout') {
        const tId = relId(e.team)
        if (tId === homeId) timeouts.home += 1
        else if (tId === awayId) timeouts.away += 1
      }
    }

    out.set(m.id, {
      status: m.status ?? 'scheduled',
      score: totals.score,
      crosses: totals.crosses,
      timeouts,
      refereeStops,
      trust: trustView(sanitizeTrust(m.scoreTrust), { official }),
      teams: {
        home: { id: homeId, name: home.name, logoUrl: clubLogoUrl(home), logoFit: clubLogoFit(home), colors: clubColors(home), clubId: clubIdOf(home), clubName: clubNameOf(home), ...clubLocationOf(home) },
        away: { id: awayId, name: away.name, logoUrl: clubLogoUrl(away), logoFit: clubLogoFit(away), colors: distinguishAway(clubColors(home), clubColors(away)), clubId: clubIdOf(away), clubName: clubNameOf(away), ...clubLocationOf(away) },
      },
    })
  }

  return out
}
