import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { advanceHalf, recordThrow, startMatch } from '@/lib/match-engine'
import { POST as postCvEvents } from '@/app/api/cv/events/route'
import { GET as getLabels } from '@/app/api/cv/match/[id]/labels/route'

// De CV-brug (fase 0): de Python-pipeline stuurt event-VOORSTELLEN in via POST /api/cv/events
// (Bearer CV_BRIDGE_TOKEN) en haalt de bestaande manuele tags als weak labels op via
// GET /api/cv/match/<id>/labels. Voorstellen landen als reviewed=false in 'cv-events' —
// het worp-event-model (throws) blijft de waarheid en wordt hier nergens aangeraakt.

const TOKEN = 'cv-brug-testtoken-1234567890'

let payload: Payload

async function maakWedstrijd() {
  const club = await payload.create({
    collection: 'clubs',
    data: { name: `CV-testclub ${Date.now()}` },
    overrideAccess: true,
  })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('CV Thuis')
  const away = await mk('CV Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `CV speler ${van + i}`, shirtNumber: van + i, team: teamId },
        overrideAccess: true,
      })
      uit.push(p.id as number)
    }
    return uit
  }
  const homePlayers = await spelers(home.id as number, 4)
  const awayPlayers = await spelers(away.id as number, 14)
  const match = await payload.create({
    collection: 'matches',
    data: {
      reeks: '1NAH',
      homeTeam: home.id,
      awayTeam: away.id,
      date: new Date().toISOString(),
      status: 'scheduled',
      goalAreaDepth: 10,
      isDemo: true,
      homeLineup: homePlayers,
      awayLineup: awayPlayers,
    },
    overrideAccess: true,
  })
  return { matchId: match.id as number, homeId: home.id as number, homePlayers, awayPlayers }
}

function geldigEvent(matchId: number) {
  return {
    match_id: matchId,
    video_time_s: 123.4,
    frame: 3702,
    event_type: 'worp',
    worp_type: 'nekworp',
    zone: { in_doelgebied: false, x_m: 7.0, y_m: 20.5 },
    afstand_m: 12.3,
    speler: { team: 'home', rugnummer: 4 },
    score_delta: 0,
    confidence: 0.87,
    provenance: { model: 'test-model', model_version: '0.1.0' },
  }
}

