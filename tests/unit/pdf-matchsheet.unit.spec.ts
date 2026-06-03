import { PDFDocument } from 'pdf-lib'
import { describe, it, expect } from 'vitest'

import { generateMatchSheetPdf, type MatchSheetPdfData } from '@/lib/submit/pdf'

// Regressie: vroeger crashte de PDF op het ✓-teken (WinAnsi kan U+2713 niet encoderen) en op
// niet-Latin-1 tekens in (Vlaamse) namen. De generator moet nu altijd een PDF opleveren.
const base: MatchSheetPdfData = {
  titel: 'KV Brugge — KV Gent',
  datum: '04/06/2026 14:00',
  categorie: 'senioren',
  reeks: '1NAH',
  score: { home: 12, away: 9 },
  halfScores: { home: [6, 6], away: [4, 5] },
  goals: [{ half: 1, gameClock: 65, side: 'home', shirtNumber: 7, playerName: 'Jonáš Œuvré', points: 2 }],
  homeTeam: 'KV Brugge',
  awayTeam: 'KV Gent',
  homeLineup: [{ rugnummer: 7, name: 'Jonáš Œuvré', deelgenomen: true }],
  awayLineup: [{ rugnummer: 4, name: 'Tom ✓ "de Snelle"' }],
  officials: [{ label: 'Aantekenaar', naam: 'Piet' }],
  keuring: [{ label: 'Ballen', waarde: 'ok' }],
  uitsluitingen: [],
  voorbehoud: [],
  handtekeningen: [
    { label: 'Kapitein thuis', sig: { naam: 'André', akkoord: true, tijdstip: '14:02' } },
    { label: 'Kapitein uit', sig: { naam: 'José', akkoord: true } },
    { label: 'Scheidsrechter', sig: { naam: 'Wim', akkoord: false } },
  ],
}

describe('generateMatchSheetPdf', () => {
  it('genereert een PDF zonder te crashen op ✓ of niet-Latin-1 namen', async () => {
    const bytes = await generateMatchSheetPdf(base)
    expect(bytes.length).toBeGreaterThan(500)
    // PDF-bestanden beginnen met "%PDF".
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF')
  })

  it('paginaleert bij een lange opstelling (geen rijen verloren)', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ rugnummer: i + 1, name: `Speler ${i + 1}` }))
    const bytes = await generateMatchSheetPdf({ ...base, homeLineup: many, awayLineup: many })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })
})
