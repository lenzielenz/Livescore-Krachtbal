import { describe, it, expect } from 'vitest'

import {
  aantalStukken,
  bestandsSleutel,
  geldigUploadId,
  hervatBytes,
  hervatVanafStuk,
  stukBereik,
  uploadFout,
  uploadTekst,
  wachtNaPoging,
  STUK_BYTES,
} from '@/lib/video-upload'

// Een wedstrijdvideo in stukken uploaden.
//
// Aanleiding: "Uploaden mislukt (verbinding)". Honderden megabytes gingen in één verzoek naar de
// server, dus één verbinding moest minutenlang houden vanaf een telefoon. Viel die weg, dan was
// alles weg — en de melding zei niet eens hoever je stond.
//
// De rekenkern hieronder bepaalt wat er opnieuw moet en wat mag blijven staan. Rekent die
// verkeerd, dan wordt er een stuk overgeslagen of dubbel geplakt, en dat geeft een video die
// nergens meer op slaat — erger dan een mislukte upload, want ze lijkt geslaagd.

const MB = 1024 * 1024

describe('stukken tellen en afbakenen', () => {
  it('verdeelt een bestand in stukken zonder gaten of overlap', () => {
    const grootte = 10 * MB + 123
    const n = aantalStukken(grootte)
    let vorigeTot = 0
    for (let i = 0; i < n; i++) {
      const { van, tot } = stukBereik(i, grootte)
      expect(van).toBe(vorigeTot) // sluit aan op het vorige stuk
      expect(tot).toBeGreaterThan(van)
      vorigeTot = tot
    }
    expect(vorigeTot).toBe(grootte) // en samen precies het hele bestand
  })

  it('maakt van een leeg bestand geen enkel stuk', () => {
    expect(aantalStukken(0)).toBe(0)
    expect(aantalStukken(-5)).toBe(0)
  })

  it('houdt het laatste stuk binnen het bestand', () => {
    const { van, tot } = stukBereik(2, 2 * STUK_BYTES + 10)
    expect(van).toBe(2 * STUK_BYTES)
    expect(tot).toBe(2 * STUK_BYTES + 10)
  })
})

describe('hervatten', () => {
  it('gaat verder bij het eerste stuk dat nog niet volledig aankwam', () => {
    expect(hervatVanafStuk(0)).toBe(0)
    expect(hervatVanafStuk(STUK_BYTES)).toBe(1)
    expect(hervatVanafStuk(2 * STUK_BYTES)).toBe(2)
  })

  it('gooit een half aangekomen stuk weg in plaats van erop verder te plakken', () => {
    // Dít is het gevaarlijke geval. Zou de server op 6 MB verder plakken terwijl de client bij
    // stuk 1 (4 MB) begint, dan mist er 2 MB middenin en is de video stuk — maar wél "geslaagd".
    expect(hervatVanafStuk(STUK_BYTES + 1000)).toBe(1)
    expect(hervatBytes(STUK_BYTES + 1000)).toBe(STUK_BYTES)
  })

  it('begint vooraan bij onzin', () => {
    expect(hervatVanafStuk(Number.NaN)).toBe(0)
    expect(hervatVanafStuk(-1)).toBe(0)
    expect(hervatBytes(0)).toBe(0)
  })
})

describe('geldigUploadId', () => {
  it('aanvaardt enkel hex — het wordt een bestandsnaam op de server', () => {
    expect(geldigUploadId('a1b2c3d4')).toBe(true)
    expect(geldigUploadId('0123456789abcdef0123456789abcdef')).toBe(true)
  })

  it('weigert alles waarmee je uit de map kunt wandelen', () => {
    for (const gemeen of ['../etc/passwd', 'a/b', 'a.b', '', 'ABCDEF12', 'zzzzzzzz', 'a1b2', null, 42]) {
      expect(geldigUploadId(gemeen)).toBe(false)
    }
  })
})

describe('bestandsSleutel', () => {
  const bestand = { name: 'wedstrijd.mp4', size: 123456789, lastModified: 1_700_000_000_000 }

  it('geeft hetzelfde bestand dezelfde sleutel — anders valt er niets te hervatten', async () => {
    expect(await bestandsSleutel(bestand, 42)).toBe(await bestandsSleutel({ ...bestand }, 42))
  })

  it('geeft een ánder bestand een andere sleutel', async () => {
    // Zou een nieuw bestand dezelfde sleutel krijgen, dan wordt het achter de halve vorige
    // geplakt: een onspeelbare video die er geslaagd uitziet.
    const basis = await bestandsSleutel(bestand, 42)
    expect(await bestandsSleutel({ ...bestand, size: 999 }, 42)).not.toBe(basis)
    expect(await bestandsSleutel({ ...bestand, name: 'ander.mp4' }, 42)).not.toBe(basis)
    expect(await bestandsSleutel({ ...bestand, lastModified: 1 }, 42)).not.toBe(basis)
  })

  it('houdt twee wedstrijden uit elkaar', async () => {
    expect(await bestandsSleutel(bestand, 42)).not.toBe(await bestandsSleutel(bestand, 43))
  })

  it('levert iets op dat de server aanvaardt', async () => {
    expect(geldigUploadId(await bestandsSleutel(bestand, 42))).toBe(true)
  })
})

describe('opnieuw proberen', () => {
  it('wacht langer na elke mislukte poging, maar niet eindeloos', () => {
    const wachten = [0, 1, 2, 3, 4, 5, 6].map(wachtNaPoging)
    for (let i = 1; i < wachten.length; i++) expect(wachten[i]).toBeGreaterThanOrEqual(wachten[i - 1])
    expect(Math.max(...wachten)).toBeLessThanOrEqual(8000)
  })
})

describe('wat de gebruiker te lezen krijgt', () => {
  it('zegt hoever de upload staat', () => {
    expect(uploadTekst(50 * MB, 200 * MB)).toBe('25% — 50 van 200 MB')
  })

  it('maakt onderscheid tussen "niet vertrokken" en "onderweg weggevallen"', () => {
    // Dat verschil bepaalt wat je eraan doet. "Uploaden mislukt (verbinding)" zei geen van beide.
    expect(uploadFout(0, 200 * MB)).toMatch(/niet vertrokken/i)
    expect(uploadFout(0, 200 * MB)).toMatch(/nog niets/i)
    const halverwege = uploadFout(150 * MB, 200 * MB)
    expect(halverwege).toMatch(/75%/)
    expect(halverwege).toMatch(/blijft bewaard/i)
  })
})
