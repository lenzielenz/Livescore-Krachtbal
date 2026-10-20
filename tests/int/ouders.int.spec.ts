// @vitest-environment node

import { PDFDocument } from 'pdf-lib'
import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { kaartAanvragen, keuringInvoeren } from '@/lib/medische-kaart'
import { lidOpslaan } from '@/lib/registratie-server'

// Een jeugdspeler hangt bij de ouder: de ouder ziet het dossier, vraagt de medische kaart aan en voert
// de keuring in; de club hoort het. Een ander account kan dat niet.

let payload: Payload
const STAMP = Date.now()
const ids = { club: 0, ploeg: 0, kind: 0, beheerder: 0, ouder: 0 }
const ouderMail = `ouder-${STAMP}@test.be`

const meldingenVan = async (user: number) =>
  (await payload.find({ collection: 'meldingen', where: { user: { equals: user } }, sort: '-createdAt', limit: 10, overrideAccess: true })).docs
const gebruiker = (id: number) => payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
const kinderen = (u: { kinderen?: unknown }) =>
  (Array.isArray(u.kinderen) ? u.kinderen : []).map((k) => Number(k && typeof k === 'object' ? (k as { id: unknown }).id : k))

async function pdf(): Promise<File> {
  const d = await PDFDocument.create()
  d.addPage()
  return new File([Buffer.from(await d.save())], 'kaart.pdf', { type: 'application/pdf' })
}

describe('ouders van jeugdspelers', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // In een lege databank wordt de eerste gebruiker admin; zo is de beheerder hieronder gewone clubstaf.
    await payload.create({ collection: 'users', data: { email: `eerste-${STAMP}@test.be`, password: 'ouder-test-123' }, overrideAccess: true })
    ids.club = Number((await payload.create({ collection: 'clubs', data: { name: `Ouders ${STAMP}` }, overrideAccess: true })).id)
    ids.ploeg = Number(
      (await payload.create({ collection: 'teams', data: { name: `Ouders U12 ${STAMP}`, club: ids.club, category: 'U12' }, overrideAccess: true })).id,
    )
    ids.beheerder = Number(
      (
        await payload.create({
          collection: 'users',
          data: { email: `ob-${STAMP}@test.be`, password: 'ouder-test-123', roles: ['club-beheerder'], club: ids.club },
          overrideAccess: true,
        })
      ).id,
    )
  }, 90_000)

  it('de club vult het adres van de ouder in → de ouder krijgt een login met het kind', async () => {
    const r = await lidOpslaan(payload, ids.club, {
      teamId: ids.ploeg,
      voornaam: 'Mila',
      achternaam: `Ouders${STAMP}`,
      birthDate: '2017-03-01',
      geslacht: 'v',
      soortLid: 'speler',
      ouderEmail: ouderMail.toUpperCase(),
    })
    expect(r.ok).toBe(true)
    ids.kind = (r as { id: number }).id
    const res = await payload.find({ collection: 'users', where: { email: { equals: ouderMail } }, overrideAccess: true, depth: 0 })
    expect(res.docs).toHaveLength(1)
    ids.ouder = Number(res.docs[0].id)
    expect(kinderen(res.docs[0])).toEqual([ids.kind])
    expect(res.docs[0].roles).toEqual(['viewer'])
    // Een ongeldig adres gaat niet.
    expect(
      await lidOpslaan(payload, ids.club, { playerId: ids.kind, teamId: ids.ploeg, voornaam: 'Mila', achternaam: `Ouders${STAMP}`, birthDate: '2017-03-01', geslacht: 'v', soortLid: 'speler', ouderEmail: 'nee' }),
    ).toMatchObject({ ok: false, status: 400 })
  })

  it('de ouder vraagt de medische kaart aan → de club hoort het', async () => {
    const r = await kaartAanvragen(payload, await gebruiker(ids.ouder), ids.kind)
    expect(r.ok).toBe(true)
    const a = await payload.findByID({ collection: 'medische-kaart-aanvragen', id: (r as { id: number }).id, overrideAccess: true })
    expect(a.via).toBe('ouder')
    expect((await meldingenVan(ids.beheerder))[0].titel).toContain('Een ouder vroeg de medische kaart')
  })

  it('de ouder voert de keuring in: datum + attest; de club hoort het', async () => {
    const ouder = await gebruiker(ids.ouder)
    expect(await keuringInvoeren(payload, ouder, ids.kind, { datum: '2026-09-15', bestand: null })).toMatchObject({ ok: false, status: 400 })
    expect((await keuringInvoeren(payload, ouder, ids.kind, { datum: '2026-09-15', bestand: await pdf() })).ok).toBe(true)
    const p = await payload.findByID({ collection: 'players', id: ids.kind, depth: 0, overrideAccess: true })
    expect(String(p.medischeKeuringOp).slice(0, 10)).toBe('2026-09-15')
    expect(p.medischAttestBestand).toBeTruthy()
    expect((await meldingenVan(ids.beheerder))[0].titel).toContain('Nieuwe keuring')
    // De ouder mag het attest van zijn kind lezen, een vreemde niet.
    const attest = await payload.find({ collection: 'medische-attesten', where: { player: { equals: ids.kind } }, user: ouder, overrideAccess: false })
    expect(attest.docs).toHaveLength(1)
  })

  it('een ander account kan niets voor dit kind', async () => {
    const vreemd = await payload.create({ collection: 'users', data: { email: `vreemd-${STAMP}@test.be`, password: 'ouder-test-123', roles: ['viewer'] }, overrideAccess: true })
    expect((await kaartAanvragen(payload, vreemd, ids.kind)).ok).toBe(false)
    expect(await keuringInvoeren(payload, vreemd, ids.kind, { datum: '2026-09-15', bestand: await pdf() })).toMatchObject({ ok: false, status: 403 })
    await expect(
      payload.find({ collection: 'medische-attesten', where: { player: { equals: ids.kind } }, user: vreemd, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('verandert de club het adres, dan verliest de vorige ouder het dossier', async () => {
    const nieuw = `ouder2-${STAMP}@test.be`
    const r = await lidOpslaan(payload, ids.club, {
      playerId: ids.kind,
      teamId: ids.ploeg,
      voornaam: 'Mila',
      achternaam: `Ouders${STAMP}`,
      birthDate: '2017-03-01',
      geslacht: 'v',
      soortLid: 'speler',
      ouderEmail: nieuw,
    })
    expect(r.ok).toBe(true)
    expect(kinderen(await gebruiker(ids.ouder))).toEqual([])
    const tweede = (await payload.find({ collection: 'users', where: { email: { equals: nieuw } }, overrideAccess: true, depth: 0 })).docs[0]
    expect(kinderen(tweede)).toEqual([ids.kind])
  })
})
