import { mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { _wisGeheugen, archiefUrls, beeldType, clubLogo } from '@/lib/clublogo-cache'
import { isBewaardLogo, logoBron } from '@/lib/logo-bron'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const LOGO = 'https://www.krachtbal.be/images/logo_32.png'

describe('logoBron', () => {
  it('stuurt logo’s van krachtbal.be via onze eigen route', () => {
    expect(logoBron(LOGO)).toBe(`/api/clublogo?u=${encodeURIComponent(LOGO)}`)
    expect(logoBron('http://krachtbal.be/images/logo_7.gif')).toBe(`/api/clublogo?u=${encodeURIComponent('https://krachtbal.be/images/logo_7.gif')}`)
  })

  it('laat eigen uploads en andere sites ongemoeid', () => {
    expect(logoBron('/api/media/file/1447327665.png')).toBe('/api/media/file/1447327665.png')
    expect(logoBron('https://example.com/logo.png')).toBe('https://example.com/logo.png')
    expect(logoBron(null)).toBeNull()
    expect(logoBron('  ')).toBeNull()
  })

  it('is geen open proxy: enkel afbeeldingen in de beeldmappen', () => {
    expect(isBewaardLogo('https://www.krachtbal.be/club.php?club=5')).toBe(false)
    expect(isBewaardLogo('https://www.krachtbal.be/images/../admin.php')).toBe(false)
    expect(isBewaardLogo('https://www.krachtbal.be/images/logo_1.png?x=1')).toBe(false)
    expect(isBewaardLogo('https://www.krachtbal.be:8080/images/logo_1.png')).toBe(false)
    expect(isBewaardLogo('https://evil.krachtbal.be.example.com/images/logo_1.png')).toBe(false)
    expect(isBewaardLogo('file:///etc/passwd')).toBe(false)
    expect(isBewaardLogo('https://www.krachtbal.be/news_images/kidslogos.jpg')).toBe(true)
  })
})

describe('beeldType', () => {
  it('herkent beelden aan hun bytes, niet aan wat de server beweert', () => {
    expect(beeldType(PNG, 'text/html')).toBe('image/png')
    expect(beeldType(Buffer.from('GIF89a....'), null)).toBe('image/gif')
    expect(beeldType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), null)).toBe('image/jpeg')
    expect(beeldType(Buffer.from('<html>404</html>'), 'image/png')).toBeNull()
    expect(beeldType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).toBe('image/svg+xml')
  })
})

describe('clubLogo', () => {
  let map: string
  const oud = process.env.MEDIA_DIR

  beforeAll(() => {
    map = mkdtempSync(path.join(os.tmpdir(), 'clublogo-'))
    process.env.MEDIA_DIR = map
  })
  afterAll(() => {
    rmSync(map, { recursive: true, force: true })
    if (oud === undefined) delete process.env.MEDIA_DIR
    else process.env.MEDIA_DIR = oud
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    _wisGeheugen()
  })

  function nep(antwoorden: Record<string, { status: number; body?: Buffer; type?: string }>) {
    const oproepen: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      oproepen.push(url)
      const a = antwoorden[url] ?? { status: 404 }
      return new Response(a.body ? new Uint8Array(a.body) : 'Not Found', { status: a.status, headers: { 'content-type': a.type ?? 'text/html' } })
    })
    return oproepen
  }

  it('valt terug op het webarchief als de bron weg is, en bewaart een kopie', async () => {
    const url = 'https://www.krachtbal.be/images/logo_36.png'
    const oproepen = nep({ [archiefUrls(url)[0]]: { status: 200, body: PNG, type: 'image/png' } })
    const logo = await clubLogo(url)
    expect(logo?.bron).toBe('archief')
    expect(logo?.type).toBe('image/png')
    expect(oproepen[0]).toBe(url)

    // Tweede keer: uit de kopie, zonder nog iets op te halen.
    const opnieuw = nep({})
    const kopie = await clubLogo(url)
    expect(kopie?.bron).toBe('kopie')
    expect(kopie?.data.equals(PNG)).toBe(true)
    expect(opnieuw).toHaveLength(0)
  })

  it('probeert een oudere momentopname als de recentste al de 404 is', async () => {
    const url = 'https://www.krachtbal.be/images/logo_13.gif'
    const [recent, ouder] = archiefUrls(url)
    nep({ [recent]: { status: 404 }, [ouder]: { status: 200, body: Buffer.from('GIF89a\x01\x00'), type: 'image/gif' } })
    expect((await clubLogo(url))?.type).toBe('image/gif')
  })

  it('gebruikt de bron zelf als die nog werkt', async () => {
    const url = 'https://www.krachtbal.be/images/logo_1.png'
    nep({ [url]: { status: 200, body: PNG, type: 'image/png' } })
    expect((await clubLogo(url))?.bron).toBe('origineel')
  })

  it('onthoudt een mislukking even, zodat bron en archief niet bestookt worden', async () => {
    const url = 'https://www.krachtbal.be/images/logo_99.png'
    const eerst = nep({})
    expect(await clubLogo(url, 1_000)).toBeNull()
    expect(eerst.length).toBe(3)
    const daarna = nep({})
    expect(await clubLogo(url, 2_000)).toBeNull()
    expect(daarna).toHaveLength(0)
    // Na een half uur opnieuw proberen.
    const later = nep({ [url]: { status: 200, body: PNG, type: 'image/png' } })
    expect((await clubLogo(url, 1_000 + 31 * 60_000))?.bron).toBe('origineel')
    expect(later).toHaveLength(1)
  })

  it('weigert adressen buiten de toegestane lijst', async () => {
    const oproepen = nep({})
    expect(await clubLogo('https://example.com/images/logo.png')).toBeNull()
    expect(oproepen).toHaveLength(0)
  })
})
