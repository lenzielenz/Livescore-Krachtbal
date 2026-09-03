// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel: `payload.login` ondertekent een JWT en dat lukt hier niet.
// De header zegt wie er belt — "admin" of "viewer" — zodat zowel de 401- als de 403-tak echt
// getest wordt.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) => {
    const wie = req.headers.get('authorization')
    if (!wie) return null
    return wie === 'viewer' ? { id: 2, roles: ['viewer'] } : { id: 1, roles: ['admin'] }
  },
}))

import config from '@/payload.config'
import { POST as beheer } from '@/app/api/ploeg/[id]/beheer/route'
import { GET as zoek } from '@/app/api/clubs/zoek/route'
import { clubsOpId } from '@/lib/ploeg-rechtzetten'
import type { Reeks } from '@/lib/reeksen'

// De ploegnaam en haar club rechtzetten vanaf de ploegpagina.
//
// Dit is de tweede ingang naast /api/match/[id]/beheer: daar bereik je een ploeg via een wedstrijd,
// hier rechtstreeks — ook een ploeg die nog niet gespeeld heeft. Beide lopen door dezelfde
// controle, dus wat hier geweigerd wordt, wordt daar ook geweigerd.

let payload: Payload
const STAMP = Date.now()
const ids = { clubA: 0, clubB: 0, analyseClub: 0, ploeg: 0, verse: 0, analysePloeg: 0 }

