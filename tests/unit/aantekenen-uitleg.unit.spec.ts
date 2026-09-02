import { describe, it, expect } from 'vitest'

import { AANTEKEN_STAPPEN, UITLEG_PAD, UITLEG_PDF_PAD, naarWinAnsi } from '@/lib/aantekenen-uitleg'
import { breekAf, bouwAantekenHandleiding } from '@/lib/uitleg-pdf'
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

  it('noemt de knoppen zoals ze in de app staan', () => {
    // Verandert een knopnaam in SimpleScorekeeper, dan hoort deze lijst mee te veranderen.
    const knoppen = AANTEKEN_STAPPEN.map((s) => s.knop ?? '').join(' ')
    expect(knoppen).toContain('Tik om te starten')
    expect(knoppen).toContain('Einde 1e helft')
    expect(knoppen).toContain('Einde wedstrijd')
    expect(knoppen).toContain('nekworp')
  })

  it('houdt emoji buiten de tekst die naar papier gaat', () => {
    // De standaardletters van pdf-lib kennen geen emoji; één zo'n teken laat het hele document
    // klappen. Emoji horen dus in `icoon` en `knop`, niet in titel/tekst/letOp.
    //
    // De toets is "verdwijnt er iets", niet "verandert er iets": een em-streepje mág een gewoon
    // streepje worden (dat leest op papier even goed), maar een teken dat spoorloos wegvalt
    // laat een gat in de zin achter.
    const platteVelden = AANTEKEN_STAPPEN.flatMap((s) => [s.titel, s.tekst, s.letOp ?? ''])
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
})
