import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import React from 'react'

import { AdminBar } from '@/components/AdminBar'
import { Toaster } from '@/components/Toaster'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { readPackagePreview } from '@/lib/package-preview'
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

// De layout leest per request de sessie (admin-balk) via cookies/headers; daarom
// rendert de hele frontend dynamisch i.p.v. statisch te prerenderen tijdens de
// build (waar geen sessie/secret beschikbaar is).
export const dynamic = 'force-dynamic'

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  // Admin/federatie krijgt bovenaan elke pagina een balk: badge + pakket-preview.
  const user = await getAuthUser()
  const privileged = isFederationLevel(user)
  const preview = await readPackagePreview(privileged)
  const role = hasRole(user, 'admin') ? 'Admin' : 'Federatie'

  return (
    <html lang="nl" className={`${display.variable} ${body.variable}`}>
      <body>
        {privileged && <AdminBar role={role} preview={preview} />}
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
