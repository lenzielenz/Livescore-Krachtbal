import type { Metadata } from 'next'
import Link from 'next/link'

import { loadReglement } from '@/lib/reglement'
import { ReglementNav } from './ReglementNav'

// Jaarlijks per 1 juli bijgewerkt — herbouw bij wijziging van de markdown.
export const revalidate = 86400

export const metadata: Metadata = {
  title: 'Krachtbalreglement (RCVK) — officiële regels',
  description:
    'Het volledige krachtbalreglement (RCVK, KVKBF) doorzoekbaar online: spelregels, worpen, categorieën, wedstrijdblad en meer.',
  alternates: { canonical: '/reglement' },
}

export default async function ReglementPage() {
  const reglement = await loadReglement()

  if (!reglement) {
    return (
      <div className="site">
        <p className="empty">Reglement niet beschikbaar.</p>
        <Link href="/">← Terug</Link>
      </div>
    )
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Krachtbalreglement (RCVK)',
    inLanguage: 'nl-BE',
    isBasedOn: 'https://www.krachtbal.be/1_RCVK.pdf',
    publisher: { '@type': 'Organization', name: 'KVKBF vzw' },
  }

  return (
    <div className="site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="site-header">
        <h1>
          Reglement <span className="brand">·</span> Krachtbal
        </h1>
        <nav className="site-nav">
          <Link href="/">Live-site</Link>
          <a href="https://www.krachtbal.be/1_RCVK.pdf" target="_blank" rel="noopener noreferrer">
            Officiële PDF
          </a>
        </nav>
      </header>
      <p className="empty">
        Bron: <strong>{reglement.bron}</strong>. Dit is dezelfde tekst die de regellogica van het platform voedt.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 32, alignItems: 'start' }}>
        <aside>
          <ReglementNav toc={reglement.toc} />
        </aside>
        <article
          className="reglement-body"
          style={{ maxWidth: 760, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: reglement.html }}
        />
      </div>
    </div>
  )
}
