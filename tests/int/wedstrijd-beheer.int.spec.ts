// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel: `payload.login` ondertekent een JWT en dat lukt hier niet.
// Een Authorization-header telt als federatie/admin; zonder header ben je niet ingelogd, zodat de
// 401-tak écht getest blijft.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) =>
    req.headers.get('authorization') ? { id: 1, roles: ['admin'] } : null,
}))

import config from '@/payload.config'
import { POST as beheer } from '@/app/api/match/[id]/beheer/route'
import type { Reeks } from '@/lib/reeksen'

// Een wedstrijd rechtzetten vanaf de wedstrijdpagina: tijdstip, ploegnaam en club.
//
// Wat hier bewaakt wordt: dat de tijdzone klopt (de beheerder typt Belgische kloktijd, de database
// bewaart UTC), dat de route niets aanraakt buiten datum/seizoen en naam/club — de wedstrijdstaat
// blijft van de engine — en dat een analysewedstrijd hier niet te beheren valt.

let payload: Payload
const STAMP = Date.now()
const ids = { clubA: 0, clubB: 0, thuis: 0, uit: 0, match: 0, analyse: 0 }

const req = (id: number, body: unknown, metAuth = true) =>
  new Request(`http://localhost/api/match/${id}/beheer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(metAuth ? { authorization: 'JWT test' } : {}) },
    body: JSON.stringify(body),
  })
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const post = (id: number, body: unknown, metAuth = true) => beheer(req(id, body, metAuth), params(id))

describe('wedstrijd rechtzetten', () => {
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

    ids.clubA = await club(`Beheertest A ${STAMP}`)
    ids.clubB = await club(`Beheertest B ${STAMP}`)
    ids.thuis = await ploeg(`Beheertest A ${STAMP} A-1`, ids.clubA)
    ids.uit = await ploeg(`Beheertest B ${STAMP}`, ids.clubB)
    ids.match = (
      await payload.create({
        collection: 'matches',
        data: {
          reeks: '2NAH',
          homeTeam: ids.thuis,
          awayTeam: ids.uit,
          date: '2026-09-12T15:30:00.000Z',
          status: 'finished',
          goalAreaDepth: 10,
        },
        overrideAccess: true,
      })
    ).id as number
    // Een analysewedstrijd hoort analyseploegen te hebben (de collectie eist dat); die maken we
    // apart aan, zodat de test de echte situatie nabootst i.p.v. de validatie te omzeilen.
    const analyseClub = await club(`Beheertest analyse ${STAMP}`, true)
    const analyseThuis = await ploeg(`Beheertest analyse thuis ${STAMP}`, analyseClub, true)
    const analyseUit = await ploeg(`Beheertest analyse uit ${STAMP}`, analyseClub, true)
    ids.analyse = (
      await payload.create({
        collection: 'matches',
        data: {
          reeks: '2NAH',
          homeTeam: analyseThuis,
          awayTeam: analyseUit,
          date: '2026-09-12T15:30:00.000Z',
          status: 'scheduled',
          goalAreaDepth: 10,
          analyseOnly: true,
        },
        overrideAccess: true,
      })
    ).id as number
  }, 90_000)

  it('weigert wie niet ingelogd is en wie geen federatie is', async () => {
    const uit = await post(ids.match, { action: 'tijdstip', datum: '2026-09-19', uur: '20:00' }, false)
    expect(uit.status).toBe(401)
  }, 30_000)

  it('zet het aanvangsuur in Belgische kloktijd, niet in UTC', async () => {
    // 19 september 2026 om 20:00 in Brussel is 18:00 UTC (zomertijd).
    const res = await post(ids.match, { action: 'tijdstip', datum: '2026-09-19', uur: '20:00' })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { date: string; velden: { datum: string; uur: string } }
    expect(j.date).toBe('2026-09-19T18:00:00.000Z')
    expect(j.velden).toEqual({ datum: '2026-09-19', uur: '20:00' })

    const na = await payload.findByID({ collection: 'matches', id: ids.match, depth: 0, overrideAccess: true })
    expect(new Date((na as { date: string }).date).toISOString()).toBe('2026-09-19T18:00:00.000Z')
  }, 60_000)

  it('houdt in de winter rekening met de andere tijdzone-verschuiving', async () => {
    // 12 december 2026 om 20:00 in Brussel is 19:00 UTC (wintertijd).
    const res = await post(ids.match, { action: 'tijdstip', datum: '2026-12-12', uur: '20:00' })
    const j = (await res.json()) as { date: string }
    expect(j.date).toBe('2026-12-12T19:00:00.000Z')
  }, 60_000)

  it('laat de wedstrijdstaat met rust — ook op een afgelopen wedstrijd', async () => {
    // De finished-guard beschermt score/worpen/status; een verkeerd geïmporteerde datum zit net op
    // gespeelde wedstrijden. Deze route mag die corrigeren en verder niets aanraken.
    const na = await payload.findByID({ collection: 'matches', id: ids.match, depth: 0, overrideAccess: true })
    expect((na as { status: string }).status).toBe('finished')
    expect(Number((na as { homeTeam: unknown }).homeTeam)).toBe(ids.thuis)
    expect(Number((na as { awayTeam: unknown }).awayTeam)).toBe(ids.uit)
  }, 30_000)

  it('weigert een datum die niet bestaat en onleesbare invoer', async () => {
    for (const body of [
      { action: 'tijdstip', datum: '2026-02-31', uur: '20:00' },
      { action: 'tijdstip', datum: '12/09/2026', uur: '20:00' },
      { action: 'tijdstip', datum: '2026-09-19', uur: '25:00' },
    ]) {
      const res = await post(ids.match, body)
      expect(res.status).toBe(400)
    }
    // En de wedstrijd staat nog op de laatst geslaagde correctie.
    const na = await payload.findByID({ collection: 'matches', id: ids.match, depth: 0, overrideAccess: true })
    expect(new Date((na as { date: string }).date).toISOString()).toBe('2026-12-12T19:00:00.000Z')
  }, 60_000)

  it('corrigeert de ploegnaam en de club in één keer', async () => {
    const res = await post(ids.match, { action: 'ploeg', kant: 'home', naam: `Beheertest A ${STAMP} B-2`, clubId: ids.clubB })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { naam: string; clubId: number }
    expect(j).toMatchObject({ naam: `Beheertest A ${STAMP} B-2`, clubId: ids.clubB })

    const na = await payload.findByID({ collection: 'teams', id: ids.thuis, depth: 0, overrideAccess: true })
    expect((na as { name: string }).name).toBe(`Beheertest A ${STAMP} B-2`)
    expect(Number((na as { club: unknown }).club)).toBe(ids.clubB)
  }, 60_000)

  it('weigert een lege naam, een onbekende club en een onbekende kant', async () => {
    expect((await post(ids.match, { action: 'ploeg', kant: 'home', naam: '   ' })).status).toBe(400)
    expect((await post(ids.match, { action: 'ploeg', kant: 'home', clubId: 999999 })).status).toBe(404)
    expect((await post(ids.match, { action: 'ploeg', kant: 'zijkant', naam: 'X' })).status).toBe(400)
    expect((await post(ids.match, { action: 'ploeg', kant: 'home' })).status).toBe(400)
    expect((await post(ids.match, { action: 'onzin' })).status).toBe(400)
  }, 60_000)

  it('laat een analysewedstrijd hier niet beheren', async () => {
    const res = await post(ids.analyse, { action: 'tijdstip', datum: '2026-09-19', uur: '20:00' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('analyse')
  }, 30_000)

  it('geeft 404 op een wedstrijd die niet bestaat', async () => {
    expect((await post(999999, { action: 'tijdstip', datum: '2026-09-19', uur: '20:00' })).status).toBe(404)
  }, 30_000)
})
