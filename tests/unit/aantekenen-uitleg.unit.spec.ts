import { describe, it, expect } from 'vitest'

import { AANTEKEN_STAPPEN, UITLEG_PAD, UITLEG_PDF_PAD, naarWinAnsi } from '@/lib/aantekenen-uitleg'
import { breekAf, bouwAantekenHandleiding, pijlPad } from '@/lib/uitleg-pdf'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// De uitleg "een wedstrijd aantekenen": scherm, oefening en afdrukbare handleiding lezen
// dezelfde lijst. Dat is het hele punt — een papieren handleiding die iets anders zegt dan het
// scherm is erger dan geen handleiding.

describe('de stappenlijst', () => {
  it('loopt van 1 tot het einde zonder gaten', () => {
    expect(AANTEKEN_STAPPEN.map((s) => s.nr)).toEqual(AANTEKEN_STAPPEN.map((_, i) => i + 1))
  })

  it('beschrijft de weg die de aantekenaar echt aflegt', () => {
    // Inloggen → dagprogramma → aantekenen → starten → scoren → einde: dat is de volgorde die
    // gevraagd werd, en de volgorde waarin je ze aan de tafel nodig hebt.
    const titels = AANTEKEN_STAPPEN.map((s) => s.titel.toLowerCase()).join(' | ')
    expect(titels).toMatch(/meld je aan|aanmeld|inlog/)
    expect(titels).toMatch(/dagprogramma/)
    expect(titels).toMatch(/aantekenen/)
    expect(titels).toMatch(/start/)
    expect(titels).toMatch(/einde wedstrijd/)
  })

  it('noemt de knoppen zoals ze aan de tornooitafel staan', () => {
    // Deze namen komen letterlijk uit TournamentScoresheet. Verandert daar een knop, dan hoort
    // deze lijst mee te veranderen — anders wijst de handleiding iets aan wat er niet staat.
    const knoppen = AANTEKEN_STAPPEN.map((s) => s.knop ?? '').join(' ')
    expect(knoppen).toContain('Start')
    // De knop heet naar wát hij doet. Hij heette "2e helft" terwijl hij de eerste helft afsluit,
    // en dan lijkt een klok die op nul springt op een fout in plaats van op de rust.
    expect(knoppen).toContain('Einde 1e helft')
    expect(knoppen).toContain('Start 2e helft')
    expect(knoppen).toContain('Einde')
    expect(knoppen).toContain('nekworp')
    expect(knoppen).toContain('Pauze')
  })

  it('heeft van elke stap één korte zin voor op papier', () => {
    for (const s of AANTEKEN_STAPPEN) {
      expect(s.kort.length, `stap ${s.nr} heeft geen korte zin`).toBeGreaterThan(5)
      // Kort en krachtig: past op één regel naast de foto.
      expect(s.kort.length, `stap ${s.nr}: "${s.kort}" is te lang voor de handleiding`).toBeLessThan(75)
    }
  })

  it('houdt emoji buiten de tekst die naar papier gaat', () => {
    // De standaardletters van pdf-lib kennen geen emoji; één zo'n teken laat het hele document
    // klappen. Emoji horen dus in `icoon` en `knop`, niet in titel/tekst/letOp.
    //
    // De toets is "verdwijnt er iets", niet "verandert er iets": een em-streepje mág een gewoon
    // streepje worden (dat leest op papier even goed), maar een teken dat spoorloos wegvalt
    // laat een gat in de zin achter.
    const platteVelden = AANTEKEN_STAPPEN.flatMap((s) => [s.titel, s.kort, s.tekst, s.letOp ?? ''])
    for (const veld of platteVelden) {
      for (const teken of veld) {
        if (/\s/.test(teken)) continue
        expect(naarWinAnsi(teken), `"${teken}" uit "${veld.slice(0, 40)}…" valt weg op papier`).not.toBe('')
      }
    }
  })

  it('geeft elke stap een oefening die te doen valt', () => {
    for (const s of AANTEKEN_STAPPEN) {
      if (s.oefening.soort !== 'knop') continue
      expect(s.oefening.doel.length).toBeGreaterThan(0)
    }
  })

  it('wijst naar bestaande paden', () => {
    expect(UITLEG_PAD).toBe('/uitleg/aantekenen')
    expect(UITLEG_PDF_PAD).toBe('/api/uitleg/aantekenen')
  })
})