function postRequest(body: unknown, token?: string) {
  return new Request('http://localhost/api/cv/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('CV-brug', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    process.env.CV_BRIDGE_TOKEN = TOKEN
  })

  it('weigert zonder token (401), ook met een fout token, en met token uit', async () => {
    const { matchId } = await maakWedstrijd()
    // Zonder Authorization-header.
    expect(
      (await postCvEvents(postRequest({ matchId, events: [geldigEvent(matchId)] }))).status,
    ).toBe(401)
    // Met een fout token.
    expect(
      (await postCvEvents(postRequest({ matchId, events: [geldigEvent(matchId)] }, 'fout-token')))
        .status,
    ).toBe(401)
    // Zonder ingestelde CV_BRIDGE_TOKEN bestaat de token-weg niet — zelfs het "juiste" token faalt.
    delete process.env.CV_BRIDGE_TOKEN
    try {
      expect(
        (await postCvEvents(postRequest({ matchId, events: [geldigEvent(matchId)] }, TOKEN)))
          .status,
      ).toBe(401)
    } finally {
      process.env.CV_BRIDGE_TOKEN = TOKEN
    }
    // En er is niets geschreven.
    const tel = await payload.count({
      collection: 'cv-events',
      where: { match: { equals: matchId } },
      overrideAccess: true,
    })
    expect(tel.totalDocs).toBe(0)
  })

  it('schrijft met token een voorstel weg: reviewed=false, met provenance', async () => {
    const { matchId } = await maakWedstrijd()
    const res = await postCvEvents(postRequest({ matchId, events: [geldigEvent(matchId)] }, TOKEN))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ aanvaard: 1, geweigerd: [] })

    const docs = await payload.find({
      collection: 'cv-events',
      where: { match: { equals: matchId } },
      overrideAccess: true,
    })
    expect(docs.totalDocs).toBe(1)
    const doc = docs.docs[0]
    expect(doc.reviewed).toBe(false)
    expect(doc.eventType).toBe('worp')
    expect(doc.worpType).toBe('nek')
    expect(doc.videoTimeS).toBeCloseTo(123.4)
    expect(doc.xM).toBeCloseTo(7.0)
    expect(doc.yM).toBeCloseTo(20.5)
    expect(doc.side).toBe('home')
    expect(doc.rugnummer).toBe(4)
    expect(doc.confidence).toBeCloseTo(0.87)
    expect(doc.provenance?.model).toBe('test-model')
    expect(doc.provenance?.modelVersion).toBe('0.1.0')
  })

  it('weigert ongeldige events stuk voor stuk, met reden, zonder de rest te blokkeren', async () => {
    const { matchId } = await maakWedstrijd()
    const res = await postCvEvents(
      postRequest(
        {
          matchId,
          events: [
            geldigEvent(matchId),
            { ...geldigEvent(matchId), confidence: 1.5 },
            { ...geldigEvent(matchId), event_type: 'goal' },
            { ...geldigEvent(matchId), zone: { in_doelgebied: true, x_m: 99, y_m: 5 } },
            { ...geldigEvent(matchId), provenance: { model_version: '0.1.0' } },
          ],
        },
        TOKEN,
      ),
    )
    expect(res.status).toBe(200)
    const rapport = (await res.json()) as {
      aanvaard: number
      geweigerd: { index: number; reden: string }[]
    }
    expect(rapport.aanvaard).toBe(1)
    expect(rapport.geweigerd.map((g) => g.index)).toEqual([1, 2, 3, 4])
    for (const g of rapport.geweigerd) expect(g.reden).toBeTruthy()
    expect(rapport.geweigerd[0].reden).toMatch(/confidence/)
    expect(rapport.geweigerd[1].reden).toMatch(/event_type/)
    expect(rapport.geweigerd[2].reden).toMatch(/x_m/)
    expect(rapport.geweigerd[3].reden).toMatch(/provenance/)
    // Enkel het geldige event staat in de collectie.
    const tel = await payload.count({
      collection: 'cv-events',
      where: { match: { equals: matchId } },
      overrideAccess: true,
    })
    expect(tel.totalDocs).toBe(1)
  })

  it('weigert een onbestaande wedstrijd (404) en een te grote batch (400)', async () => {
    expect((await postCvEvents(postRequest({ matchId: 99999999, events: [] }, TOKEN))).status).toBe(
      404,
    )
    const { matchId } = await maakWedstrijd()
    const teVeel = Array.from({ length: 501 }, () => geldigEvent(matchId))
    expect((await postCvEvents(postRequest({ matchId, events: teVeel }, TOKEN))).status).toBe(400)
  })

  it('levert weak labels: video_time_s per helft-offset, doelpunt-mapping en het rapport', async () => {
    const { matchId, homeId, homePlayers, awayPlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    // Helft 1: een gewone worp (in het veld) en een doelpunt, met expliciete klokstanden.
    await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.6 },
      tapCount: 1,
      gameClock: 30,
    })
    await recordThrow(payload, {
      matchId,
      playerId: homePlayers[1],
      type: 'rug',
      point: { x: 0.5, y: 0.97 },
      tapCount: 1,
      gameClock: 120,
    })
    // IJkpunt helft 1: de aftrap valt op seconde 100 van de video. Helft 2 blijft ongeijkt.
    await payload.update({
      collection: 'matches',
      id: matchId,
      data: { videoOffsetH1: 100 },
      overrideAccess: true,
    })
    // Helft 2 (zonder offset): die worp kan niet gesynct worden.
    await advanceHalf(payload, matchId)
    await recordThrow(payload, {
      matchId,
      playerId: awayPlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.4 },
      tapCount: 1,
      gameClock: 10,
    })

    const zonder = await getLabels(new Request(`http://localhost/api/cv/match/${matchId}/labels`), {
      params: Promise.resolve({ id: String(matchId) }),
    })
    expect(zonder.status).toBe(401)

    const res = await getLabels(
      new Request(`http://localhost/api/cv/match/${matchId}/labels`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
      { params: Promise.resolve({ id: String(matchId) }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.match.id).toBe(matchId)
    expect(body.match.videoOffsetH1).toBe(100)
    expect(body.match.videoOffsetH2).toBeNull()
    expect(body.match.goalAreaDepth).toBe(10)
    expect(body.match.ploegen.home).toBe('CV Thuis')
    expect(body.match.ploegen.away).toBe('CV Uit')

    expect(body.rapport).toEqual({ totaal: 3, syncbaar: 2, nietSyncbaar: 1 })
    expect(body.labels).toHaveLength(3)

    const [worp, doelpunt, tweedeHelft] = body.labels
    // video_time_s = offset van de helft + gameClock.
    expect(worp.half).toBe(1)
    expect(worp.video_time_s).toBe(130)
    expect(worp.event_type).toBe('worp')
    expect(worp.worp_type).toBe('nekworp')
    expect(worp.speler).toEqual({ team: 'home', rugnummer: 4 })
    // Landingspunt in meters via toMeters (veldlengte 46 m bij doelgebied-diepte 10 m).
    expect(worp.landing.x_norm).toBeCloseTo(0.5)
    expect(worp.landing.x_m).toBeCloseTo(7)
    expect(worp.landing.y_m).toBeCloseTo(0.6 * 46)

    expect(doelpunt.video_time_s).toBe(220)
    expect(doelpunt.event_type).toBe('doelpunt')
    expect(doelpunt.worp_type).toBe('rugworp')
    expect(doelpunt.outcome).toBe('goal')

    // Helft 2 zonder videoOffsetH2 → niet syncbaar.
    expect(tweedeHelft.half).toBe(2)
    expect(tweedeHelft.video_time_s).toBeNull()
    expect(tweedeHelft.speler.team).toBe('away')
  })
})
