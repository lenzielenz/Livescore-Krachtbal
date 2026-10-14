import { describe, expect, it } from 'vitest'

import { eigenHerkomst } from '@/lib/virtueel'

// Clublogo's in het virtuele stadion: een beeld van een andere site gaat via de eigen logo-proxy.

describe('eigenHerkomst (logo’s in het virtuele stadion)', () => {
  const hier = 'https://livescore.roodgries.be/virtueel/x'
  it('laat beelden van de eigen site en data-URL’s ongemoeid', () => {
    expect(eigenHerkomst('/api/media/file/ksm.png', hier)).toBe('/api/media/file/ksm.png')
    expect(eigenHerkomst('https://livescore.roodgries.be/api/media/file/ksm.png', hier)).toBe('https://livescore.roodgries.be/api/media/file/ksm.png')
    expect(eigenHerkomst('data:image/png;base64,AAA', hier)).toBe('data:image/png;base64,AAA')
  })
  it('stuurt een logo van een andere site via de eigen logo-proxy', () => {
    expect(eigenHerkomst('https://www.kbcsm.be/logo.png', hier)).toBe('/api/logo-proxy?url=https%3A%2F%2Fwww.kbcsm.be%2Flogo.png')
    expect(eigenHerkomst('https://iets.up.railway.app/api/media/file/ksm.png', hier)).toBe(
      '/api/logo-proxy?url=https%3A%2F%2Fiets.up.railway.app%2Fapi%2Fmedia%2Ffile%2Fksm.png',
    )
  })
})
