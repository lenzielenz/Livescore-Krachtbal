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
  it('toont de grootste voorsprong en de ruststand als er echte helft-per-helft data is', () => {
    const svg = renderWinfieDesign({
      ...base,
      progress: [
        { home: 0, away: 0, half: 1 },
        { home: 4, away: 0, half: 1 },
        { home: 4, away: 13, half: 2 },
      ],
    })
    expect(svg).toContain('grootste voorsprong')
    expect(svg).toContain('>9<') // grootste puntenverschil ooit: 13 - 4 = 9 (na de tweede worp)
    expect(svg).toContain('bij de rust')
    expect(svg).toContain('4-0') // stand bij het ingaan van de tweede helft
  })
  it('valt terug op het totaal aantal doelpunten zonder echte helft-data (bv. een geïmporteerde eindstand)', () => {
    // buildWinfieDesign duwt zo'n eindstand als één sprong naar helft 2 (zie winfie.ts) — geen
    // eigen helft-1-cijfer, dus geen "bij de rust" tonen dat er niet echt is.
    const svg = renderWinfieDesign({ ...base, progress: [{ home: 0, away: 0, half: 1 }, { home: 4, away: 13, half: 2 }] })
    expect(svg).not.toContain('bij de rust')
    expect(svg).toContain('doelpunten totaal')
  })
  it('toont een persoonlijke stempel enkel als de aanmaker zelf erbij was', () => {
    expect(renderWinfieDesign(base)).not.toContain('JIJ WAS ERBIJ')
    expect(renderWinfieDesign({ ...base, iWasThere: true })).toContain('JIJ WAS ERBIJ')
  })
  it('lijnt de ploegnaam recht onder haar eigen logo uit', () => {
    const svg = renderWinfieDesign(base)
    // Logo's staan op x=226 (thuis) en x=854 (uit) — de naam eronder hoort op dezelfde x te centreren.
    expect(svg).toContain('cx="226" cy="590"')
    expect(svg).toContain('cx="854" cy="590"')
    expect(svg).toContain('x="226" y="764" text-anchor="middle"')
    expect(svg).toContain('x="854" y="764" text-anchor="middle"')
  })
  it('toont tot vier reactiechips, gesorteerd op aantal, plus een "meer"-chip als er ruimte is', () => {
    const svg = renderWinfieDesign({ ...base, reactions: { clap: 3, fire: 47, heart: 0, wow: 9 }, momentsExtra: 5 })
    const claps = svg.indexOf('👏')
    const fires = svg.indexOf('🔥')
    const wows = svg.indexOf('😮')
    expect(fires).toBeGreaterThan(-1)
    // Meeste reacties (fire) komt vóór minder populaire reacties in de opmaak.
    expect(fires).toBeLessThan(wows)
    expect(wows).toBeLessThan(claps)
    expect(svg).toContain('✨')
    expect(svg).toContain('>5<')
  })
  it('toont geen reactierij zonder activiteit', () => {
    const svg = renderWinfieDesign(base)
    expect(svg).not.toContain('<g class="wf-chip"')
  })
  it('geeft de winnende score een gloed en dooft de verliezende score', () => {
    const svg = renderWinfieDesign({ ...base, winner: 'away' })
    expect(svg).toContain('filter="url(#scoreGlow)"')
    expect(svg).toContain('fill-opacity=".55"')
  })
  it('houdt beide scores neutraal bij een gelijkspel', () => {
    const svg = renderWinfieDesign({ ...base, winner: 'draw' })
    expect(svg).not.toContain('filter="url(#scoreGlow)"')
  })
  it('is deterministisch: dezelfde wedstrijd geeft dezelfde confetti-opmaak', () => {
    expect(renderWinfieDesign(base)).toBe(renderWinfieDesign(base))
  })
})
