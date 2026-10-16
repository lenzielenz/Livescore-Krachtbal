import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { NotitieDoc } from '@/lib/analyse-notities'

// De analyse uit de krachtbal-analyse-app op de site.
//
// Aanleiding: "het is echt de bedoeling zoals bij Veo dat de eindanalyse net hetzelfde op de site
// komt … zodat je de wedstrijd op de gsm altijd bij je hebt. Zorg ook dat je notities kan
// toevoegen en delen met anderen als je wenst."

let map: string
beforeAll(async () => {
  map = await fs.mkdtemp(path.join(os.tmpdir(), 'app-analyse-'))
  process.env.MEDIA_DIR = map
  process.env.PAYLOAD_SECRET = 'test-geheim'
  process.env.CV_BRIDGE_TOKEN = 'brug'
})
afterAll(async () => {
  await fs.rm(map, { recursive: true, force: true })
})

vi.mock('@/lib/payload-client', () => ({
  getPayloadClient: async () => (globalThis as { __nepPayload?: unknown }).__nepPayload,
}))

const lib = await import('@/lib/app-analyse')
const notities = await import('@/lib/analyse-notities')

describe('bestanden in een pakket', () => {
  it('laat enkel platte, gekende bestandsnamen toe', () => {
    for (const ok of ['wedstrijd_data.json', 'video.mp4', 'volgcamera_ploeg_1.mp4', 'samenvatting.pdf', 'coachtekst.txt']) {
      expect(lib.geldigBestand(ok)).toBe(true)
    }
    for (const fout of ['../x.json', 'a/b.json', 'X.JSON', 'script.js', '.verborgen.json', 'a..json', '']) {
      expect(lib.geldigBestand(fout)).toBe(false)
    }
  })

  it('geeft video als mp4 en html als html', () => {
    expect(lib.inhoudSoort('video.mp4')).toBe('video/mp4')
    expect(lib.inhoudSoort('wedstrijdcentrum.html')).toMatch(/^text\/html/)
  })

  it('leest een range zoals een videospeler hem vraagt', () => {
    expect(lib.leesRange('bytes=0-99', 1000)).toEqual({ start: 0, einde: 99 })
    expect(lib.leesRange('bytes=900-', 1000)).toEqual({ start: 900, einde: 999 })
    expect(lib.leesRange('bytes=-100', 1000)).toEqual({ start: 900, einde: 999 })
    expect(lib.leesRange('bytes=1000-', 1000)).toBe('buiten')
    expect(lib.leesRange(null, 1000)).toBeNull()
  })
})

describe('ondertekende links', () => {
  it('geldt enkel voor dit bestand van deze wedstrijd, en niet na de vervaltijd', () => {
    const nu = Date.now()
    const u = new URL(lib.ondertekendeUrl(5, 'video.mp4', 60, nu), 'https://x')
    const tot = u.searchParams.get('tot')
    const sig = u.searchParams.get('sig')
    expect(lib.handtekeningGeldig(5, 'video.mp4', tot, sig, nu)).toBe(true)
    expect(lib.handtekeningGeldig(6, 'video.mp4', tot, sig, nu)).toBe(false)
    expect(lib.handtekeningGeldig(5, 'wereldmodel.json', tot, sig, nu)).toBe(false)
    expect(lib.handtekeningGeldig(5, 'video.mp4', tot, sig, nu + 61_000)).toBe(false)
    expect(lib.handtekeningGeldig(5, 'video.mp4', tot, 'a'.repeat(32), nu)).toBe(false)
  })
})

describe('deellink', () => {
  it('maakt één link per wedstrijd, en intrekken maakt de oude waardeloos', async () => {
    const t1 = await lib.maakDeelToken(7)
    expect(await lib.maakDeelToken(7)).toBe(t1)
    expect(await lib.wedstrijdVanDeelToken(t1)).toBe(7)
    await lib.trekDeelTokenIn(7)
    expect(await lib.wedstrijdVanDeelToken(t1)).toBeNull()
    const t2 = await lib.maakDeelToken(7)
    expect(t2).not.toBe(t1)
    expect(await lib.wedstrijdVanDeelToken('../../etc')).toBeNull()
  })
})