const post = (id: number, body: unknown, wie: string | null = 'admin') =>
  beheer(
    new Request(`http://localhost/api/ploeg/${id}/beheer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(wie ? { authorization: wie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  )

describe('ploeg rechtzetten', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const club = async (naam: string, analyse = false) =>
      (await payload.create({ collection: 'clubs', data: { name: naam, ...(analyse ? { analyseOnly: true } : {}) }, overrideAccess: true })).id as number
    const ploeg = async (naam: string, clubId: number, analyse = false) =>
      (
        await payload.create({
          collection: 'teams',
          data: { name: naam, club: clubId, reeks: '2NAH' as Reeks, category: 'senioren', ...(analyse ? { analyseOnly: true } : {}) },
          overrideAccess: true,
        })
      ).id as number

    ids.clubA = await club(`Ploegbeheer A ${STAMP}`)
    ids.clubB = await club(`Ploegbeheer B ${STAMP}`)
    ids.analyseClub = await club(`Ploegbeheer analyse ${STAMP}`, true)
    ids.ploeg = await ploeg(`Ploegbeheer A ${STAMP} A-1`, ids.clubA)
    // Een ploeg zonder enige wedstrijd — precies het geval dat via de wedstrijdpagina onbereikbaar
    // is en waarvoor deze route bestaat.
    ids.verse = await ploeg(`Ploegbeheer vers ${STAMP}`, ids.clubA)
    ids.analysePloeg = await ploeg(`Ploegbeheer analyse ${STAMP}`, ids.analyseClub, true)
  }, 90_000)

  it('weigert wie niet ingelogd is', async () => {
    expect((await post(ids.ploeg, { naam: 'Iets' }, null)).status).toBe(401)
  }, 30_000)

  it('weigert een gewone bezoeker', async () => {
    const res = await post(ids.ploeg, { naam: 'Iets' }, 'viewer')
    expect(res.status).toBe(403)
    // En de naam staat er onaangeroerd bij.
    const na = await payload.findByID({ collection: 'teams', id: ids.ploeg, depth: 0, overrideAccess: true })
    expect((na as { name: string }).name).toBe(`Ploegbeheer A ${STAMP} A-1`)
  }, 60_000)

  it('corrigeert de naam en de club in één keer', async () => {
    const res = await post(ids.ploeg, { naam: `Ploegbeheer B ${STAMP} A-1`, clubId: ids.clubB })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, naam: `Ploegbeheer B ${STAMP} A-1`, clubId: ids.clubB })

    const na = await payload.findByID({ collection: 'teams', id: ids.ploeg, depth: 0, overrideAccess: true })
    expect((na as { name: string }).name).toBe(`Ploegbeheer B ${STAMP} A-1`)
    expect(Number((na as { club: unknown }).club)).toBe(ids.clubB)
  }, 60_000)

  it('werkt op een ploeg die nog geen wedstrijd heeft', async () => {
    const res = await post(ids.verse, { naam: `Ploegbeheer vers ${STAMP} B-2`, clubId: ids.clubB })
    expect(res.status).toBe(200)
    const na = await payload.findByID({ collection: 'teams', id: ids.verse, depth: 0, overrideAccess: true })
    expect(Number((na as { club: unknown }).club)).toBe(ids.clubB)
  }, 60_000)

  it('laat de reeks en de categorie ongemoeid', async () => {
    // De route schrijft uitsluitend name en club; de indeling van de ploeg komt van de import en
    // hoort hier niet stilzwijgend mee te veranderen.
    const na = await payload.findByID({ collection: 'teams', id: ids.ploeg, depth: 0, overrideAccess: true })
    expect((na as { reeks: string }).reeks).toBe('2NAH')
    expect((na as { category: string }).category).toBe('senioren')
  }, 30_000)

  it('weigert een lege naam, een onbekende club en een leeg verzoek', async () => {
    expect((await post(ids.ploeg, { naam: '   ' })).status).toBe(400)
    expect((await post(ids.ploeg, { clubId: 999999 })).status).toBe(404)
    expect((await post(ids.ploeg, {})).status).toBe(400)
  }, 60_000)

  it('weigert een analyse-club als doel', async () => {
    const res = await post(ids.ploeg, { clubId: ids.analyseClub })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('analyse')
  }, 30_000)

  it('laat een analyseploeg hier niet beheren', async () => {
    const res = await post(ids.analysePloeg, { naam: 'Andere naam' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('analyse')
  }, 30_000)

  it('geeft 404 op een ploeg die niet bestaat en 400 op een onzin-id', async () => {
    expect((await post(999999, { naam: 'X' })).status).toBe(404)
    expect(
      (await beheer(new Request('http://localhost/api/ploeg/abc/beheer', { method: 'POST', body: '{}' }), {
        params: Promise.resolve({ id: 'abc' }),
      })).status,
    ).toBe(400)
  }, 30_000)

  it('haalt de club op waar een ploeg nú onder hangt', async () => {
    // Waar dit voor dient: het formulier moet de huidige club tonen, ook al staat ze niet in een
    // zoekresultaat. De eerste versie toonde een keuzelijst met een cap van 1000 op meer dan
    // vierduizend clubs — die loog dus over ploegen waarvan de club buiten de cap viel.
    const lijst = await clubsOpId(payload, [ids.clubA, ids.clubB])
    expect(lijst.map((c) => c.id).sort()).toEqual([ids.clubA, ids.clubB].sort())
    expect(lijst.find((c) => c.id === ids.clubA)?.naam).toBe(`Ploegbeheer A ${STAMP}`)
  }, 60_000)

  it('gaat om met dubbels, lege waarden en een club die niet bestaat', async () => {
    expect(await clubsOpId(payload, [])).toEqual([])
    expect(await clubsOpId(payload, [null, undefined])).toEqual([])
    expect(await clubsOpId(payload, [ids.clubA, ids.clubA, null])).toHaveLength(1)
    expect(await clubsOpId(payload, [999999])).toEqual([])
  }, 60_000)
})

// De club kiezen gebeurt via zoeken en niet via een keuzelijst: er staan meer dan vierduizend
// competitieclubs in de database. Elke cap op zo'n lijst snijdt precies de club weg die je nodig
// hebt — vandaar dit endpoint.

describe('clubs zoeken', () => {
  const zoeken = (q: string, wie: string | null = 'admin') =>
    zoek(
      new Request(`http://localhost/api/clubs/zoek?q=${encodeURIComponent(q)}`, {
        headers: wie ? { authorization: wie } : {},
      }),
    )

  it('is niet open voor iedereen', async () => {
    expect((await zoeken('Ploegbeheer', null)).status).toBe(401)
    expect((await zoeken('Ploegbeheer', 'viewer')).status).toBe(403)
  }, 60_000)

  it('vindt een club op een stuk van haar naam', async () => {
    const res = await zoeken(`Ploegbeheer A ${STAMP}`)
    expect(res.status).toBe(200)
    const j = (await res.json()) as { clubs: { id: number; naam: string }[] }
    expect(j.clubs.some((c) => c.id === ids.clubA)).toBe(true)
  }, 60_000)

  it('laat analyse-clubs buiten de resultaten', async () => {
    // Een analyse-club is privé en kan hier toch niet gekozen worden; ze aanbieden zou enkel tot
    // een foutmelding leiden na het opslaan.
    const j = (await (await zoeken(`Ploegbeheer analyse ${STAMP}`)).json()) as { clubs: { id: number }[] }
    expect(j.clubs.some((c) => c.id === ids.analyseClub)).toBe(false)
  }, 60_000)

  it('zoekt niet op één letter en geeft nooit een eindeloze lijst terug', async () => {
    const kort = (await (await zoeken('K')).json()) as { clubs: unknown[]; hint?: string }
    expect(kort.clubs).toEqual([])
    expect(kort.hint).toBeTruthy()

    // 'e' zit in zowat elke clubnaam; het antwoord blijft begrensd en zegt dat er meer zijn.
    const veel = (await (await zoeken('er')).json()) as { clubs: unknown[]; meer: boolean }
    expect(veel.clubs.length).toBeLessThanOrEqual(20)
    expect(veel.meer).toBe(true)
  }, 60_000)
})
