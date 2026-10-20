// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_p: unknown, req: Request) => (req.headers.get('authorization') ? { id: 1, roles: ['federatie'] } : null),
}))

import config from '@/payload.config'
import { POST as reglementRoute } from '@/app/api/federatie/reglement/route'
import { controleerEindrondes, eindrondeStatus, vastspelenVoorClub } from '@/lib/competitieregels'
import { buildRoster } from '@/lib/matchsheet-data'
import { seasonFromDate } from '@/lib/seasons'

// Het reglement als bron: een regel uit een verslag zet het vastspelen en de eindronde in gang.

let payload: Payload
const STAMP = Date.now()
const SEIZOEN = seasonFromDate(new Date())
const ids = { reglement: 0, verslag: 0, club: 0, eerste: 0, tweede: 0, tegen: 0, tegenLaag: 0, speler: 0, regel: 0 }
const post = (body: unknown) =>
  reglementRoute(new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'fed' }, body: JSON.stringify(body) }))

const wedstrijd = async (thuis: number, uit: number, reeks: string, status: 'finished' | 'scheduled', opstelling?: number[]) => {
  const m = await payload.create({
    collection: 'matches',
    data: { homeTeam: thuis, awayTeam: uit, reeks: reeks as never, date: new Date(Date.now() - 86_400_000).toISOString(), seizoen: SEIZOEN, status, goalAreaDepth: 10 },
    overrideAccess: true,
  })
  if (opstelling) {
    await payload.create({
      collection: 'matchsheets',
      data: { match: m.id, status: 'concept', homeLineup: opstelling.map((p, i) => ({ player: p, rugnummer: i + 1, deelgenomen: true })) },
      overrideAccess: true,
    })
  }
  return Number(m.id)
}