describe('notities', () => {
  const n = (over: Partial<NotitieDoc>): NotitieDoc => ({
    id: 1,
    auteur: 7,
    tekst: 'x',
    zichtbaarheid: 'prive',
    ...over,
  })

  it('privé ziet enkel de schrijver, gedeeld ziet iedereen die de analyse ziet', () => {
    expect(notities.zichtbaarVoor(n({}), 7)).toBe(true)
    expect(notities.zichtbaarVoor(n({}), 8)).toBe(false)
    expect(notities.zichtbaarVoor(n({}), null)).toBe(false)
    expect(notities.zichtbaarVoor(n({ zichtbaarheid: 'gedeeld' }), null)).toBe(true)
  })

  it('aanpassen enkel de schrijver; verwijderen ook de beheerder bij een gedeelde notitie', () => {
    expect(notities.magAanpassen(n({}), 7)).toBe(true)
    expect(notities.magAanpassen(n({}), 8)).toBe(false)
    expect(notities.magVerwijderen(n({}), 8, true)).toBe(false)
    expect(notities.magVerwijderen(n({ zichtbaarheid: 'gedeeld' }), 8, true)).toBe(true)
  })

  it('kijkt de invoer na', () => {
    expect(notities.valideerNotitie({ tekst: '  ' })).toEqual({ ok: false, fout: 'Een notitie mag niet leeg zijn.' })
    expect(notities.valideerNotitie({ tekst: 'a'.repeat(2001) }).ok).toBe(false)
    expect(notities.valideerNotitie({ tekst: 'Goed', tijdS: 12.345, zichtbaarheid: 'gedeeld' })).toEqual({
      ok: true,
      waarde: { tekst: 'Goed', tijdS: 12.3, zichtbaarheid: 'gedeeld', tekening: null },
    })
    expect(notities.valideerNotitie({ tekst: 'x', zichtbaarheid: 'publiek' }).ok).toBe(false)
    expect(notities.valideerNotitie({ zichtbaarheid: 'gedeeld' }, true)).toEqual({ ok: true, waarde: { zichtbaarheid: 'gedeeld' } })
  })

  it('bewaart pijlen op het veld en weigert onzin', () => {
    const pijl = { van: { x: 10.123, y: 5 }, naar: { x: 20, y: 7 }, kleur: '#facc15' }
    expect(notities.valideerNotitie({ tekst: 'Zo', tekening: { pijlen: [pijl] } })).toEqual({
      ok: true,
      waarde: { tekst: 'Zo', tijdS: null, zichtbaarheid: 'prive', tekening: { pijlen: [{ ...pijl, van: { x: 10.12, y: 5 } }] } },
    })
    expect(notities.valideerTekening({ pijlen: [{ ...pijl, kleur: 'red' }] }).ok).toBe(false)
    expect(notities.valideerTekening({ pijlen: [{ ...pijl, naar: { x: 500, y: 0 } }] }).ok).toBe(false)
    expect(notities.valideerTekening({ pijlen: Array(41).fill(pijl) }).ok).toBe(false)
    expect(notities.valideerTekening({ pijlen: [] })).toEqual({ ok: true, waarde: null })
  })

  it('zet notities met een moment chronologisch vooraan', () => {
    const lijst = notities.sorteer([
      { tijdS: null, gemaakt: '2026-10-01' },
      { tijdS: 30, gemaakt: null },
      { tijdS: 5, gemaakt: null },
      { tijdS: null, gemaakt: '2026-10-02' },
    ])
    expect(lijst.map((x) => x.tijdS ?? x.gemaakt)).toEqual([5, 30, '2026-10-02', '2026-10-01'])
  })
})

describe('uploaden en serveren', () => {
  const MATCHES: Record<number, Record<string, unknown>> = {
    1: { id: 1, analyseOnly: true, analyseOwner: 7 },
    2: { id: 2, analyseOnly: false },
  }
  let gebruiker: Record<string, unknown> | null = null
  const nep = {
    auth: async () => ({ user: gebruiker }),
    findByID: async ({ id }: { id: number }) => {
      if (MATCHES[id]) return MATCHES[id]
      throw new Error('niet gevonden')
    },
  }
  ;(globalThis as { __nepPayload?: unknown }).__nepPayload = nep

  const params = (id: number, bestand?: string) => ({ params: Promise.resolve({ id: String(id), bestand: bestand ?? '' }) })
  const brug = { authorization: 'Bearer brug' }

  it('zet een pakket op een analysewedstrijd, nooit op de kalender', async () => {
    const { PUT } = await import('@/app/api/cv/match/[id]/app-analyse/route')
    const put = (id: number, naam: string, inhoud: string, kop: Record<string, string> = brug) =>
      PUT(new Request(`https://x/api?bestand=${naam}`, { method: 'PUT', headers: kop, body: inhoud }), params(id))
    expect((await put(1, 'wedstrijdcentrum.html', '<html><head></head><body>hoi</body></html>')).status).toBe(200)
    expect((await put(1, 'video.mp4', '0123456789')).status).toBe(200)
    expect((await put(1, 'manifest.json', JSON.stringify({ wedstrijd: 'x', gemaakt: '', bestanden: [{ naam: 'video.mp4', bytes: 10 }, { naam: 'wedstrijdcentrum.html', bytes: 40 }] }))).status).toBe(200)
    expect((await put(2, 'video.mp4', 'x')).status).toBe(400)
    expect((await put(1, '../video.mp4', 'x')).status).toBe(400)
    expect((await put(1, 'video.mp4', 'x', {})).status).toBe(401)
    expect((await lib.leesManifest(1))?.bestanden.map((b) => b.naam)).toEqual(['video.mp4', 'wedstrijdcentrum.html'])
  })

  it('serveert enkel aan wie de analyse mag zien of een geldige link heeft', async () => {
    const { GET } = await import('@/app/api/analyse/app/[id]/[bestand]/route')
    gebruiker = null
    expect((await GET(new Request('https://x/a'), params(1, 'video.mp4'))).status).toBe(403)
    gebruiker = { id: 8, roles: [] }
    expect((await GET(new Request('https://x/a'), params(1, 'video.mp4'))).status).toBe(403)
    gebruiker = { id: 7, roles: [] }
    const r = await GET(new Request('https://x/a', { headers: { range: 'bytes=2-5' } }), params(1, 'video.mp4'))
    expect(r.status).toBe(206)
    expect(await r.text()).toBe('2345')
    gebruiker = null
    const getekend = lib.ondertekendeUrl(1, 'wedstrijdcentrum.html')
    const html = await GET(new Request(`https://x${getekend}`), params(1, 'wedstrijdcentrum.html'))
    expect(html.status).toBe(200)
    expect(html.headers.get('content-security-policy')).toContain('sandbox allow-scripts')
    const tekst = await html.text()
    expect(tekst).toContain('window.KB_SITE=')
    expect(tekst).toContain('"alleenLezen":true')
    expect(tekst).toMatch(/"video":"\/api\/analyse\/app\/1\/video\.mp4\?tot=\d+&sig=[a-f0-9]{32}"/)
  })
})
