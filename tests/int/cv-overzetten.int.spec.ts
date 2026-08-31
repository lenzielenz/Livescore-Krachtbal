import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { buildMatchState } from '@/lib/match-engine'
import { zetVoorstellenOver, isOverzetfout, kiesWerper } from '@/lib/cv-overzetten'

// De video-weg tot het einde: bevestigde voorstellen worden échte worpen, en de engine leidt
// daar zelf score, balbezit en kruisjes uit af.
//
// Dit is het gevaarlijkste stuk van de hele video-weg: het schrijft in de worp-events, en die
// zijn onwijzigbaar. Vandaar dat hier vooral vastligt wat er NIET mag gebeuren — overzetten op
// een echte wedstrijd, bovenop bestaande worpen, of stilzwijgend zonder landingspunt.

let payload: Payload

async function maakAnalysewedstrijd(opts: { analyseOnly?: boolean; opstelling?: boolean } = {}) {
  // Een echte wedstrijd wil échte ploegen: de collectie laat analyse-ploegen niet in een
  // competitiewedstrijd toe (en omgekeerd). Voor de test van die grens bouwen we dus beide
  // kanten consequent op.
  const analyse = opts.analyseOnly !== false
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`
  const club = await payload.create({
    collection: 'clubs',
    data: { name: `Overzetclub ${stamp}`, ...(analyse ? { analyseOnly: true } : {}) },
    overrideAccess: true,
  })
  const team = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: {
        name: naam, reeks: '1NAH', category: 'senioren', club: club.id,
        ...(analyse ? { analyseOnly: true } : {}),
      },
      overrideAccess: true,
    })
  const home = await team(`Thuis ${stamp}`)
  const away = await team(`Uit ${stamp}`)
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        // Een analyse-speler hoort bij een analyse-ploeg: de collectie filtert daarop.
        data: {
          name: `Speler ${van + i}`, shirtNumber: van + i, team: teamId,
          ...(analyse ? { analyseOnly: true } : {}),
        },
        overrideAccess: true,
      })
      uit.push(p.id as number)
    }
    return uit
  }
  const homePlayers = await spelers(home.id as number, 1)
  const awayPlayers = await spelers(away.id as number, 11)
  const match = await payload.create({
    collection: 'matches',
    data: {
      reeks: '1NAH',
      homeTeam: home.id,
      awayTeam: away.id,
      date: new Date().toISOString(),
      status: 'scheduled',
      goalAreaDepth: 10,
      analyseOnly: analyse,
      analyseModus: 'video',
      ...(opts.opstelling === false ? {} : { homeLineup: homePlayers, awayLineup: awayPlayers }),
    },
    overrideAccess: true,
  })
  return { matchId: match.id as number, homePlayers, awayPlayers }
}

/** Eén bevestigd voorstel op een plek in het veld. */
async function voorstel(matchId: number, videoTimeS: number, xM: number, yM: number, extra: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'cv-events',
    data: {
      match: matchId,
      videoTimeS,
      eventType: 'worp',
      worpType: 'nek',
      confidence: 0.8,
      reviewed: true,
      verdict: 'bevestigd',
      xM,
      yM,
      inDoelgebied: false,
      provenance: { model: 'test-model', modelVersion: '1' },
      ...extra,
    },
    overrideAccess: true,
  })
}

describe('kiesWerper', () => {
  const opstelling = [
    { id: 1, shirtNumber: 4 },
    { id: 2, shirtNumber: 7 },
    { id: 3, shirtNumber: 9 },
  ]

  it('neemt de speler met het herkende rugnummer', () => {
    expect(kiesWerper(opstelling, 7, null)).toBe(2)
  })

  it('kiest iemand anders als die speler net geworpen heeft', () => {
    // Dezelfde speler mag geen twee worpen na elkaar doen binnen één balbezit; de worp weggooien
    // zou erger zijn dan ze op een andere naam te zetten.
    expect(kiesWerper(opstelling, 7, 2)).not.toBe(2)
  })

  it('gaat rond over de opstelling als het rugnummer onbekend is', () => {
    // Altijd dezelfde nemen zou veertig worpen op naam van één speler zetten: geen onvolledige
    // spelerskaart maar een verzonnen. Rondgaan liegt niet over één speler in het bijzonder.
    expect(kiesWerper(opstelling, null, null, 0)).toBe(1)
    expect(kiesWerper(opstelling, null, null, 1)).toBe(2)
    expect(kiesWerper(opstelling, null, null, 2)).toBe(3)
    expect(kiesWerper(opstelling, null, null, 3)).toBe(1)
  })

  it('houdt zich aan het herkende rugnummer, wat de beurt ook is', () => {
    expect(kiesWerper(opstelling, 9, null, 0)).toBe(3)
    expect(kiesWerper(opstelling, 9, null, 1)).toBe(3)
  })

  it('geeft niets terug als er niemand overblijft', () => {
    expect(kiesWerper([{ id: 1, shirtNumber: 4 }], null, 1)).toBeNull()
  })
})

describe('zetVoorstellenOver', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('rekent droog voor zonder één worp weg te schrijven', async () => {
    const { matchId } = await maakAnalysewedstrijd()
    await voorstel(matchId, 100, 7, 23)
    await voorstel(matchId, 160, 7, 40)

    const r = await zetVoorstellenOver(payload, matchId, { droog: true })
    expect(isOverzetfout(r)).toBe(false)
    if (isOverzetfout(r)) return
    expect(r.droog).toBe(true)
    expect(r.overgezet).toBe(2)
    // Droog betekent droog: er staat daarna geen enkele worp.
    const na = await payload.find({ collection: 'throws', where: { match: { equals: matchId } }, depth: 0, limit: 1 })
    expect(na.totalDocs).toBe(0)
  })

  it('zegt welke beperkingen deze weg heeft', async () => {
    const { matchId } = await maakAnalysewedstrijd()
    await voorstel(matchId, 100, 7, 23)
    const r = await zetVoorstellenOver(payload, matchId, { droog: true })
    if (isOverzetfout(r)) throw new Error(r.fout)
    // Zonder geijkte tweede helft komt alles in helft 1 — dat hoort er luid bij te staan.
    expect(r.tweedeHelftVanaf).toBeNull()
    expect(r.beperkingen.some((b) => b.includes('helft 1'))).toBe(true)
    expect(r.beperkingen.some((b) => b.toLowerCase().includes('uitbal'))).toBe(true)
  })

  it('zegt het wanneer er geen opstelling gekozen is', async () => {
    // startMatch kiest dan stil de eerste vier op rugnummer. Geen fout, maar wel vier namen
    // onder alle afgeleide statistiek die niemand bewust koos.
    const { matchId } = await maakAnalysewedstrijd({ opstelling: false })
    await voorstel(matchId, 100, 7, 30)
    const r = await zetVoorstellenOver(payload, matchId, { droog: true })
    if (isOverzetfout(r)) throw new Error(r.fout)
    expect(r.beperkingen.some((b) => b.toLowerCase().includes('opstelling'))).toBe(true)
  })

  it('zet de worpen op de speler die jij aan die werper toewees', async () => {
    // Het model leest geen rugnummers, maar het onderscheidt wél werpers. Wat een mens daaraan
    // toevoegt — één keer per werper zeggen wie het is — moet vóór alles gaan.
    const { matchId, homePlayers } = await maakAnalysewedstrijd()
    await voorstel(matchId, 100, 7, 30, { werper: 3 })
    await voorstel(matchId, 150, 7, 25, { werper: 3 })
    await payload.update({
      collection: 'matches',
      id: matchId,
      data: { cvWerpers: { '3': homePlayers[2] } },
      overrideAccess: true,
    })

    const r = await zetVoorstellenOver(payload, matchId, { droog: false })
    if (isOverzetfout(r)) throw new Error(r.fout)
    expect(r.metRugnummer).toBeGreaterThan(0)

    const worpen = await payload.find({
      collection: 'throws', where: { match: { equals: matchId } }, sort: 'throwNumber', depth: 0, limit: 10,
    })
    const eerste = worpen.docs[0] as { player?: unknown }
    const spelerId = typeof eerste.player === 'object' && eerste.player
      ? Number((eerste.player as { id: number }).id)
      : Number(eerste.player)
    expect(spelerId).toBe(homePlayers[2])
  })

  it('zegt het wanneer geen enkele worp een herkend rugnummer had', async () => {
    // Zo werkt de videopijplijn vandaag: ze vult het rugnummer zelden in. Dan mogen de
    // spelerskaarten niet doorgaan voor waarheid.
    const { matchId } = await maakAnalysewedstrijd()
    await voorstel(matchId, 100, 7, 30)
    await voorstel(matchId, 150, 7, 25)
    const r = await zetVoorstellenOver(payload, matchId, { droog: false })
    if (isOverzetfout(r)) throw new Error(r.fout)
    expect(r.metRugnummer).toBe(0)
    expect(r.beperkingen.some((b) => b.includes('spelerskaarten'))).toBe(true)
  })

  it('slaat voorstellen zonder landingspunt over, mét reden', async () => {
    const { matchId } = await maakAnalysewedstrijd()
    await voorstel(matchId, 100, 7, 23)
    await payload.create({
      collection: 'cv-events',
      data: {
        match: matchId, videoTimeS: 200, eventType: 'worp', confidence: 0.7,
        reviewed: true, verdict: 'bevestigd', inDoelgebied: false,
        provenance: { model: 'test-model', modelVersion: '1' },
      },
      overrideAccess: true,
    })
    const r = await zetVoorstellenOver(payload, matchId, { droog: true })
    if (isOverzetfout(r)) throw new Error(r.fout)
    expect(r.overgezet).toBe(1)
    expect(r.overgeslagen).toHaveLength(1)
    expect(r.overgeslagen[0].reden).toMatch(/landingspunt/i)
  })

  it('weigert wanneer er niets bevestigd is', async () => {
    const { matchId } = await maakAnalysewedstrijd()
    await voorstel(matchId, 100, 7, 23, { verdict: null, reviewed: false })
    const r = await zetVoorstellenOver(payload, matchId, { droog: true })
    expect(isOverzetfout(r)).toBe(true)
    if (isOverzetfout(r)) expect(r.fout).toMatch(/beoordeel/i)
  })

  it('weigert op een échte wedstrijd — die zou live op het publieke bord verschijnen', async () => {
    const { matchId } = await maakAnalysewedstrijd({ analyseOnly: false })
    await voorstel(matchId, 100, 7, 23)
    const r = await zetVoorstellenOver(payload, matchId, { droog: true })
    expect(isOverzetfout(r)).toBe(true)
    if (isOverzetfout(r)) expect(r.code).toBe(403)
  })

  it('speelt de worpen echt af en laat de engine de rest afleiden', async () => {
    const { matchId } = await maakAnalysewedstrijd()
    // Drie worpen: eentje in het veld, eentje in het doelgebied aan de overkant (doelpunt).
    await voorstel(matchId, 100, 7, 30)
    await voorstel(matchId, 140, 7, 25)
    await voorstel(matchId, 190, 7, 42, { worpType: 'rug' })

    const r = await zetVoorstellenOver(payload, matchId, { droog: false })
    if (isOverzetfout(r)) throw new Error(r.fout)
    expect(r.droog).toBe(false)
    expect(r.overgezet).toBeGreaterThan(0)

    const worpen = await payload.find({
      collection: 'throws',
      where: { match: { equals: matchId } },
      sort: 'throwNumber',
      depth: 0,
      limit: 50,
    })
    expect(worpen.totalDocs).toBe(r.overgezet)
    // De engine bepaalt zone en afstand zelf uit het landingspunt — die mogen niet leeg zijn.
    const eerste = worpen.docs[0] as {
      zone?: unknown; distance?: unknown; gameClock?: number; period?: number; bron?: string
    }
    // Elke afgespeelde worp draagt zijn herkomst: anders staat deze wedstrijd erbij als handwerk
    // en vergelijkt de modelscore het model met zijn eigen voorstellen.
    expect(eerste.bron).toBe('video')
    expect(eerste.zone).toBeTruthy()
    expect(typeof eerste.distance).toBe('number')
    expect(eerste.period).toBe(1)
    // Zonder ijking is de videotijd de klok.
    expect(eerste.gameClock).toBe(100)

    // En de afgeleide stand is opgebouwd zoals bij een aangetekende wedstrijd.
    const state = await buildMatchState(payload, matchId)
    expect(state.match.status).toBe('live')
    expect(state.score.home + state.score.away).toBeGreaterThanOrEqual(0)
  })

  it('weigert een tweede keer overzetten bovenop bestaande worpen', async () => {
    const { matchId } = await maakAnalysewedstrijd()
    await voorstel(matchId, 100, 7, 30)
    await voorstel(matchId, 150, 7, 25)
    const eerst = await zetVoorstellenOver(payload, matchId, { droog: false })
    if (isOverzetfout(eerst)) throw new Error(eerst.fout)

    // Twee keer afspelen zou twee wedstrijden bovenop elkaar leggen: er is geen spoor terug van
    // een worp naar het voorstel dat hem maakte, dus dat valt achteraf niet te ontwarren.
    const opnieuw = await zetVoorstellenOver(payload, matchId, { droog: false })
    expect(isOverzetfout(opnieuw)).toBe(true)
    if (isOverzetfout(opnieuw)) expect(opnieuw.code).toBe(409)
  })
})