describe('reglement en regels', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    for (const r of ['2NAHB', 'RDA']) {
      await payload.delete({ collection: 'matches', where: { reeks: { equals: r } }, overrideAccess: true }).catch(() => null)
      await payload.delete({ collection: 'teams', where: { reeks: { equals: r } }, overrideAccess: true }).catch(() => null)
    }
    await payload.delete({ collection: 'competitieregels', where: { naam: { like: 'Test ' } }, overrideAccess: true }).catch(() => null)
    ids.club = Number((await payload.create({ collection: 'clubs', data: { name: `Regels ${STAMP}` }, overrideAccess: true })).id)
    const ander = Number((await payload.create({ collection: 'clubs', data: { name: `Regels ander ${STAMP}` }, overrideAccess: true })).id)
    const ploeg = async (n: string, club: number, reeks: string) =>
      Number((await payload.create({ collection: 'teams', data: { name: `${n} ${STAMP}`, club, category: 'senioren', reeks: reeks as never }, overrideAccess: true })).id)
    ids.eerste = await ploeg('Eerste', ids.club, '2NAHB')
    ids.tweede = await ploeg('Tweede', ids.club, 'RDA')
    ids.tegen = await ploeg('Tegen', ander, '2NAHB')
    ids.tegenLaag = await ploeg('Tegen laag', ander, 'RDA')
    ids.speler = Number(
      (
        await payload.create({
          collection: 'players',
          data: { name: `Jonge speler ${STAMP}`, team: ids.tweede, shirtNumber: 9, vergunningsstatus: 'geldig', medischAttest: true, birthDate: '2000-01-01' },
          overrideAccess: true,
        })
      ).id,
    )
  }, 120_000)

  it('nieuwe reglementversie: concept, dan laten gelden; een verslag hangt eraan', async () => {
    const r = (await (await post({ actie: 'reglement', titel: `RCVK test ${STAMP}`, geldigVanaf: '2026-07-01', inhoud: '# Reglement\n\n## Art. 1\nTekst.' })).json()) as { id: number }
    ids.reglement = r.id
    expect((await payload.findByID({ collection: 'reglementen', id: r.id, overrideAccess: true })).status).toBe('concept')
    expect((await post({ actie: 'activeren', id: r.id })).status).toBe(200)
    expect((await payload.findByID({ collection: 'reglementen', id: r.id, overrideAccess: true })).status).toBe('actief')
    const v = (await (await post({ actie: 'verslag', titel: 'AV: vastspelen en eindronde', datum: '2026-09-01', reglement: r.id, artikel: 'art. 21', inhoud: 'Max 2 keer hoger.' })).json()) as { id: number }
    ids.verslag = v.id
    // Een regel zonder bron gaat niet.
    expect((await post({ actie: 'regel', naam: 'Test zonder bron', soort: 'vastspelen', maxKeerHoger: 2 })).status).toBe(400)
  })

  it('vastspelen: na 2× hoger zit de speler vast en mag hij niet meer in zijn eigen lagere ploeg', async () => {
    expect((await post({ actie: 'regel', naam: 'Test vastspelen', soort: 'vastspelen', maxKeerHoger: 2, categorie: 'senioren', verslag: ids.verslag, artikel: 'art. 21' })).status).toBe(200)
    await wedstrijd(ids.eerste, ids.tegen, '2NAHB', 'finished', [ids.speler])
    let st = (await vastspelenVoorClub(payload, ids.club, SEIZOEN)).get(ids.speler)
    expect(st?.hoger[0]).toMatchObject({ reeks: '2NAHB', keer: 1 })
    expect(st?.vastIn).toBeNull()

    // Bij de volgende wedstrijd van de eerste ploeg staat hij in de lijst, met de waarschuwing.
    const volgende = await wedstrijd(ids.eerste, ids.tegen, '2NAHB', 'scheduled')
    const roster = await buildRoster(payload, volgende, 'home')
    const hij = roster!.players.find((p) => p.id === ids.speler)
    expect(hij?.geleendVan).toContain('Tweede')
    expect(hij?.selectability.reasons.join(' ')).toContain('daarna zit hij vast in 2NAHB')

    await wedstrijd(ids.eerste, ids.tegen, '2NAHB', 'finished', [ids.speler])
    st = (await vastspelenVoorClub(payload, ids.club, SEIZOEN)).get(ids.speler)
    expect(st?.vastIn?.reeks).toBe('2NAHB')

    const lager = await wedstrijd(ids.tweede, ids.tegenLaag, 'RDA', 'scheduled')
    const eigen = await buildRoster(payload, lager, 'home')
    expect(eigen!.players.find((p) => p.id === ids.speler)?.selectability.level).toBe('block')
  })

  it('eindronde: zodra de reeks uitgespeeld is, maakt het systeem ze zelf aan met kalender', async () => {
    // Nog geplande wedstrijden in 2NAHB → niet klaar. Die van zonet weghalen.
    await payload.delete({ collection: 'matches', where: { and: [{ reeks: { in: ['2NAHB', 'RDA'] } }, { status: { equals: 'scheduled' } }] }, overrideAccess: true })
    const r = (await (
      await post({ actie: 'regel', naam: 'Test eindronde', soort: 'eindronde', bronReeksen: ['2NAHB'], topPerReeks: 2, eindrondeNaam: `Eindronde test ${STAMP}`, heenEnTerug: true, reglement: ids.reglement })
    ).json()) as { id: number }
    ids.regel = r.id
    const regel = await payload.findByID({ collection: 'competitieregels', id: r.id, overrideAccess: true })
    const st = await eindrondeStatus(payload, regel as never, SEIZOEN)
    expect(st.klaar).toBe(true)
    expect(st.doorgaan).toHaveLength(2)

    expect(await controleerEindrondes(payload)).toBeGreaterThanOrEqual(1)
    const er = (await payload.find({ collection: 'eindrondes', where: { regel: { equals: r.id } }, overrideAccess: true })).docs[0]
    expect(er.naam).toBe(`Eindronde test ${STAMP}`)
    const wedstrijden = await payload.find({ collection: 'matches', where: { eindronde: { equals: er.id } }, overrideAccess: true })
    // 2 ploegen, heen en terug = 2 wedstrijden, reeks EINDR.
    expect(wedstrijden.docs).toHaveLength(2)
    expect(wedstrijden.docs.every((m) => m.reeks === 'EINDR')).toBe(true)
    // Nog eens controleren maakt niets dubbel.
    await controleerEindrondes(payload)
    expect((await payload.count({ collection: 'eindrondes', where: { regel: { equals: r.id } }, overrideAccess: true })).totalDocs).toBe(1)
  })

  it('een verslag waar een regel op steunt, verwijder je niet zomaar', async () => {
    expect((await post({ actie: 'verslagVerwijderen', id: ids.verslag })).status).toBe(409)
  })
})
