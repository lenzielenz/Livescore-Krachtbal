// Zet een livestream-URL (YouTube, Facebook of Twitch) om naar een insluitbare speler-URL, zodat
// supporters de wedstrijd live op de wedstrijdpagina kunnen volgen. Puur & los testbaar.
// Twitch vereist het domein van de site (`parentHost`) als parent-parameter.

export type LivestreamEmbed = { kind: 'embed'; src: string; provider: 'youtube' | 'facebook' | 'twitch' | 'overig' } | { kind: 'link'; href: string }

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const m = u.pathname.match(/^\/(embed|live|shorts|v)\/([^/?]+)/)
    if (m) return m[2]
  }
  return null
}

export function toLivestreamEmbed(raw: string | null | undefined, parentHost?: string): LivestreamEmbed | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  const original = u.toString()

  // YouTube (watch, youtu.be, /live/, /shorts/, /embed/).
  const yt = youtubeId(u)
  if (yt && /^[\w-]{6,}$/.test(yt)) {
    return { kind: 'embed', provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0` }
  }

  // Twitch (kanaal) — heeft het site-domein nodig als parent. Zonder domein: terugval op een link.
  if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
    const seg = u.pathname.split('/').filter(Boolean)
    const channel = seg[0]
    if (channel && !['videos', 'directory', 'collections'].includes(channel)) {
      if (!parentHost) return { kind: 'link', href: original }
      return { kind: 'embed', provider: 'twitch', src: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentHost)}` }
    }
  }

  // Facebook Live → de officiële video-plugin.
  if (host.endsWith('facebook.com') || host === 'fb.watch') {
    return { kind: 'embed', provider: 'facebook', src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(original)}&show_text=false` }
  }

  // Al een insluitbare speler-URL.
  if (u.pathname.includes('/embed/') || host.startsWith('player.') || u.pathname.includes('plugins/video.php')) {
    return { kind: 'embed', provider: 'overig', src: original }
  }

  // Onbekende host: insluiten lukt meestal niet (X-Frame-Options) → bied een nette uitlink.
  return { kind: 'link', href: original }
}
