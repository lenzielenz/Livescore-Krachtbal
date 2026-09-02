// @vitest-environment node
//
// Bewust in de node-omgeving en niet in jsdom (de standaard hier): Payload keurt een geüpload
// bestand door de eerste bytes te lezen met `file-type`, en dat pakket controleert
// `data instanceof Uint8Array`. Onder jsdom komt die klasse uit het venster en een Node-Buffer
// niet — de controle klapt dan om in "Could not read uploaded file for type detection", terwijl
// het bestand kerngezond is. Deze test heeft geen DOM nodig.

import fs from 'fs/promises'
import path from 'path'

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// De inlog vervangen door een dubbel, om dezelfde reden als bij de video-upload: `payload.login`
// ondertekent een JWT en dat lukt niet in de jsdom-omgeving waarin deze tests draaien. Een
// Authorization-header telt hier als federatie, geen header als niet-ingelogd — zo blijven de
// 401- en 403-takken van de routes wél echt getest.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_payload: unknown, req: Request) =>
    req.headers.get('authorization') ? { id: 1, roles: ['admin'] } : null,
}))

import { uploadDirFor } from '@/collections/Media'
import config from '@/payload.config'
import { GET as fotoGet, DELETE as fotoDelete } from '@/app/api/tornooi-groep/foto/[id]/route'
import { GET as bundelGet } from '@/app/api/tornooi-groep/fotos/route'

// Beheer van de ingezonden tornoofoto's: bekijken, downloaden, bundelen en verwijderen.
//
// Wat hier bewaakt wordt is vooral wie wát mag. De foto's zijn bewust niet publiek: wie ze
// instuurt ziet ze nergens terug, en het kantinescherm mag enkel een vérse foto tonen. De
// federatie beheert het archief. Eén verkeerde tak en het hele archief hangt aan de openbare weg.

let payload: Payload
const GROEP = `Fotodag ${Date.now()}`
let fotoId: number
let bestandsnaam: string

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const req = (url: string, opties: RequestInit = {}) => new Request(url, opties)
const alsFederatie = { headers: { authorization: 'JWT test' } }

describe('tornoofoto’s beheren', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    // Een echte foto op schijf zetten via de collection, zodat de routes met een écht bestand
    // werken in plaats van met een verzonnen pad.
    bestandsnaam = `proef-${Date.now()}.jpg`
    // Een échte (piepkleine, 8×8) JPEG: Payload leest de eerste bytes en weigert een verzonnen
    // brok — terecht, want dat is precies de bewaker tegen een geüpload script met .jpg erachter.
    const bytes = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIooorlPrT/9k=',
      'base64',
    )
    const doc = await payload.create({
      collection: 'tornooi-fotos',
      data: { groep: GROEP, uploaderName: 'Robin', opdracht: 'Foto met het scorebord' },
      file: { name: bestandsnaam, data: bytes, mimetype: 'image/jpeg', size: bytes.length },
      overrideAccess: true,
    })
    fotoId = doc.id as number
  }, 60_000)

  it('laat een vreemde niet aan het archief', async () => {
    // Zonder sessie: de foto is oud genoeg om buiten het kantinevenster te vallen, dus enkel de
    // federatie mag ze nog zien. (Een verse foto mag het kantinescherm wél tonen — dat is de
    // andere tak van dezelfde route.)
    const oud = new Date(Date.now() - 60 * 60000).toISOString()
    await payload.update({ collection: 'tornooi-fotos', id: fotoId, data: { createdAt: oud }, overrideAccess: true })

    const res = await fotoGet(
      req(`http://localhost/api/tornooi-groep/foto/${fotoId}?naam=${encodeURIComponent(GROEP)}`),
      params(fotoId),
    )
    expect(res.status).toBe(404)
  }, 30_000)

  it('geeft de federatie de foto, ook een oude', async () => {
    const res = await fotoGet(
      req(`http://localhost/api/tornooi-groep/foto/${fotoId}?naam=${encodeURIComponent(GROEP)}`, alsFederatie),
      params(fotoId),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/')
    // Zonder ?download=1 blijft het een gewone weergave.
    expect(res.headers.get('content-disposition')).toBeNull()
  }, 30_000)

  it('levert de foto als download met een leesbare naam', async () => {
    const res = await fotoGet(
      req(`http://localhost/api/tornooi-groep/foto/${fotoId}?naam=${encodeURIComponent(GROEP)}&download=1`, alsFederatie),
      params(fotoId),
    )
    expect(res.status).toBe(200)
    const dispositie = res.headers.get('content-disposition') ?? ''
    expect(dispositie).toMatch(/^attachment/)
    // De naam draagt de inzender, zodat een map met losse foto's achteraf te begrijpen valt.
    expect(dispositie).toMatch(/Robin/)
  }, 30_000)

  it('bundelt alle foto’s van de dag in een zip', async () => {
    const res = await bundelGet(
      req(`http://localhost/api/tornooi-groep/fotos?naam=${encodeURIComponent(GROEP)}`, alsFederatie),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    const zip = new Uint8Array(await res.arrayBuffer())
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  }, 30_000)

  it('weigert de bundel aan wie niet ingelogd is', async () => {
    const res = await bundelGet(req(`http://localhost/api/tornooi-groep/fotos?naam=${encodeURIComponent(GROEP)}`))
    expect(res.status).toBe(401)
  }, 30_000)

  it('verwijdert een foto niet vanuit een andere tornooidag', async () => {
    // De dag hoort mee gecontroleerd te worden: zonder dat wist een verkeerd id stilletjes een
    // foto van een ánder tornooi.
    const res = await fotoDelete(
      req(`http://localhost/api/tornooi-groep/foto/${fotoId}?naam=Een%20andere%20dag`, { ...alsFederatie, method: 'DELETE' }),
      params(fotoId),
    )
    expect(res.status).toBe(404)
    const nog = await payload.findByID({ collection: 'tornooi-fotos', id: fotoId, depth: 0, overrideAccess: true })
    expect(nog).toBeTruthy()
  }, 30_000)

  it('verwijdert de foto én haar bestand', async () => {
    const opSchijf = path.join(uploadDirFor('tornooi-fotos'), bestandsnaam)
    expect(await fs.stat(opSchijf).then(() => true, () => false)).toBe(true)

    const res = await fotoDelete(
      req(`http://localhost/api/tornooi-groep/foto/${fotoId}?naam=${encodeURIComponent(GROEP)}`, { ...alsFederatie, method: 'DELETE' }),
      params(fotoId),
    )
    expect(res.status).toBe(200)

    const weg = await payload
      .findByID({ collection: 'tornooi-fotos', id: fotoId, depth: 0, overrideAccess: true })
      .catch(() => null)
    expect(weg).toBeNull()
    // Payload ruimt het bestand mee op; blijft dat achter, dan groeit het volume vol met
    // foto's waar niemand nog naar kan verwijzen.
    expect(await fs.stat(opSchijf).then(() => true, () => false)).toBe(false)
  }, 30_000)
})