describe('naarWinAnsi', () => {
  it('haalt tekens weg die pdf-lib niet kan zetten', () => {
    // Dit is geen schoonheidsfoutje: op zo'n teken gooit pdf-lib, en dan krijg je géén PDF.
    expect(naarWinAnsi('klaar ✅ en 🏐 weg')).toBe('klaar en weg')
  })

  it('vertaalt wat een leesbare tegenhanger heeft', () => {
    expect(naarWinAnsi('Einde 1e helft → 2e')).toBe('Einde 1e helft -> 2e')
    expect(naarWinAnsi('“aanhaling” en — streepje')).toBe('"aanhaling" en - streepje')
    expect(naarWinAnsi('wachten…')).toBe('wachten...')
  })

  it('laat gewone tekst met accenten met rust', () => {
    expect(naarWinAnsi('beëindigd, één café')).toBe('beëindigd, één café')
  })
})

describe('breekAf', () => {
  it('houdt elke regel binnen de breedte', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const regels = breekAf(AANTEKEN_STAPPEN[0].tekst, font, 11, 300)
    expect(regels.length).toBeGreaterThan(1)
    for (const r of regels) expect(font.widthOfTextAtSize(r, 11)).toBeLessThanOrEqual(300)
  })

  it('verliest geen woorden', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const tekst = 'een twee drie vier vijf zes zeven acht negen tien'
    expect(breekAf(tekst, font, 11, 80).join(' ')).toBe(tekst)
  })
})

describe('pijlPad', () => {
  const beeld = { x: 100, y: 200, breedte: 300, hoogte: 400 }

  it('wijst van links naar een knop die niet tegen de rand plakt', () => {
    // Van rechts vertrekken terwijl de knop links staat, laat de pijl dwars over de rest van het
    // scherm lopen — en dan wijst hij onderweg de verkeerde knoppen aan.
    const p = pijlPad({ x: 40, y: 100, b: 80, h: 30 }, beeld, 1)
    expect(p.vanX).toBeLessThan(p.naarX)
    expect(p.naarX).toBeCloseTo(100 + 40 - 4, 5)
  })

  it('wijst van rechts naar een knop in de rechterhelft', () => {
    // Anders loopt de pijl dwars over de knop ernaast — en dan wijst hij onderweg precies aan
    // wat je NIET moet indrukken.
    const p = pijlPad({ x: 200, y: 100, b: 80, h: 30 }, beeld, 1)
    expect(p.vanX).toBeGreaterThan(p.naarX)
    expect(p.naarX).toBeCloseTo(100 + 280 + 4, 5)
  })

  it('wijst van rechts wanneer de knop tegen de linkerrand ligt', () => {
    const p = pijlPad({ x: 0, y: 100, b: 80, h: 30 }, beeld, 1)
    expect(p.vanX).toBeGreaterThan(p.naarX)
  })

  it('mikt op het midden van de knop, met de omgekeerde y-as van een PDF', () => {
    // Een scherm telt van boven naar beneden, een PDF van beneden naar boven. Eén keer verkeerd
    // om en elke pijl wijst gespiegeld — precies naar de knop die je níét moet hebben.
    const p = pijlPad({ x: 40, y: 0, b: 80, h: 40 }, beeld, 1)
    expect(p.naarY).toBeCloseTo(200 + 400 - 20, 5)
  })

  it('schaalt mee met de foto', () => {
    const p = pijlPad({ x: 40, y: 100, b: 80, h: 30 }, beeld, 0.5)
    expect(p.naarX).toBeCloseTo(100 + 20 - 4, 5)
  })
})

describe('de afdrukbare handleiding', () => {
  it('bouwt een echte PDF met alle stappen erin', async () => {
    // Dit is de test die telt: hij zet élke stap écht in een document. Zit er ergens nog een
    // teken dat de standaardletters niet kennen, dan gooit dit — en niet pas de club-printer.
    const bytes = await bouwAantekenHandleiding()
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')

    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(doc.getTitle()).toMatch(/aantekenen/i)
  }, 30_000)

  it('draagt voor elke stap een schermfoto', async () => {
    // De handleiding is bedoeld om te kunnen kijken in plaats van te lezen. Ontbreekt er een
    // foto (niet gefotografeerd, verkeerde naam), dan valt dat hier op en niet op papier.
    const { beelden } = (await import('@/lib/uitleg-beelden.json')).default as {
      beelden: { nr: number; bestand: string }[]
    }
    const fs = await import('fs/promises')
    const path = await import('path')
    for (const stap of AANTEKEN_STAPPEN) {
      const beeld = beelden.find((b) => b.nr === stap.nr)
      expect(beeld, `stap ${stap.nr} heeft geen foto`).toBeTruthy()
      const bytes = await fs.readFile(path.join(process.cwd(), 'public', 'uitleg', beeld!.bestand))
      expect(bytes.byteLength, `${beeld!.bestand} is leeg`).toBeGreaterThan(1000)
    }
  }, 30_000)
})
