// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { veldFotoSvg } from '@/lib/demoruimte/klaarzetten'

// Regressie 2026-11-03: het klaarzetten van de demo op Railway crashte bij het maken van de foto voor de afgelasting.
// Die "foto" is een SVG die sharp naar PNG rastert; stond er tekst in, dan zocht librsvg naar fontconfig, vond het niet op
// de container en trok het hele Node-proces mee neer (native crash). De demo bleef half gevuld achter.
describe('demoruimte: de afgelastingsfoto', () => {
  it('bevat geen tekst, dus geen lettertype nodig op de server', () => {
    const svg = veldFotoSvg()
    expect(svg).not.toMatch(/<text[\s>]/i)
    expect(svg).not.toMatch(/<tspan[\s>]/i)
    expect(svg).not.toMatch(/font-family/i)
  })

  it('wordt een geldige PNG van 960×640', async () => {
    const sharp = (await import('sharp')).default
    const png = await sharp(Buffer.from(veldFotoSvg())).png().toBuffer()
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG-handtekening
    const meta = await sharp(png).metadata()
    expect([meta.width, meta.height]).toEqual([960, 640])
  })
})
