// @vitest-environment node

import { PDFDocument } from 'pdf-lib'
import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { ledenIndienen, lidOpslaan, registratiesBeoordelen } from '@/lib/registratie-server'

// De volledige weg van een nieuwe speler, door de echte database: de club voert in, laadt een attest
// op en dient in; de federatie keurt goed of af. Plus de grenzen: geen ploeg van een andere club,
// niet bewerken terwijl de federatie beslist, en de identiteit van een goedgekeurd lid ligt vast.

let payload: Payload
const STAMP = Date.now()
const ids = { clubA: 0, clubB: 0, ploegA: 0, ploegB: 0, fed: 0 }
const vandaag = new Date().toISOString().slice(0, 10)

const gegevens = (extra: Record<string, unknown> = {}) => ({
  teamId: ids.ploegA,
  voornaam: 'Lotte',
  achternaam: `Registratie${STAMP}`,
  birthDate: '2002-06-15',
  geslacht: 'v',
  soortLid: 'speler',
  medischeKeuringOp: vandaag,
  ...extra,
})

const attestOpladen = async (playerId: number) => {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  const pdf = Buffer.from(await doc.save())
  const a = await payload.create({
    collection: 'medische-attesten',
    data: { player: playerId, club: ids.clubA },
    file: { data: pdf, mimetype: 'application/pdf', name: `attest-${playerId}-${STAMP}.pdf`, size: pdf.length },
    overrideAccess: true,
  })
  await payload.update({ collection: 'players', id: playerId, data: { medischAttestBestand: a.id }, overrideAccess: true })
}

