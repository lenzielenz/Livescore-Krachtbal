// @vitest-environment node
//
// Zelfde reden als bij tornooi-fotos: Payload keurt een upload met `file-type`, en dat pakket
// toetst `data instanceof Uint8Array`. Onder jsdom komt die klasse uit het venster en een
// Node-Buffer niet, waardoor een kerngezonde JPEG geweigerd wordt.

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel (zie tornooi-fotos.int.spec.ts): een Authorization-header
// telt hier als federatie, geen header als niet-ingelogd.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) =>
    req.headers.get('authorization') ? { id: 1, roles: ['admin'] } : null,
}))

import config from '@/payload.config'
import { createTournament } from '@/lib/tournament-engine'
import { GET as groepGet } from '@/app/api/tornooi-groep/route'

// Het foto-archief in de groep-API: dat voedt de fotoshow op het kantinescherm ná het tornooi.
//
// De groep-API is publiek — hij draait op elke tornooipagina en op het kantinescherm dat de hele
// dag open staat. Precies daarom is dit de gevaarlijkste plek om een archief aan te hangen: als
// het per ongeluk voor iedereen meekomt, hangen alle ingestuurde supportersfoto's aan een link
// die je alleen maar hoeft te kennen.

let payload: Payload
const GROEP = `Archiefdag ${Date.now()}`

// Een échte (piepkleine, 8×8) JPEG — Payload leest de eerste bytes en weigert een verzonnen brok.
const JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIooorlPrT/9k='

const url = `http://localhost/api/tornooi-groep?naam=${encodeURIComponent(GROEP)}`

describe('foto-archief in de groep-API', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    // Een tornooidag met één reeks, zodat de API de groep terugvindt. Via de engine, net als de
    // app zelf — dan staat er meteen een geldige reeks mét wedstrijden.
    await createTournament(payload, {
      name: `${GROEP} · Reeks A`,
      category: 'U14',
      method: 'manual',
      format: 'roundrobin',
      slots: ['Ploeg A', 'Ploeg B'],
      groep: GROEP,
    })

    const bytes = Buffer.from(JPEG, 'base64')
    await payload.create({
      collection: 'tornooi-fotos',
      data: { groep: GROEP, uploaderName: 'Robin', opdracht: 'Foto met het scorebord' },
      file: { name: `archief-${Date.now()}.jpg`, data: bytes, mimetype: 'image/jpeg', size: bytes.length },
      overrideAccess: true,
    })
  }, 60_000)

  it('geeft het archief niet mee aan een publieke kijker', async () => {
    const res = await groepGet(new Request(url))
    expect(res.status).toBe(200)
    const data = (await res.json()) as { fotoArchief: unknown[] }
    expect(data.fotoArchief).toEqual([])
  }, 30_000)

  it('geeft het archief wél aan de federatie, met inzender en opdracht', async () => {
    const res = await groepGet(new Request(url, { headers: { authorization: 'JWT test' } }))
    expect(res.status).toBe(200)
    const data = (await res.json()) as { fotoArchief: { id: number; wie: string; opdracht: string | null }[] }
    expect(data.fotoArchief).toHaveLength(1)
    // Het kantinescherm toont de inzender onder de foto; zonder die velden is het een blinde stapel.
    expect(data.fotoArchief[0].wie).toBe('Robin')
    expect(data.fotoArchief[0].opdracht).toBe('Foto met het scorebord')
    expect(typeof data.fotoArchief[0].id).toBe('number')
  }, 30_000)
})
