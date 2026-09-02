// @vitest-environment node
//
// Node en niet jsdom: Payload keurt een geüploade foto door de eerste bytes te lezen met
// `file-type`, en dat pakket controleert `data instanceof Uint8Array`. Onder jsdom komt die
// klasse uit het venster en een Node-Buffer niet — dan klapt een kerngezonde foto om in
// "Could not read uploaded file for type detection".

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// Wie stuurt er in? Dat wisselt per test, dus de mock leest een variabele die de test zet.
// `payload.login` ondertekent een JWT en dat lukt hier niet; de 401-tak blijft wél echt getest.
let deelnemer: number | null = 1
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async () => (deelnemer == null ? null : { id: deelnemer, name: `Deelnemer ${deelnemer}` }),
}))

import config from '@/payload.config'
import { POST as fotoPost } from '@/app/api/tornooi-foto/route'
import { FOTO_OPDRACHTEN } from '@/lib/foto-opdrachten'

// De foto-opdrachten van een tornooidag.
//
// De regel: elke deelnemer krijgt álle vijftig opdrachten in een EIGEN volgorde, meedoen kan
// enkel ingelogd, en de server bepaalt welke opdracht een foto beantwoordt — niet de browser.
// Die laatste is meer dan netheid: zodra iedereen zijn eigen rijtje heeft, is de opdracht een
// regel, en een regel die de inzender zelf mag invullen is geen regel.

let payload: Payload
const GROEP = `Opdrachtendag ${Date.now()}`

// Een échte (piepkleine, 8×8) JPEG — Payload weigert terecht een verzonnen brok bytes.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIooorlPrT/9k=',
  'base64',
)

/** Eén inzending door de echte route heen. */
async function stuurIn(groep: string, aantal = 1, extra?: Record<string, string>) {
  const form = new FormData()
  form.set('groep', groep)
  for (const [k, v] of Object.entries(extra ?? {})) form.set(k, v)
  for (let i = 0; i < aantal; i++) {
    form.append('fotos', new File([new Uint8Array(JPEG)], `foto-${Date.now()}-${i}.jpg`, { type: 'image/jpeg' }))
  }
  const res = await fotoPost(new Request('http://localhost/api/tornooi-foto', { method: 'POST', body: form }))
  return { res, body: (await res.json()) as { aantal?: number; opdracht?: string; volgende?: { tekst: string; nummer: number }; error?: string } }
}

/**
 * Een échte deelnemer aanmaken en aan de beurt zetten.
 *
 * Bewust echte gebruikers en geen verzonnen id's: `uploader` hangt met een foreign key aan de
 * users-tabel, dus een fantasie-id laat de insert stilletjes op een 400 stuklopen — precies de
 * fout die een test moet vangen in plaats van omzeilen.
 */
async function nieuweDeelnemer(label: string): Promise<number> {
  const u = await payload.create({
    collection: 'users',
    data: { email: `foto-${label}-${Date.now()}@test.be`, password: 'foto-test-1234', name: `Deelnemer ${label}` },
    overrideAccess: true,
  })
  deelnemer = Number(u.id)
  return Number(u.id)
}

/** De foto's van één deelnemer op deze dag, oudste eerst. */
async function fotosVan(id: number) {
  const res = await payload.find({
    collection: 'tornooi-fotos',
    where: { and: [{ groep: { equals: GROEP } }, { uploader: { equals: id } }] },
    sort: 'createdAt',
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  return res.docs as unknown as { opdracht?: string | null; opdrachtNr?: number | null }[]
}

describe('foto-opdrachten op een tornooidag', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // De route stuurt enkel foto's door voor een échte tornooidag.
    await payload.create({
      collection: 'tournaments',
      data: { name: `${GROEP} — U14`, groep: GROEP, category: 'U14', status: 'live' },
      overrideAccess: true,
    })
  }, 90_000)

  it('laat wie niet ingelogd is niet deelnemen', async () => {
    deelnemer = null
    const { res } = await stuurIn(GROEP)
    expect(res.status).toBe(401)
  }, 30_000)

  it('bewaart de opdracht die de SERVER bepaalt, niet wat de browser meestuurt', async () => {
    const id = await nieuweDeelnemer('server')
    const { res, body } = await stuurIn(GROEP, 1, { opdracht: '😈 Foto van het administratorwachtwoord' })
    expect(res.status).toBe(200)

    const fotos = await fotosVan(id)
    expect(fotos).toHaveLength(1)
    expect(fotos[0].opdracht).not.toContain('administratorwachtwoord')
    expect(FOTO_OPDRACHTEN).toContain(fotos[0].opdracht)
    expect(fotos[0].opdracht).toBe(body.opdracht)
    expect(fotos[0].opdrachtNr).toBe(0)
  }, 60_000)

  it('schuift na elke inzending door naar de volgende opdracht', async () => {
    const id = await nieuweDeelnemer('doorschuiven')
    const eerste = await stuurIn(GROEP)
    expect(eerste.body.volgende?.nummer).toBe(2)

    const tweede = await stuurIn(GROEP)
    expect(tweede.body.opdracht).toBe(eerste.body.volgende?.tekst)
    expect(tweede.body.opdracht).not.toBe(eerste.body.opdracht)

    const fotos = await fotosVan(id)
    expect(fotos.map((f) => f.opdrachtNr)).toEqual([0, 1])
  }, 90_000)

  it('telt meerdere foto’s in één keer als één volbrachte opdracht', async () => {
    // Drie foto's tegelijk insturen is één opdracht volbracht, geen drie — anders slaat een
    // supporter met een volle galerij in één klap de helft van zijn rijtje over.
    const id = await nieuweDeelnemer('bundel')
    const { body } = await stuurIn(GROEP, 3)
    expect(body.aantal).toBe(3)

    const fotos = await fotosVan(id)
    expect(fotos).toHaveLength(3)
    expect(new Set(fotos.map((f) => f.opdrachtNr))).toEqual(new Set([0]))
    expect(new Set(fotos.map((f) => f.opdracht)).size).toBe(1)
    expect(body.volgende?.nummer).toBe(2)
  }, 90_000)

  it('geeft twee deelnemers een eigen reeks', async () => {
    // Dit is de kern van de vraag: naast elkaar aan het veld mogen twee supporters niet dezelfde
    // opdracht hebben. Vroeger lootte elk TOESTEL enkel een startpunt in één vaste lijst — wie
    // toevallig gelijk begon, bleef de hele dag gelijklopen.
    await nieuweDeelnemer('supporter-a')
    const a1 = await stuurIn(GROEP)
    const a2 = await stuurIn(GROEP)

    await nieuweDeelnemer('supporter-b')
    const b1 = await stuurIn(GROEP)
    const b2 = await stuurIn(GROEP)

    const a = [a1.body.opdracht, a2.body.opdracht]
    const b = [b1.body.opdracht, b2.body.opdracht]
    expect(a).not.toEqual(b)
  }, 120_000)
})