describe('spelersregistratie', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const club = async (n: string) => (await payload.create({ collection: 'clubs', data: { name: n }, overrideAccess: true })).id as number
    ids.clubA = await club(`Registratie A ${STAMP}`)
    ids.clubB = await club(`Registratie B ${STAMP}`)
    const ploeg = async (n: string, c: number) =>
      (await payload.create({ collection: 'teams', data: { name: n, club: c, category: 'senioren', reeks: 'LH' }, overrideAccess: true })).id as number
    ids.ploegA = await ploeg(`Registratie A ${STAMP}`, ids.clubA)
    ids.ploegB = await ploeg(`Registratie B ${STAMP}`, ids.clubB)
    ids.fed = (
      await payload.create({
        collection: 'users',
        data: { email: `fed-${STAMP}@test.be`, password: 'registratie-1234', name: 'Fed', roles: ['federatie'] },
        overrideAccess: true,
      })
    ).id as number
  }, 90_000)

  it('club voert in, dient in, federatie keurt goed → speelgerechtigd', async () => {
    const r = await lidOpslaan(payload, ids.clubA, gegevens())
    expect(r.ok).toBe(true)
    const id = (r as { id: number }).id
    let p = await payload.findByID({ collection: 'players', id, overrideAccess: true })
    expect(p.name).toBe(`Lotte Registratie${STAMP}`)
    expect(p.registratieStatus).toBe('concept')

    // Zonder attest: overgeslagen, met reden.
    const zonder = await ledenIndienen(payload, ids.clubA, [id])
    expect(zonder.ingediend).toEqual([])
    expect(zonder.overgeslagen[0].reden).toContain('doktersattest')

    await attestOpladen(id)
    const met = await ledenIndienen(payload, ids.clubA, [id])
    expect(met.ingediend).toEqual([id])
    p = await payload.findByID({ collection: 'players', id, overrideAccess: true })
    expect(p.registratieStatus).toBe('ingediend')
    expect(p.vergunningsstatus).toBe('aangevraagd')

    // Terwijl de federatie beslist, ligt het lid vast.
    const tussendoor = await lidOpslaan(payload, ids.clubA, { ...gegevens(), playerId: id, voornaam: 'Lotje' })
    expect(tussendoor).toMatchObject({ ok: false, status: 409 })

    const b = await registratiesBeoordelen(payload, ids.fed, [id], { besluit: 'goedkeuren', vergunningsnummers: { [id]: 'VG-123' } })
    expect(b.verwerkt).toEqual([id])
    p = await payload.findByID({ collection: 'players', id, overrideAccess: true })
    expect(p.registratieStatus).toBe('goedgekeurd')
    expect(p.vergunningsstatus).toBe('geldig')
    expect(p.medischAttest).toBe(true)
    expect(p.vergunningsnummer).toBe('VG-123')

    // Tweede klik beslist niet nog eens.
    expect((await registratiesBeoordelen(payload, ids.fed, [id], { besluit: 'afkeuren', reden: 'x' })).overgeslagen).toEqual([id])

    // Na goedkeuring liggen naam en geboortedatum vast; een rugnummer mag wel.
    expect(await lidOpslaan(payload, ids.clubA, { ...gegevens(), playerId: id, birthDate: '2003-01-01' })).toMatchObject({ ok: false, status: 409 })
    expect(await lidOpslaan(payload, ids.clubA, { ...gegevens(), playerId: id, shirtNumber: 44 })).toMatchObject({ ok: true })
  })

  it('afkeuren vraagt een reden en stuurt terug naar de club', async () => {
    const r = await lidOpslaan(payload, ids.clubA, gegevens({ voornaam: 'Tom', geslacht: 'm' }))
    const id = (r as { id: number }).id
    await attestOpladen(id)
    await ledenIndienen(payload, ids.clubA, [id])
    await expect(registratiesBeoordelen(payload, ids.fed, [id], { besluit: 'afkeuren' })).rejects.toThrow()
    await registratiesBeoordelen(payload, ids.fed, [id], { besluit: 'afkeuren', reden: 'Attest onleesbaar' })
    const p = await payload.findByID({ collection: 'players', id, overrideAccess: true })
    expect(p.registratieStatus).toBe('afgekeurd')
    expect(p.afkeurReden).toBe('Attest onleesbaar')
    expect(p.vergunningsstatus).toBe('geen')
    // De club kan aanvullen en opnieuw indienen.
    expect((await ledenIndienen(payload, ids.clubA, [id])).ingediend).toEqual([id])
  })

  it('een club registreert niet in een ploeg of voor een lid van een andere club', async () => {
    expect(await lidOpslaan(payload, ids.clubA, gegevens({ teamId: ids.ploegB }))).toMatchObject({ ok: false, status: 403 })
    const vreemd = await lidOpslaan(payload, ids.clubB, gegevens({ teamId: ids.ploegB, voornaam: 'Vreemd' }))
    const id = (vreemd as { id: number }).id
    expect(await lidOpslaan(payload, ids.clubA, { ...gegevens(), playerId: id })).toMatchObject({ ok: false, status: 404 })
    expect((await ledenIndienen(payload, ids.clubA, [id])).overgeslagen[0].reden).toBe('niet van jouw club')
  })

  it('een gewoon lid dient in zonder attest en wordt nooit speelgerechtigd', async () => {
    const r = await lidOpslaan(payload, ids.clubA, gegevens({ voornaam: 'Supporter', soortLid: 'lid', medischeKeuringOp: null }))
    const id = (r as { id: number }).id
    expect((await ledenIndienen(payload, ids.clubA, [id])).ingediend).toEqual([id])
    await registratiesBeoordelen(payload, ids.fed, [id], { besluit: 'goedkeuren' })
    const p = await payload.findByID({ collection: 'players', id, overrideAccess: true })
    expect(p.registratieStatus).toBe('goedgekeurd')
    expect(p.vergunningsstatus).toBe('geen')
  })

  it('attesten ziet enkel de eigen club en de federatie', async () => {
    const lijst = (user: Record<string, unknown>) =>
      payload.find({ collection: 'medische-attesten', where: { club: { equals: ids.clubA } }, user, overrideAccess: false })
    const eigen = await lijst({ id: 1, roles: ['club-beheerder'], club: ids.clubA, collection: 'users' })
    const ander = await lijst({ id: 2, roles: ['club-beheerder'], club: ids.clubB, collection: 'users' })
    expect(eigen.docs.length).toBeGreaterThan(0)
    expect(ander.docs.length).toBe(0)
    await expect(lijst({ id: 3, roles: ['viewer'], collection: 'users' })).rejects.toThrow()
  })
})
