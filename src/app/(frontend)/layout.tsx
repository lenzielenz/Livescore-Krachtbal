import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import React from 'react'
import './styles.css'

// Premium typografie: Sora als display-lettertype (titels, merk, scores), Inter voor tekst.
const display = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' })
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  description: 'Live-score en wedstrijdstatistieken voor krachtbal.',
  title: 'Krachtbal Live',
  manifest: '/manifest.webmanifest',
  // iOS: open als app vanaf het beginscherm (standalone, geen browserbalk).
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Krachtbal' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#06140d',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="nl" className={`${display.variable} ${body.variable}`}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
