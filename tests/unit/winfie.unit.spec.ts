import { describe, expect, it } from 'vitest'

import type { MatchState, TimelineItem } from '@/lib/match-engine'
import { buildWinfieDesign, winfieHeadline, winfieProgress, winfieVariant } from '@/lib/winfie'

describe('winfie', () => {
  it('bouwt een cumulatief scoreverloop met één- en tweepunters', () => {
    const progress = winfieProgress([
      { id: '1', kind: 'goal', half: 1, gameClock: 30, side: 'home', label: 'Doelpunt +1' },
      { id: '2', kind: 'timeout', half: 1, gameClock: 60, side: 'away', label: 'Time-out' },
      { id: '3', kind: 'goal', half: 2, gameClock: 20, side: 'away', label: 'Doelpunt +2' },
    ])
    expect(progress).toEqual([
      { home: 0, away: 0, half: 1, gameClock: 0 },
      { home: 1, away: 0, half: 1, gameClock: 30 },
      { home: 1, away: 2, half: 2, gameClock: 20 },
    ])
  })

  it('maakt passende winstkoppen', () => {
    expect(winfieHeadline('Male', 'Brugge', { home: 27, away: 20 })).toBe('Male OVERTUIGT')
    expect(winfieHeadline('Male', 'Brugge', { home: 20, away: 21 })).toBe('Brugge WINT DE THRILLER')
    expect(winfieHeadline('Male', 'Brugge', { home: 20, away: 20 })).toBe('PUNT GEDEELD')
  })

  it('kiest stabiel één van vier composities per wedstrijd en foto', () => {
    expect(winfieVariant(42, 7)).toBe(winfieVariant(42, 7))
    expect([0, 1, 2, 3]).toContain(winfieVariant(99))
  })
})

describe('buildWinfieDesign', () => {
  const state = {
    match: { id: 42, date: '2026-09-13T09:15:00.000Z', reeks: '1NAD', status: 'finished' },
    score: { home: 4, away: 13 },
    teams: {
      home: { name: 'KRB Jabbeke', logoUrl: '/logos/jabbeke.png', logoFit: null, colors: { primary: '#3aa0ff', secondary: '#ffffff' } },
      away: { name: 'KBC St. Michiels', logoUrl: '/logos/stmichiels.png', logoFit: null, colors: { primary: '#ee2233', secondary: '#ffffff' } },
    },
  } as unknown as MatchState
  const timeline: TimelineItem[] = [
    { id: '1', kind: 'goal', half: 1, gameClock: 30, side: 'home', label: 'Doelpunt +1' },
    { id: '2', kind: 'goal', half: 2, gameClock: 20, side: 'away', label: 'Doelpunt +2' },
  ]

  // Logo's/foto gaan als gewone URL mee — geen server-side downloaden/hercoderen meer, de browser
  // laadt ze zelf. Dat is precies wat een trage of mislukkende server-side beeldbewerking voorkomt.
  it('geeft logo-URL\'s rechtstreeks door en berekent de winnaar', () => {
    const design = buildWinfieDesign(state, timeline)
    expect(design.homeLogoHref).toBe('/logos/jabbeke.png')
    expect(design.awayLogoHref).toBe('/logos/stmichiels.png')
    expect(design.score).toEqual({ home: 4, away: 13 })
    expect(design.winner).toBe('away')
    expect(design.reeks.length).toBeGreaterThan(0)
  })

  it('vult het scoreverloop aan tot de officiële eindstand als de tijdlijn onvolledig is', () => {
    const design = buildWinfieDesign(state, [])
    expect(design.progress.at(-1)).toMatchObject({ home: 4, away: 13 })
  })

  it('geeft de meegegeven foto en persoonlijke stempel door', () => {
    const design = buildWinfieDesign(state, timeline, { photoHref: '/foto.jpg', iWasThere: true })
    expect(design.photoHref).toBe('/foto.jpg')
    expect(design.iWasThere).toBe(true)
  })

  it('valt zonder foto/stempel terug op undefined', () => {
    const design = buildWinfieDesign(state, timeline)
    expect(design.photoHref).toBeUndefined()
    expect(design.iWasThere).toBeUndefined()
  })

  it('geeft reacties en overige activiteit door', () => {
    const design = buildWinfieDesign(state, timeline, { reactions: { fire: 12 }, momentsExtra: 3 })
    expect(design.reactions).toEqual({ fire: 12 })
    expect(design.momentsExtra).toBe(3)
  })
})
