'use client'

import { useState } from 'react'

import { type LogoFit, logoFitStyle } from '@/lib/logo-fit'
import './team-logo.css'

type NamedSize = 'xs' | 'sm' | 'md' | 'lg'

export type TeamLogoProps = {
  name: string
  logoUrl: string | null
  logoFit?: LogoFit | null
  /** Zijde-accent: kleurt de ring rond de badge (thuis = groen, uit = blauw). */
  side?: 'home' | 'away' | null
  /** Vaste maat (xs/sm/md/lg) of een eigen CSS-lengte (bv. `clamp(80px, 14vw, 200px)`). */
  size?: NamedSize | number | string
  /** Zachte zweef-animatie — bedoeld voor grote schermen (scorebord/veld). */
  float?: boolean
  /** Kleurt de ring rond de badge met de clubkleur; valt anders terug op het zijde-accent. */
  ringColor?: string | null
}

const NAMED: NamedSize[] = ['xs', 'sm', 'md', 'lg']

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

// Gedeelde clublogo-badge. Overal identiek opgebouwd zodat een logo er op elk scherm
// (home, live-lijst, scorebord, kantine, veld) exact hetzelfde en verzorgd uitziet.
// Valt terug op de initialen van de ploeg als er geen logo is of het laden mislukt.
export function TeamLogo({ name, logoUrl, logoFit, side, size = 'md', float, ringColor }: TeamLogoProps) {
  const [failed, setFailed] = useState(false)

  const named = typeof size === 'string' && (NAMED as string[]).includes(size)
  const sizeClass = named ? `tl-${size}` : ''
  const style: React.CSSProperties = {}
  if (!named) {
    const v = typeof size === 'number' ? `${size}px` : size
    style.width = v
    style.height = v
    style.fontSize = v
  }
  // Clubkleur als ring; valt anders terug op het zijde-accent uit de CSS.
  if (ringColor) {
    ;(style as Record<string, string>)['--tl-ring'] = `color-mix(in srgb, ${ringColor} 70%, transparent)`
  }
  // Premium glans: een lichte veeg die af en toe over de badge loopt. Per club een eigen vertraging
  // (uit de naam afgeleid) zodat niet alle logo's tegelijk glanzen — dat oogt natuurlijker/duurder.
  const sheenDelay = (Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 70) / 10
  ;(style as Record<string, string>)['--tl-sheen-delay'] = `${sheenDelay}s`

  const cls = ['tl', sizeClass, side ? `tl-${side}` : '', float ? 'tl-float' : ''].filter(Boolean).join(' ')

  return (
    <span className={cls} style={Object.keys(style).length ? style : undefined}>
      {logoUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" style={logoFitStyle(logoFit)} onError={() => setFailed(true)} />
      ) : (
        <span className="tl-init">{initialsFor(name)}</span>
      )}
    </span>
  )
}
