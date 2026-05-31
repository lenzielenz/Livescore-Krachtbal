import React from 'react'
import './styles.css'

export const metadata = {
  description: 'Live-score en wedstrijdstatistieken voor krachtbal.',
  title: 'Krachtbal Live',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="nl">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
