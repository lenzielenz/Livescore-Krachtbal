import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { COLUMN_THRESHOLD, orderWeekendRows, renderWeekendDesign, weekendPages } from '@/lib/weekend-design'
import type { WeekendMatch } from '@/lib/instagram-weekend'

const matches = (n: number): WeekendMatch[] => Array.from({ length: n }, (_, i) => ({
  id: i, date: '2026-09-19T10:00:00Z', day: i < 6 ? 'zaterdag 19 september' : 'zondag 20 september',
  time: '12:00', side: i % 2 ? 'away' : 'home', team: 'KBC St. Michiels B',
  opponent: 'T Botterken Baasrode A', series: 'Regionale Heren B', seriesCode: 'RHB',
}))
const options = {
  club: 'KBC St. Michiels', primary: '#ed1515', secondary: '#ffffff', title: '19 – 20 september',
  rows: matches(8), total: 19, page: 0, pages: 3, homeCount: 10, awayCount: 9,
}
describe('Weekendplan design', () => {
  it('past 19 wedstrijden op één Story i.p.v. te moeten bladeren', () => {
    const rows = matches(19)
    const pages = weekendPages(rows)
    expect(pages).toEqual([rows])
  })
  it('bladert pas boven de nieuwe, ruimere paginagrens', () => {
    expect(weekendPages(matches(24))).toHaveLength(1)
    expect(weekendPages(matches(25)).map(p => p.length)).toEqual([24, 1])
  })
  it('groups every day into home matches followed by away matches', () => {
    const rows = matches(6).map((row, i) => ({
      ...row,
      date: `2026-09-19T${String(10 + i).padStart(2, '0')}:00:00Z`,
      side: (i % 2 ? 'away' : 'home') as 'home' | 'away',
      time: `${10 + i}:00`,
    }))
    expect(orderWeekendRows(rows).map(row => row.side)).toEqual(['home', 'home', 'home', 'away', 'away', 'away'])
    expect(orderWeekendRows(rows).filter(row => row.side === 'home').map(row => row.time)).toEqual(['10:00', '12:00', '14:00'])
  })
  it('provides an empty state', () => {
    expect(weekendPages([])).toEqual([[]])
    expect(renderWeekendDesign({ ...options, rows: [], total: 0 })).toContain('Even geen wedstrijden.')
  })
  it('renders eight matches and two day headings above the footer', () => {
    const svg = renderWeekendDesign({ ...options, rows: orderWeekendRows(options.rows) })
    expect((svg.match(/data-match=/g) ?? [])).toHaveLength(8)
    expect(svg).toContain('ZATERDAG 19 SEPTEMBER · THUIS')
    expect(svg).toContain('ZONDAG 20 SEPTEMBER · THUIS')
    const rowTops = [...svg.matchAll(/<rect x="64" y="(\d+)" width="952" height="120"/g)].map(m => Number(m[1]))
    expect(Math.max(...rowTops) + 120).toBeLessThan(1764)
  })
  it('escapes names and keeps full long names', () => {
    const club = 'Een zeer lange clubnaam met & <speciale> tekens'
    const svg = renderWeekendDesign({ ...options, club })
    expect(svg).toContain('Een zeer lange clubnaam met &amp; &lt;speciale&gt; tekens')
    expect(svg).not.toContain('…')
    expect(svg).not.toContain('KBC St. Michiels B</text>')
    expect(svg).toContain('T Botterken Baasrode A')
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

  describe('compacte tweekolommenweergave (drukke speeldag)', () => {
    it('schakelt pas over boven COLUMN_THRESHOLD wedstrijden', () => {
      // De compacte rij is herkenbaar aan haar afgeronde hoek (rx="14"; de ruime kaart gebruikt
      // rx="22") en het T/U-lettersymbool i.p.v. het volle woord.
      const atThreshold = renderWeekendDesign({ ...options, rows: orderWeekendRows(matches(COLUMN_THRESHOLD)) })
      expect(atThreshold).not.toContain('rx="14"')
      expect(atThreshold).not.toMatch(/font-weight="800">T<\/text>/)
      const overThreshold = renderWeekendDesign({ ...options, rows: orderWeekendRows(matches(COLUMN_THRESHOLD + 1)) })
      expect(overThreshold).toContain('rx="14"')
      expect(overThreshold).toMatch(/font-weight="800">T<\/text>/)
    })
    it('toont alle 20 wedstrijden, verdeeld over twee kolommen', () => {
      const rows = orderWeekendRows(matches(20))
      const svg = renderWeekendDesign({ ...options, rows, total: 20, pages: 1 })
      expect((svg.match(/data-match=/g) ?? [])).toHaveLength(20)
      // Tweede kolom start rechts van de eerste (COL_WIDTH + COL_GAP na x=64).
      expect(svg).toContain('x="64"')
      expect(svg).toContain('x="552"')
    })
    it('gebruikt een letter-symbool i.p.v. de volle woorden THUIS/UIT, en de korte reekscode', () => {
      const rows = orderWeekendRows(matches(COLUMN_THRESHOLD + 2))
      const svg = renderWeekendDesign({ ...options, rows })
      // De letterbadge in de rij zelf (niet de dag/kant-kop, die blijft "THUIS"/"UIT").
      expect(svg).toMatch(/font-weight="800">T<\/text>/)
      expect(svg).toMatch(/font-weight="800">U<\/text>/)
      expect(svg).toContain('>RHB<')
      expect(svg).not.toContain('Regionale Heren B')
    })
    it('blijft ruim vóór de voettekstlijn (y=1764) voor 24 wedstrijden op twee kolommen', () => {
      const rows = orderWeekendRows(matches(24))
      const svg = renderWeekendDesign({ ...options, rows, total: 24, pages: 1 })
      const compactRows = [...svg.matchAll(/<rect x="(?:64|552)" y="([\d.]+)" width="464" height="([\d.]+)" rx="14"/g)]
        .map(m => ({ top: Number(m[1]), height: Number(m[2]) }))
      expect(compactRows.length).toBeGreaterThan(0)
      expect(Math.max(...compactRows.map(r => r.top + r.height))).toBeLessThan(1764)
    })
    it('rekt rijen op om de kolom te vullen bij een rustigere speeldag', () => {
      const rows = orderWeekendRows(matches(COLUMN_THRESHOLD + 1))
      const svg = renderWeekendDesign({ ...options, rows })
      const heights = [...svg.matchAll(/width="464" height="([\d.]+)" rx="14"/g)].map(m => Number(m[1]))
      expect(heights[0]).toBeGreaterThan(56)
    })
  })
})
