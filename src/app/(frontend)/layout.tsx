import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import React from 'react'

import { AdminBar } from '@/components/AdminBar'
import { Toaster } from '@/components/Toaster'
import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { PACKAGES_ENABLED } from '@/lib/packages'
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

// De renderwijze volgt automatisch: met de pakket-feature actief leest de
// admin-balk de sessie via cookies/headers (→ dynamisch); is de feature uit, dan
// raakt de layout geen request-API's aan en mag de frontend statisch
// geprerenderd worden (zoals vóór de pakketten).
async function renderAdminBar() {
  if (!PACKAGES_ENABLED) return null
  // Admin/federatie krijgt bovenaan elke pagina een balk: badge + pakket-preview.
  const user = await getAuthUser()
  if (!isFederationLevel(user)) return null
  const preview = await readPackagePreview(true)
  const role = hasRole(user, 'admin') ? 'Admin' : 'Federatie'
  return <AdminBar role={role} preview={preview} />
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="nl" className={`${display.variable} ${body.variable}`}>
      <body>
        {await renderAdminBar()}
        <main>{children}</main>
        <Toaster />
      </body>
    </html>
  )
}
