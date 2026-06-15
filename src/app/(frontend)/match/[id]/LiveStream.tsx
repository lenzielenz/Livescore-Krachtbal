'use client'

import { useEffect, useState } from 'react'

import { toLivestreamEmbed } from '@/lib/livestream'
import './livestream.css'

// Toont de live-uitzending van de wedstrijd (YouTube/Facebook/Twitch). Twitch heeft het
// site-domein nodig als parent; dat lezen we client-side uit window.location.
export function LiveStream({ url, live }: { url: string; live?: boolean }) {
  const [host, setHost] = useState('')
  useEffect(() => setHost(window.location.hostname), [])

  const embed = toLivestreamEmbed(url, host)
  if (!embed) return null

  return (
    <section className="ls">
      <div className="ls-head">
        <span className="ls-title">📺 Live bekijken</span>
        {live && <span className="ls-badge">LIVE</span>}
      </div>
      {embed.kind === 'embed' ? (
        <div className="ls-frame">
          <iframe
            src={embed.src}
            title="Livestream"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <a className="ls-link" href={embed.href} target="_blank" rel="noopener noreferrer">
          ▶ Bekijk de livestream →
        </a>
      )}
    </section>
  )
}
