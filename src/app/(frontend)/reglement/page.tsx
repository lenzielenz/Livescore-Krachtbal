import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
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
      <>
        <SiteHeader active="federatie" />
        <div className="site">
          <p className="empty">Reglement niet beschikbaar.</p>
          <Link href="/">← Terug</Link>
        </div>
      </>
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
    <>
      <SiteHeader active="federatie" />
      <div className="site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="page-title">
        Reglement <span className="brand">·</span> Krachtbal
      </h1>
      <p className="page-sub">
        Officiële bron:{' '}
        <a href="https://www.krachtbal.be/1_RCVK.pdf" target="_blank" rel="noopener noreferrer">
          Officiële PDF (RCVK)
        </a>
      </p>
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
    </>
  )
}
