// @vitest-environment node
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildWeeklyRecap } from '@/lib/weekly-recap'
import { GET } from '@/app/api/recap/instagram/route'

const mocks = vi.hoisted(() => ({
  getPayloadClient: vi.fn(),
  buildWeeklyRecapData: vi.fn(),
}))

vi.mock('@/lib/payload-client', () => ({ getPayloadClient: mocks.getPayloadClient }))
vi.mock('@/lib/weekly-recap-data', () => ({ buildWeeklyRecapData: mocks.buildWeeklyRecapData }))

const recap = buildWeeklyRecap({
  startIso: '2026-09-07T06:00:00.000Z',
  endIso: '2026-09-14T06:00:00.000Z',
  results: [{
    matchId: 1,
    date: '2026-09-12T13:00:00.000Z',
    reeks: 'U12',
    home: 'Club & Co',
    away: 'Bezoekers',
    homeTeamId: 1,
    awayTeamId: 2,
    homeGoals: 20,
    awayGoals: 18,
  }],
  team: null,
  players: [],
  climbers: [],
  stats: { visitors: 9, clubs: 2, goalThrows: 37, backThrows: 1 },
})

beforeEach(() => {
  mocks.getPayloadClient.mockResolvedValue({})
  mocks.buildWeeklyRecapData.mockResolvedValue(recap)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('weekendrecap als Instagram Story', () => {
  it('levert een geldige SVG-preview met de echte wedstrijdcijfers', async () => {
    const response = await GET(new Request('http://localhost/api/recap/instagram?preview=1'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/svg+xml')
    const svg = await response.text()
    expect(svg).toContain('Club &amp; Co')
    expect(svg).toContain('20–18')
    const metadata = await sharp(Buffer.from(svg)).metadata()
    expect(metadata).toMatchObject({ width: 1080, height: 1920, format: 'svg' })
  })

  it('levert een echte PNG-bijlage van 1080 bij 1920 pixels', async () => {
    const response = await GET(new Request('http://localhost/api/recap/instagram?download=1'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="weekend-recap-2026-09-07.png"')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(metadata).toMatchObject({ width: 1080, height: 1920, format: 'png' })
  })

  it.each(['preview=1', 'download=1'])('meldt een dataprobleem bij %s zonder een lege Story als succes te geven', async (query) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getPayloadClient.mockRejectedValueOnce(new Error('Database niet beschikbaar'))
    const response = await GET(new Request(`http://localhost/api/recap/instagram?${query}`))
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'De weekendrecap kon niet worden gemaakt. Probeer het opnieuw.' })
    expect(log).toHaveBeenCalledOnce()
  })
})
