import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import React from 'react'

import { Installeren } from '@/components/Installeren'
import { ServiceWorker } from '@/components/ServiceWorker'
import { SessieVerlengen } from '@/components/SessieVerlengen'
import { TestOmgevingBand } from '@/components/TestOmgevingBand'
import { Toaster } from '@/components/Toaster'
import { isDemoOmgeving, isTestOmgeving } from '@/lib/omgeving'
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
  // iOS gebruikt voor het beginscherm de PNG apple-touch-icon (geen SVG); Android pakt de PNG's
  // uit het manifest. De SVG blijft het scherpe favicon in de browser.
  icons: { icon: '/icon.svg', apple: '/apple-icon-180.png' },
  // De federatie-testomgeving hoort niet in zoekmachines (zie omgeving.ts).
  ...(isTestOmgeving() ? { title: 'Krachtbal Live · TEST', robots: { index: false, follow: false } } : {}),
  ...(isDemoOmgeving() ? { title: 'Krachtbal Live · DEMO', robots: { index: false, follow: false } } : {}),
}

export const viewport: Viewport = {
  themeColor: '#06140d',
}

export default function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="nl" className={`${display.variable} ${body.variable}`}>
      <body>
        <TestOmgevingBand />
        <main>{children}</main>
        {/* Kleine voettekst met de pagina's die een app-winkel (en de wet) verwacht: het
            privacybeleid en hoe je je account verwijdert. Bewust minimaal — geen linkfabriek. */}
        <footer className="site-foot">
          <a href="/privacy">Privacybeleid</a>
          <span aria-hidden>·</span>
          <a href="/account-verwijderen">Account verwijderen</a>
          <span aria-hidden>·</span>
          <a href="/reglement">Reglement</a>
        </footer>
        <Toaster />
        <ServiceWorker />
        <SessieVerlengen />
        <Installeren />
      </body>
    </html>
  )
}
