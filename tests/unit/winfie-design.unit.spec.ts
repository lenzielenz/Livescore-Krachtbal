import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { renderWinfieDesign, type WinfieDesign } from '@/lib/winfie-design'

const base: WinfieDesign = {
  home: 'KRB Jabbeke', away: 'KBC St. Michiels', score: { home: 4, away: 13 },
  winner: 'away', primary: '#ee2233', secondary: '#ffffff', homeColor: '#aabbcc', awayColor: '#ee2233',
  headline: 'KBC St. Michiels overtuigt', date: '13 september 2026', reeks: 'U12 B',
  progress: [{ home: 0, away: 0 }, { home: 4, away: 13 }], variant: 0,
}
describe('Winfie platformstijl', () => {
  it('rendert een geldige 1080 × 1920 PNG zonder transparante rand', async () => {
    const png = await sharp(Buffer.from(renderWinfieDesign(base))).png().toBuffer()
    const meta = await sharp(png).metadata()
    expect([meta.width, meta.height]).toEqual([1080, 1920])
    expect((await sharp(png).stats()).isOpaque).toBe(true)
  })
  it('escape tekst, behoudt lange clubnamen en respecteert logozoom', () => {
    const svg = renderWinfieDesign({ ...base, home: 'Club <test> & vrienden', homeLogoHref: 'data:image/png;base64,AA==',
      homeLogoFit: { zoom: 2, offsetX: 5, offsetY: -5 } })
    expect(svg).toContain('&lt;test&gt;')
    expect(svg).toContain('&amp;')
    expect(svg).toContain('width="376"')
    expect(svg).toContain('clip-path="url(#home)"')
  })
  it('maakt gelijke clubkleuren onderscheidbaar en gebruikt passende gelijkspeltekst', () => {
    const svg = renderWinfieDesign({ ...base, winner: 'draw', homeColor: '#ffffff', awayColor: '#ffffff' })
    expect(svg).toContain('stroke="#fff" stroke-width="2.5"')
    expect(svg).toContain('SAMEN BELEEFD.')
    expect(svg).not.toContain('DE OVERWINNING IS BINNEN')
  })
  it('tekent het momentum-scoreverloop met een rugworp-ster', () => {
    const svg = renderWinfieDesign({
      ...base,
      progress: [
        { home: 0, away: 0, half: 1 },
        { home: 1, away: 0, half: 1 },
        { home: 1, away: 2, half: 2 },
      ],
    })
    expect(svg).toContain('Momentum · scoreverloop')
    expect(svg).toContain('2 doelpunten')
    expect(svg).toContain('2e helft')
    expect((svg.match(/<polygon points="[0-9.,\s]+" fill="#ee2233" stroke="#f4c430"/g) ?? []).length).toBe(1)
  })
  it('plaatst een foto in een eigen geknipt vlak', () => {
    const svg = renderWinfieDesign({ ...base, photoHref: 'data:image/png;base64,AA==' })
    expect(svg).toContain('clip-path="url(#photo)"')
    expect(svg).not.toContain('DE WEDSTRIJD IN CIJFERS')
  })
})
