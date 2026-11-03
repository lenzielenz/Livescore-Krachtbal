// @vitest-environment node
import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api/app/[id]/route'
import { alleApps, bestandsPad, grootteTekst, leesBereik, leesManifest, veiligBestand } from '@/lib/app-downloads'

const vraag = (id: string, koppen: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/app/${id}`, { headers: koppen }), { params: Promise.resolve({ id }) })

describe('app-downloads: het manifest klopt met de bestanden', () => {
  it('elke app uit het manifest heeft een echt APK-bestand met de juiste naam', async () => {
    const manifest = await leesManifest()
    expect(manifest.length).toBeGreaterThanOrEqual(1)
    expect(new Set(manifest.map((a) => a.id)).size).toBe(manifest.length) // geen dubbele sleutels

    const apps = await alleApps()
    // Een vermelde app waarvan het bestand ontbreekt, valt stil weg uit de lijst: dat mag hier niet gebeuren.
    expect(apps.map((a) => a.id).sort()).toEqual(manifest.map((a) => a.id).sort())

    for (const app of apps) {
      expect(app.bestand, app.id).toContain(app.versie) // de bestandsnaam draagt het versienummer
      expect(app.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(app.grootte).toBeGreaterThan(100 * 1024) // geen leeg of afgekapt bestand
      expect(app.grootte).toBeLessThan(60 * 1024 * 1024)
      expect(app.versieCode).toBeGreaterThan(0)
      expect(app.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // Een APK is een zip-bestand: begint met "PK".
      const pad = bestandsPad(app.bestand)!
      expect((await readFile(pad)).subarray(0, 2).toString('latin1'), app.id).toBe('PK')
    }
  })
})

describe('app-downloads: enkel veilige bestandsnamen', () => {
  it('weigert paden, ontsnappen uit de map en andere bestandstypes', () => {
    expect(veiligBestand('Krachtbal-Federatie-0.2.0.apk')).toBe(true)
    expect(veiligBestand('../manifest.json')).toBe(false)
    expect(veiligBestand('../../etc/passwd.apk')).toBe(false)
    expect(veiligBestand('sub/map.apk')).toBe(false)
    expect(veiligBestand('..\\x.apk')).toBe(false)
    expect(veiligBestand('app.exe')).toBe(false)
    expect(veiligBestand('.verborgen.apk')).toBe(false)
    expect(bestandsPad('../manifest.json')).toBeNull()
    expect(bestandsPad('Krachtbal-Federatie-0.2.0.apk')).toContain('app-downloads')
  })
})

describe('app-downloads: Range (hervatbaar downloaden)', () => {
  it('leest één bereik', () => {
    expect(leesBereik('bytes=0-99', 1000)).toEqual({ start: 0, eind: 99 })
    expect(leesBereik('bytes=900-', 1000)).toEqual({ start: 900, eind: 999 })
    expect(leesBereik('bytes=-100', 1000)).toEqual({ start: 900, eind: 999 })
    expect(leesBereik('bytes=500-5000', 1000)).toEqual({ start: 500, eind: 999 }) // eind wordt afgekapt
  })
  it('weigert wat buiten het bestand valt en negeert wat we niet snappen', () => {
    expect(leesBereik('bytes=1000-1100', 1000)).toBe('ongeldig')
    expect(leesBereik('bytes=500-100', 1000)).toBe('ongeldig')
    expect(leesBereik('bytes=-0', 1000)).toBe('ongeldig')
    expect(leesBereik(null, 1000)).toBeNull()
    expect(leesBereik('bytes=0-10,20-30', 1000)).toBeNull() // meerdere bereiken: gewoon alles sturen
    expect(leesBereik('items=0-10', 1000)).toBeNull()
  })
  it('schrijft groottes met een komma', () => {
    expect(grootteTekst(2_302_986)).toBe('2,2 MB')
    expect(grootteTekst(500 * 1024)).toBe('500 KB')
  })
})

describe('GET /api/app/<id>', () => {
  it('levert het hele bestand als APK, met naam, grootte en controlegetal', async () => {
    const app = (await alleApps())[0]
    const res = await vraag(app.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/vnd.android.package-archive')
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${app.bestand}"`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe(String(app.grootte))
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.length).toBe(app.grootte)
    expect(body.equals(await readFile(bestandsPad(app.bestand)!))).toBe(true)
  })

  it('geeft een deel terug bij Range, zodat een onderbroken download verder kan', async () => {
    const app = (await alleApps())[0]
    const res = await vraag(app.id, { range: 'bytes=0-99' })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(`bytes 0-99/${app.grootte}`)
    expect((await res.arrayBuffer()).byteLength).toBe(100)
    const rest = await vraag(app.id, { range: `bytes=${app.grootte - 10}-` })
    expect(rest.status).toBe(206)
    expect((await rest.arrayBuffer()).byteLength).toBe(10)
  })

  it('weigert een bereik buiten het bestand (416) en stuurt niets opnieuw bij dezelfde ETag (304)', async () => {
    const app = (await alleApps())[0]
    const buiten = await vraag(app.id, { range: `bytes=${app.grootte + 10}-` })
    expect(buiten.status).toBe(416)
    expect(buiten.headers.get('content-range')).toBe(`bytes */${app.grootte}`)
    const etag = (await vraag(app.id)).headers.get('etag')!
    const nietGewijzigd = await vraag(app.id, { 'if-none-match': etag })
    expect(nietGewijzigd.status).toBe(304)
    expect((await nietGewijzigd.arrayBuffer()).byteLength).toBe(0)
  })

  it('geeft 404 voor een onbekende app en voor een poging om uit de map te ontsnappen', async () => {
    expect((await vraag('bestaat-niet')).status).toBe(404)
    expect((await vraag('..%2F..%2Fpackage.json')).status).toBe(404)
    expect((await vraag('manifest')).status).toBe(404)
  })
})
