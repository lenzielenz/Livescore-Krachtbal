import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Krachtbal Cast',
  // De ontvanger hoort niet in zoekresultaten of app-installaties thuis.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#06140d',
  width: 'device-width',
  initialScale: 1,
}

// Kale root-layout voor de Chromecast-ontvanger: geen navigatie, lettertypes,
// admin-balk of toaster — enkel een schermvullend, donker kader waarin het
// gecaste scherm verschijnt.
export default function CastLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, background: '#06140d', overflow: 'hidden' }}>{children}</body>
    </html>
  )
}
