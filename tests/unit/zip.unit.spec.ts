import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { crc32, dosTijd, maakZip, uniekeNamen, veiligeNaam } from '@/lib/zip'

// De zelfgeschreven ZIP-bundel voor de tornoofoto's.
//
// Zelf schrijven mag, maar dan moet het bewezen zijn: een bundel die enkel "er goed uitziet"
// helpt niemand als hij op de computer van de club niet opengaat. Vandaar dat de laatste test
// hem niet zelf naleest maar door `unzip` laat openen — het echte gereedschap, met de echte
// controlesommen.

describe('crc32', () => {
  it('geeft de bekende controlesom van "123456789"', () => {
    // De standaardwaarde uit de CRC-32-specificatie (IEEE 802.3): 0xCBF43926.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('geeft nul voor niets', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('veiligeNaam', () => {
  it('haalt paden uit een naam', () => {
    // Zonder dit schrijft een uitgepakte bundel buiten zijn eigen map ("zip slip") — geen
    // schoonheidsfoutje maar een lek.
    expect(veiligeNaam('../../etc/passwd')).toBe('etc-passwd')
    expect(veiligeNaam('map/onder/foto.jpg')).toBe('map-onder-foto.jpg')
  })

  it('valt terug op een naam wanneer er niets overblijft', () => {
    expect(veiligeNaam('..')).toBe('bestand')
    expect(veiligeNaam('   ')).toBe('bestand')
  })
})

describe('uniekeNamen', () => {
  it('laat twee gelijke namen niet over elkaar heen schrijven', () => {
    expect(uniekeNamen(['foto.jpg', 'foto.jpg', 'foto.jpg']))
      .toEqual(['foto.jpg', 'foto-2.jpg', 'foto-3.jpg'])
  })

  it('kijkt niet naar hoofdletters', () => {
    // Windows en macOS doen dat ook niet; daar zou "Foto.jpg" de eerste alsnog overschrijven.
    expect(uniekeNamen(['Foto.jpg', 'foto.jpg'])).toEqual(['Foto.jpg', 'foto-2.jpg'])
  })
})

describe('dosTijd', () => {
  it('zet een datum om naar het formaat dat ZIP verwacht', () => {
    const d = new Date(2026, 8, 2, 14, 30, 20) // 2 september 2026, 14:30:20
    const { tijd, datum } = dosTijd(d)
    expect(datum).toBe(((2026 - 1980) << 9) | (9 << 5) | 2)
    expect(tijd).toBe((14 << 11) | (30 << 5) | 10) // seconden in stappen van twee
  })

  it('gaat niet vóór 1980, want dat kent het formaat niet', () => {
    expect(dosTijd(new Date(1970, 0, 1)).datum >> 9).toBe(0)
  })
})

describe('maakZip', () => {
  it('begint met de handtekening van een ZIP', () => {
    const zip = maakZip([{ naam: 'a.txt', data: new TextEncoder().encode('hallo') }])
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('maakt een bundel die unzip zelf kan openen', () => {
    // Dít is de test die telt. Alle velden kunnen er plausibel uitzien terwijl de bundel toch
    // stuk is; `unzip -t` rekent de controlesommen na en zegt of hij écht deugt.
    const map = fs.mkdtempSync(path.join(os.tmpdir(), 'zipproef-'))
    const bestand = path.join(map, 'proef.zip')
    const inhoud = {
      'eerste.txt': 'de eerste foto zou hier staan',
      'tweede.txt': 'en de tweede',
    }
    const zip = maakZip(
      Object.entries(inhoud).map(([naam, tekst]) => ({ naam, data: new TextEncoder().encode(tekst) })),
    )
    fs.writeFileSync(bestand, zip)

    let uitpakker = true
    try {
      execFileSync('unzip', ['-t', bestand], { stdio: 'pipe' })
    } catch (e) {
      // Geen unzip op deze machine? Dan zegt deze test niets, en dat hoort ze te melden in
      // plaats van te slagen.
      if ((e as { code?: string }).code === 'ENOENT') uitpakker = false
      else throw e
    }
    expect(uitpakker, 'unzip ontbreekt: deze controle is niet uitgevoerd').toBe(true)

    execFileSync('unzip', ['-o', bestand, '-d', map], { stdio: 'pipe' })
    for (const [naam, tekst] of Object.entries(inhoud)) {
      expect(fs.readFileSync(path.join(map, naam), 'utf8')).toBe(tekst)
    }
    fs.rmSync(map, { recursive: true, force: true })
  })

  it('bundelt een lege lijst zonder te struikelen', () => {
    const zip = maakZip([])
    expect(zip.length).toBe(22) // enkel de staart
  })
})
