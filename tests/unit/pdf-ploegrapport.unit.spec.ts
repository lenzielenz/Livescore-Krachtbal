import { describe, it, expect } from 'vitest'

import type { TeamDanger } from '@/lib/player-danger'
import { generateTeamReportPdf } from '@/lib/submit/pdf-ploegrapport'
import type { TeamReport } from '@/lib/team-report'

const player = (n: number, name: string): TeamReport['players'][number] => ({
  playerId: n,
  name,
  shirtNumber: n,
  matches: 2,
  throws: 12,
  goals: 5,
  points: 7,
  nek: 3,
  rug: 2,
  goalAttempts: 6,
  conversion: 0.83,
  caughtLost: 1,
  out: 2,
  score: 4,
  avgDistance: 12.3,
  maxDistance: 21.4,
  zones: { links: 4, midden: 3, rechts: 5 },
  catches: 2,
  tip: '1e worp links (60%) · scoort via rechts',
})

const report: TeamReport = {
  teamId: 1,
  teamName: 'KBC Sint-Michiels Œuvré',
  reeks: '1NAH',
  clubId: 1,
  matchesAnalyzed: 3,
  totals: {
    throws: 40,
    goals: 20,
    points: 28,
    nek: 12,
    rug: 8,
    goalAttempts: 26,
    conversion: 0.77,
    avgDistance: 13.1,
    maxDistance: 26.6,
    caughtAgainst: 5,
    out: 6,
    catches: 9,
  },
  zones: { links: 14, midden: 9, rechts: 17 },
  players: [player(4, 'Jonáš Œuvré'), player(7, 'Tom "de Snelle"')],
  insights: ['Meeste doelpunten vallen via rechts.', 'Worpkeuze: 40% rugworpen (dubbel).'],
  speelstijl: { accent: 'aanvallend', zone: 'rechts', worp: 'rug', verreWorp: true, notitie: 'Snelle omschakeling.' },
  strategy: ['Jullie willen via rechts spelen — en dat lukt (62%).'],
  profile: {
    tags: ['Rechts-dominant', 'Krachtploeg', 'Klinisch'],
    radar: [
      { key: 'afwerking', label: 'Afwerking', value: 80, display: '77%' },
      { key: 'kracht', label: 'Kracht (rug)', value: 80, display: '40% dubbel' },
      { key: 'diepgang', label: 'Diepgang', value: 60, display: '13.1 m' },
      { key: 'spreiding', label: 'Spreiding', value: 35, display: '43% rechts' },
      { key: 'balveilig', label: 'Balveiligheid', value: 55, display: '28% verlies' },
      { key: 'verdediging', label: 'Verdediging', value: 38, display: '3.0/match' },
    ],
    strengths: [
      { area: 'Spelers', title: 'Sterspeler #4 Jonáš', detail: '7 ptn · 5 doelpunten. Hou hem kort.', weight: 95 },
      { area: 'Aanval', title: 'Koelbloedig voor doel', detail: '77% van de doelpogingen raak.', weight: 77 },
    ],
    weaknesses: [
      { area: 'Verdediging', title: 'Kwetsbaar via links', detail: '60% van de tegendoelpunten valt via links.', weight: 66 },
    ],
    topScorerShare: 0.25,
  },
  generatedAt: new Date('2026-06-07T20:00:00Z').toISOString(),
}

const danger: TeamDanger = {
  attempts: 26,
  goals: 20,
  conversion: 0.77,
  avgDistance: 13.1,
  shots: [
    { x: 0.4, y: 0.3, landX: 0.7, landY: 0.82, goal: true, type: 'rug' },
    { x: 0.5, y: 0.5, landX: 0.5, landY: 0.6, goal: false, type: 'nek' },
    { x: 0.8, y: 0.2, landX: 0.85, landY: 0.78, goal: true, type: 'nek' },
  ],
  depthBands: [
    { label: 'Dichtbij', attempts: 8, goals: 7, conversion: 0.88 },
    { label: 'Midden', attempts: 12, goals: 9, conversion: 0.75 },
    { label: 'Ver', attempts: 6, goals: 4, conversion: 0.67 },
  ],
  zoneBands: [
    { label: 'Links', attempts: 9, goals: 7, conversion: 0.78 },
    { label: 'Midden', attempts: 6, goals: 4, conversion: 0.67 },
    { label: 'Rechts', attempts: 11, goals: 9, conversion: 0.82 },
  ],
}

const conceded: TeamDanger = {
  attempts: 14,
  goals: 8,
  conversion: 0.57,
  avgDistance: 12,
  shots: [
    { x: 0.3, y: 0.2, landX: 0.2, landY: 0.85, goal: true, type: 'rug' },
    { x: 0.6, y: 0.3, landX: 0.8, landY: 0.8, goal: true, type: 'nek' },
    { x: 0.5, y: 0.4, landX: 0.5, landY: 0.7, goal: false, type: 'nek' },
  ],
  depthBands: [
    { label: 'Dichtbij doel', attempts: 6, goals: 5, conversion: 0.83 },
    { label: 'Middenveld', attempts: 5, goals: 2, conversion: 0.4 },
    { label: 'Ver van doel', attempts: 3, goals: 1, conversion: 0.33 },
  ],
  zoneBands: [
    { label: 'Links', attempts: 7, goals: 5, conversion: 0.71 },
    { label: 'Midden', attempts: 4, goals: 2, conversion: 0.5 },
    { label: 'Rechts', attempts: 3, goals: 1, conversion: 0.33 },
  ],
}

describe('generateTeamReportPdf', () => {
  it('levert een geldige PDF op (met aanvals- én verdedigingskaart)', async () => {
    const bytes = await generateTeamReportPdf(report, danger, conceded)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('werkt ook zonder gevaarzone en zonder spelers', async () => {
    const bytes = await generateTeamReportPdf({ ...report, players: [], insights: [], strategy: [] }, null)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})
