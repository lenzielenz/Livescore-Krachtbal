import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { renderWeekendDesign, weekendPages } from '@/lib/weekend-design'
import type { WeekendMatch } from '@/lib/instagram-weekend'

const matches = (n: number): WeekendMatch[] => Array.from({ length: n }, (_, i) => ({
  id: i, date: '2026-09-19T10:00:00Z', day: i < 6 ? 'zaterdag 19 september' : 'zondag 20 september',
  time: '12:00', side: i % 2 ? 'away' : 'home', team: 'KBC St. Michiels B',
  opponent: 'T Botterken Baasrode A', series: 'Regionale Heren B',
}))
const options = {
  club: 'KBC St. Michiels', primary: '#ed1515', secondary: '#ffffff', title: '19 – 20 september',
  rows: matches(8), total: 19, page: 0, pages: 3,
}
describe('Weekendplan design', () => {
  it('keeps all 19 matches in order across three readable Stories', () => {
    const rows = matches(19)
    const pages = weekendPages(rows)
    expect(pages.map(p => p.length)).toEqual([8, 8, 3])
    expect(pages.flat()).toEqual(rows)
  })
  it('provides an empty state and exact page boundaries', () => {
    expect(weekendPages([])).toEqual([[]])
    expect(weekendPages(matches(8))).toHaveLength(1)
    expect(weekendPages(matches(9))).toHaveLength(2)
    expect(renderWeekendDesign({ ...options, rows: [], total: 0 })).toContain('Even geen wedstrijden.')
  })
  it('renders eight matches and two day headings above the footer', () => {
    const svg = renderWeekendDesign(options)
    expect((svg.match(/data-match=/g) ?? [])).toHaveLength(8)
    expect(svg).toContain('ZATERDAG 19 SEPTEMBER')
    expect(svg).toContain('ZONDAG 20 SEPTEMBER')
    const rowTops = [...svg.matchAll(/<rect x="64" y="(\d+)" width="952" height="120"/g)].map(m => Number(m[1]))
    expect(Math.max(...rowTops) + 120).toBeLessThan(1764)
  })
  it('escapes names and keeps full long names', () => {
    const club = 'Een zeer lange clubnaam met & <speciale> tekens'
    const svg = renderWeekendDesign({ ...options, club })
    expect(svg).toContain('Een zeer lange clubnaam met &amp; &lt;speciale&gt; tekens')
    expect(svg).not.toContain('…')
  })
  it('rasterizes the same embedded-logo design to a full-size PNG', async () => {
    const logo = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#ffffff' } }).png().toBuffer()
    const svg = renderWeekendDesign({ ...options, logoHref: `data:image/png;base64,${logo.toString('base64')}`, logoFit: { zoom: 1.5, offsetX: 5 } })
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1920)
    expect(meta.format).toBe('png')
  })
})
