'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
  /** Bij een tik verschijnt een groot, metallic-glanzend medaillon dat eventjes ronddraait. */
  medallion?: boolean
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
export function TeamLogo({ name, logoUrl, logoFit, side, size = 'md', float, ringColor, medallion }: TeamLogoProps) {
  const [failed, setFailed] = useState(false)
  // Medaillon-onthulling: tik op de badge → groot glanzend medaillon dat eventjes draait.
  const [coin, setCoin] = useState(false)
  useEffect(() => {
    if (!coin) return
    const t = setTimeout(() => setCoin(false), 2300)
    return () => clearTimeout(t)
  }, [coin])

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

  const cls = ['tl', sizeClass, side ? `tl-${side}` : '', float ? 'tl-float' : '', medallion ? 'tl-tappable' : '']
    .filter(Boolean)
    .join(' ')

  const inner =
    logoUrl && !failed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" style={logoFitStyle(logoFit)} onError={() => setFailed(true)} />
    ) : (
      <span className="tl-init">{initialsFor(name)}</span>
    )

  const showCoin = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setCoin(true)
  }

  return (
    <>
      <span
        className={cls}
        style={Object.keys(style).length ? style : undefined}
        onClick={medallion ? showCoin : undefined}
        role={medallion ? 'button' : undefined}
        tabIndex={medallion ? 0 : undefined}
        aria-label={medallion ? `${name} — toon medaillon` : undefined}
        title={medallion ? 'Tik voor het medaillon' : undefined}
        onKeyDown={
          medallion
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  showCoin(e)
                }
              }
            : undefined
        }
      >
        {inner}
      </span>
      {coin &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="tl-medal-ov" onClick={() => setCoin(false)} role="presentation">
            <div className="tl-medal">
              <div className="tl-medal-face">{inner}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
