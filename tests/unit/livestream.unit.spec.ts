import { describe, it, expect } from 'vitest'

import { toLivestreamEmbed } from '@/lib/livestream'

describe('toLivestreamEmbed', () => {
  it('leeg/ongeldig → null', () => {
    expect(toLivestreamEmbed('')).toBeNull()
    expect(toLivestreamEmbed(null)).toBeNull()
    expect(toLivestreamEmbed('   ')).toBeNull()
    expect(toLivestreamEmbed('niet een url %%%')).toBeNull()
  })

  it('YouTube watch-link → embed', () => {
    const e = toLivestreamEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(e).toMatchObject({ kind: 'embed', provider: 'youtube' })
    expect(e && e.kind === 'embed' && e.src).toContain('/embed/dQw4w9WgXcQ')
  })

  it('youtu.be en /live/ → embed', () => {
    expect(toLivestreamEmbed('https://youtu.be/abc123XYZ_-')).toMatchObject({ kind: 'embed', provider: 'youtube' })
    expect(toLivestreamEmbed('https://www.youtube.com/live/abc123XYZ_-')).toMatchObject({ kind: 'embed', provider: 'youtube' })
  })

  it('zonder protocol werkt ook', () => {
    expect(toLivestreamEmbed('youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ kind: 'embed', provider: 'youtube' })
  })

  it('Twitch: met domein → embed met parent, zonder domein → link', () => {
    const withHost = toLivestreamEmbed('https://twitch.tv/krachtbal', 'livescore.roodgries.be')
    expect(withHost).toMatchObject({ kind: 'embed', provider: 'twitch' })
    expect(withHost && withHost.kind === 'embed' && withHost.src).toContain('parent=livescore.roodgries.be')
    expect(withHost && withHost.kind === 'embed' && withHost.src).toContain('channel=krachtbal')
    expect(toLivestreamEmbed('https://twitch.tv/krachtbal')).toMatchObject({ kind: 'link' })
  })

  it('Facebook → video-plugin embed', () => {
    const e = toLivestreamEmbed('https://www.facebook.com/club/videos/123456789/')
    expect(e).toMatchObject({ kind: 'embed', provider: 'facebook' })
    expect(e && e.kind === 'embed' && e.src).toContain('plugins/video.php')
  })

  it('onbekende host → link-terugval', () => {
    expect(toLivestreamEmbed('https://example.com/live')).toMatchObject({ kind: 'link', href: 'https://example.com/live' })
  })

  it('reeds een embed-URL → ongewijzigd ingesloten', () => {
    expect(toLivestreamEmbed('https://player.vimeo.com/video/123')).toMatchObject({ kind: 'embed' })
  })
})
