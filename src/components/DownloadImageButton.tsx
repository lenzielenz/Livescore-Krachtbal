'use client'

import type { ReactNode } from 'react'

/**
 * Rechtstreekse downloadlink naar de server. Een afbeelding eerst met fetch in het geheugen laden
 * en daarna via een tijdelijke blob-link aanklikken werkt onbetrouwbaar op mobiele browsers:
 * vooral iOS verliest na de async fetch de oorspronkelijke gebruikersactie. De API levert zelf
 * Content-Disposition: attachment; daardoor kan de browser de PNG rechtstreeks bewaren.
 */
export function DownloadImageButton({
  href,
  filename,
  className,
  children,
}: {
  href: string
  filename: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      download={filename}
      className={className}
    >
      {children}
    </a>
  )
}
