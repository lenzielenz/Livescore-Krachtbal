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
  crosses: { home: 2, away: 1 },
  timeouts: { home: [1, 0], away: [2, 1] },
  goals: [{ half: 1, gameClock: 65, side: 'home', shirtNumber: 7, playerName: 'Jonáš Œuvré', points: 2, type: 'rug' }],
  substitutions: [{ half: 2, gameClock: 120, side: 'away', wissel: '#4 Tom → #9 Bert' }],
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
  it('genereert een PDF zonder te crashen op ✓, → of niet-Latin-1 namen', async () => {
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

  it('paginaleert een lange doelpuntenlijst mét tabelkop op elke pagina', async () => {
    const goals = Array.from({ length: 120 }, (_, i) => ({
      half: i < 60 ? 1 : 2,
      gameClock: i * 10,
      side: (i % 2 === 0 ? 'home' : 'away') as 'home' | 'away',
      shirtNumber: (i % 8) + 1,
      playerName: `Speler ${i + 1}`,
      points: (i % 3 === 0 ? 2 : 1) as 1 | 2,
      type: (i % 3 === 0 ? 'rug' : 'nek') as 'rug' | 'nek',
    }))
    const bytes = await generateMatchSheetPdf({ ...base, goals })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })

  it('verwerkt een blad zonder doelpunten/vervangingen (lege secties, geen crash)', async () => {
    const bytes = await generateMatchSheetPdf({ ...base, goals: [], substitutions: [], score: undefined })
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF')
  })
})
