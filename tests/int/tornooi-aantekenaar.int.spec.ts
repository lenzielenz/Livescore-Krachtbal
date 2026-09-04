// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel (payload.login ondertekent een JWT en dat lukt hier niet).
let alsWie: Record<string, unknown> | null = null
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async () => alsWie,
}))

import config from '@/payload.config'
import { POST as actie } from '@/app/api/tournament/[id]/match/[matchId]/action/route'
import { NAAMLOOS, sanitizeAantekenaars, sanitizeAfsluiter } from '@/lib/aantekenaars'
import { buildTournamentState, createTournament } from '@/lib/tournament-engine'

// Wie tekende deze wedstrijd aan?
//
// Bij een betwiste uitslag is dat de eerste vraag, en tot voor kort was ze onbeantwoordbaar: enkel
// een supporter liet een spoor na, de organisatie niet. Deze test bewaakt dat élke aantekenaar
// geboekt wordt, dat het eindsignaal een eigen naam krijgt, en dat er nooit een e-mailadres in het
// publieke veld belandt.

let payload: Payload
const STAMP = Date.now()
const ids = { tournament: 0, match: 0, tweede: 0 }

const roepOp = (matchId: number, body: unknown) =>
  actie(
    new Request(`http://localhost/api/tournament/${ids.tournament}/match/${matchId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(ids.tournament), matchId: String(matchId) }) },
  )
const roep = (body: unknown) => roepOp(ids.match, body)

const rij = async (matchId = ids.match) =>
  payload.findByID({ collection: 'tournament-matches', id: matchId, depth: 0, overrideAccess: true })

const staat = async (matchId = ids.match) => {
  const state = await buildTournamentState(payload, ids.tournament)
  const m = state.rounds.flatMap((r) => r.matches).find((x) => x.id === matchId)
  if (!m) throw new Error('Wedstrijd niet gevonden')
  return m
}

const zetModus = async (scoreMode: 'federatie' | 'supporters') => {
  await payload.updateGlobal({ slug: 'settings', data: { scoreMode }, depth: 0, overrideAccess: true })
}

const TAFEL = { id: 8201, roles: ['federatie'], name: 'Jan Peeters' }
const HELPER = { id: 8202, roles: ['viewer'], aantekenRechten: true, name: 'Rita Claes' }

describe('wie tekende de tornooiwedstrijd aan', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    ids.tournament = await createTournament(payload, {
      name: `Aantekenbeker ${STAMP}`,
      category: 'U16',
      method: 'manual',
      format: 'roundrobin',
      slots: ['Ploeg A', 'Ploeg B', 'Ploeg C'],
      groep: `Aantekenbeker ${STAMP}`,
    })
    const wedstrijden = await payload.find({
      collection: 'tournament-matches',
      where: { tournament: { equals: ids.tournament } },
      sort: 'id',
      depth: 0,
      limit: 3,
      overrideAccess: true,
    })
    ids.match = wedstrijden.docs[0].id as number
    ids.tweede = wedstrijden.docs[1].id as number
    await zetModus('federatie')
  }, 90_000)

  afterAll(async () => {
    await zetModus('federatie').catch(() => undefined)
  })

  it('boekt de organisatie die aantekent — precies het geval dat vroeger anoniem bleef', async () => {
    alsWie = TAFEL
    expect((await roep({ action: 'start' })).status).toBe(200)
    expect((await roep({ action: 'goal', side: 'home', points: 2 })).status).toBe(200)

    const lijst = sanitizeAantekenaars((await rij() as { aantekenaars?: unknown }).aantekenaars)
    expect(lijst).toHaveLength(1)
    expect(lijst[0]).toMatchObject({ id: TAFEL.id, naam: 'Jan Peeters', rol: 'organisatie', acties: 2 })
    expect(lijst[0].eerste).toBeLessThanOrEqual(lijst[0].laatste)

    expect((await staat()).aantekenaar?.tekst).toBe('Aangetekend door Jan Peeters')
  }, 60_000)

  it('noemt een tweede helper erbij zonder de eerste te verdringen', async () => {
    alsWie = HELPER
    expect((await roep({ action: 'goal', side: 'away', points: 1 })).status).toBe(200)

    const m = await staat()
    // Jan deed er twee, Rita één — Jan blijft dus de hoofdaantekenaar.
    expect(m.aantekenaar?.tekst).toBe('Aangetekend door Jan Peeters en Rita Claes')
    expect(m.aantekenaar?.aantal).toBe(2)
  }, 60_000)

  it('zet een eigen handtekening onder het eindsignaal', async () => {
    alsWie = HELPER
    expect((await roep({ action: 'finish' })).status).toBe(200)

    const afsluiter = sanitizeAfsluiter((await rij() as { afgeslotenDoor?: unknown }).afgeslotenDoor)
    expect(afsluiter).toMatchObject({ id: HELPER.id, naam: 'Rita Claes' })
    expect(afsluiter?.op).toBeGreaterThan(0)
    expect((await staat()).aantekenaar?.tekst).toBe(
      'Aangetekend door Jan Peeters en Rita Claes · afgesloten door Rita Claes',
    )
  }, 60_000)

  it('zet nooit een e-mailadres in het publieke veld', async () => {
    // Users.name is niet verplicht. Verschillende schrijfpaden in dit project vallen dan terug op
    // het adres — en dat is volgens het privacybeleid net niet publiek.
    alsWie = { id: 8203, roles: ['federatie'], email: 'naamloos@voorbeeld.be' }
    expect((await roepOp(ids.tweede, { action: 'start' })).status).toBe(200)

    const lijst = sanitizeAantekenaars((await rij(ids.tweede) as { aantekenaars?: unknown }).aantekenaars)
    expect(lijst[0].naam).toBe(NAAMLOOS)
    expect(JSON.stringify(lijst)).not.toContain('@')
  }, 60_000)

  it('merkt een supporter als supporter aan', async () => {
    await zetModus('supporters')
    alsWie = { id: 8204, roles: ['scorekeeper'], name: 'Bert Vos' }
    expect((await roepOp(ids.tweede, { action: 'goal', side: 'home', points: 1 })).status).toBe(200)

    const lijst = sanitizeAantekenaars((await rij(ids.tweede) as { aantekenaars?: unknown }).aantekenaars)
    const bert = lijst.find((a) => a.id === 8204)
    expect(bert).toMatchObject({ naam: 'Bert Vos', rol: 'supporter' })
    // En de organisatie die eerder startte staat er nog steeds bij, met haar eigen rol.
    expect(lijst.find((a) => a.id === 8203)?.rol).toBe('organisatie')
  }, 60_000)

  it('laat de admin kijken maar niet bewerken', async () => {
    // De collectie staat nu zichtbaar in /admin zodat een beheerder het spoor kan opzoeken. Dat mag
    // niet betekenen dat ze ook met de hand aan te passen is: de stand is event-sourced en een
    // handmatige wijziging zou het schema uit balans brengen. Zonder deze access-regels valt Payload
    // terug op "elke ingelogde gebruiker mag schrijven".
    //
    // `overrideAccess: false` is wat de adminpanelen en de REST-API doen; de Local API laat het
    // standaard op true staan, en dán zou deze test niets bewijzen.
    const alsIngelogde = { overrideAccess: false, user: { id: 1, roles: ['scorekeeper'] } } as never
    await expect(
      payload.update({ collection: 'tournament-matches', id: ids.match, data: { home: 'Vervalst' }, ...alsIngelogde }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'tournament-matches', id: ids.match, ...alsIngelogde }),
    ).rejects.toThrow()

    // Lezen blijft wél gewoon werken — anders zou het overzicht leeg zijn.
    const doc = await payload.findByID({ collection: 'tournament-matches', id: ids.match, ...alsIngelogde })
    expect((doc as { home?: unknown }).home).not.toBe('Vervalst')

    // En de engine gaat er nog altijd langs (die schrijft met overrideAccess).
    alsWie = TAFEL
    expect((await roep({ action: 'reopen' })).status).toBe(200)
    expect((await roep({ action: 'finish' })).status).toBe(200)
  }, 60_000)

  it('laat een geweigerde actie geen spoor na', async () => {
    await zetModus('federatie')
    alsWie = { id: 8205, roles: ['scorekeeper'], name: 'Passant' }
    expect((await roepOp(ids.tweede, { action: 'goal', side: 'home', points: 1 })).status).toBe(403)

    const lijst = sanitizeAantekenaars((await rij(ids.tweede) as { aantekenaars?: unknown }).aantekenaars)
    expect(lijst.some((a) => a.id === 8205)).toBe(false)
  }, 60_000)
})
