// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel (payload.login ondertekent een JWT en dat lukt hier niet).
// Deze variabele bepaalt wie er belt, zodat elke supporter apart getest kan worden.
let alsWie: Record<string, unknown> | null = null
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async () => alsWie,
}))

import config from '@/payload.config'
import { POST as actie } from '@/app/api/tournament/[id]/match/[matchId]/action/route'
import { buildTournamentState, createTournament } from '@/lib/tournament-engine'
import { readMatchTrust } from '@/lib/score-trust-store'

// Supporters die een tornooiwedstrijd meetellen.
//
// Op een tornooidag spelen tien velden tegelijk; achter de meeste zit niemand van de organisatie.
// Staat het platform op vrije livescore, dan telt een supporter mee — met zijn naam bij de stand en
// de mogelijkheid voor andere kijkers om ze te bevestigen of te betwisten. Wat een supporter NIET
// mag is even belangrijk: plannen, velden toewijzen en andermans wedstrijd terugzetten.

let payload: Payload
const STAMP = Date.now()
const ids = { tournament: 0, match: 0 }

const roep = (body: unknown) =>
  actie(
    new Request(`http://localhost/api/tournament/${ids.tournament}/match/${ids.match}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(ids.tournament), matchId: String(ids.match) }) },
  )

const zetModus = async (scoreMode: 'federatie' | 'supporters') => {
  await payload.updateGlobal({ slug: 'settings', data: { scoreMode }, depth: 0, overrideAccess: true })
}

const wedstrijd = async () => {
  const state = await buildTournamentState(payload, ids.tournament)
  const m = state.rounds.flatMap((r) => r.matches).find((x) => x.id === ids.match)
  if (!m) throw new Error('Wedstrijd niet gevonden')
  return m
}

const SUPPORTER = { id: 9101, roles: ['scorekeeper'], name: 'Rita' }
const KIJKER = { id: 9102, roles: ['scorekeeper'], name: 'Jos' }

describe('supporters tellen een tornooiwedstrijd mee', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    ids.tournament = await createTournament(payload, {
      name: `Supportersbeker ${STAMP}`,
      category: 'U14',
      method: 'manual',
      format: 'roundrobin',
      slots: ['Ploeg A', 'Ploeg B'],
      groep: `Supportersbeker ${STAMP}`,
    })
    const wedstrijden = await payload.find({
      collection: 'tournament-matches',
      where: { tournament: { equals: ids.tournament } },
      sort: 'id',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    ids.match = wedstrijden.docs[0].id as number
    await zetModus('supporters')
  }, 90_000)

  afterAll(async () => {
    // De modus is een globale instelling — laat ze niet aan staan voor de volgende testbestanden.
    await zetModus('federatie').catch(() => undefined)
  })

  it('vraagt nog altijd een login', async () => {
    alsWie = null
    expect((await roep({ action: 'start' })).status).toBe(401)
  }, 30_000)

  it('laat een ingelogde supporter starten en scoren, met zijn naam bij de stand', async () => {
    alsWie = SUPPORTER
    expect((await roep({ action: 'start' })).status).toBe(200)
    expect((await roep({ action: 'goal', side: 'home', points: 2 })).status).toBe(200)

    const m = await wedstrijd()
    expect(m.score).toEqual({ home: 2, away: 0 })
    expect(m.trust).not.toBeNull()
    expect(m.trust?.scorerId).toBe(SUPPORTER.id)
    expect(m.trust?.scorerName).toBe('Rita')
    // Nog niemand bevestigde: geel, niet groen.
    expect(m.trust?.label).toBe('unconfirmed')
  }, 60_000)

  it('houdt de wedstrijd bij één meeteller — de rest bevestigt of betwist', async () => {
    alsWie = KIJKER
    const geweigerd = await roep({ action: 'goal', side: 'away', points: 1 })
    expect(geweigerd.status).toBe(403)
    expect(((await geweigerd.json()) as { error: string }).error).toContain('Rita')

    expect((await roep({ action: 'bevestig' })).status).toBe(200)
    const na = await readMatchTrust(payload, ids.match, 'tournament-matches')
    expect(na.confirms.map((v) => v.userId)).toEqual([KIJKER.id])
    // De stand van de wedstrijd bleef ongemoeid: bevestigen is geen scoren.
    expect((await wedstrijd()).score).toEqual({ home: 2, away: 0 })
  }, 60_000)

  it('laat wie meetelt zijn eigen stand niet bevestigen', async () => {
    alsWie = SUPPORTER
    const res = await roep({ action: 'bevestig' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('zelf')
  }, 30_000)

  it('houdt dagorganisatie en correcties bij de organisatie', async () => {
    alsWie = SUPPORTER
    for (const body of [
      { action: 'veld', veld: 2 },
      { action: 'plan', plannedAt: new Date().toISOString() },
      { action: 'wissel' },
      { action: 'reset' },
      { action: 'reopen' },
    ]) {
      const res = await roep(body)
      expect(res.status, `${body.action} zou geweigerd moeten worden`).toBe(403)
      expect(((await res.json()) as { error: string }).error).toContain('organisatie')
    }
    // En het veld staat er inderdaad niet.
    expect((await wedstrijd()).veld).toBeNull()
  }, 60_000)

  it('laat de organisatie erlangs zonder de claim over te nemen', async () => {
    // Wie een echt aantekenrecht heeft, gaat niet door de vertrouwenslaag: die neemt gewoon over.
    alsWie = { id: 9103, roles: ['federatie'], name: 'Tafel' }
    expect((await roep({ action: 'goal', side: 'away', points: 1 })).status).toBe(200)

    const m = await wedstrijd()
    expect(m.score).toEqual({ home: 2, away: 1 })
    expect(m.trust?.scorerId).toBe(SUPPORTER.id)

    expect((await roep({ action: 'veld', veld: 3 })).status).toBe(200)
    expect((await wedstrijd()).veld).toBe(3)
  }, 60_000)

  it('sluit de supporter weer buiten zodra de federatiemodus terug aan staat', async () => {
    await zetModus('federatie')
    alsWie = KIJKER
    expect((await roep({ action: 'goal', side: 'home', points: 1 })).status).toBe(403)
    // Bevestigen hoort dan ook niet meer: er valt niets vrij door te geven.
    expect((await roep({ action: 'bevestig' })).status).toBe(403)
  }, 60_000)
})
