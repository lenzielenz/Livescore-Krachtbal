import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { formatDateBE } from '@/lib/datetime'
import { loadReglement, loadWijzigingen } from '@/lib/reglement'
import { ReglementNav } from './ReglementNav'

// De federatie kan een nieuwe versie en verslagen toevoegen (/federatie/reglement): elke 5 minuten vers.
export const revalidate = 300

export const metadata: Metadata = {
  title: 'Krachtbalreglement (RCVK) — officiële regels',
  description:
    'Het volledige krachtbalreglement (RCVK, KVKBF) doorzoekbaar online: spelregels, worpen, categorieën, wedstrijdblad en meer.',
  alternates: { canonical: '/reglement' },
}

export default async function ReglementPage() {
  const reglement = await loadReglement()
  const wijzigingen = await loadWijzigingen().catch(() => ({ verslagen: [], regels: [] }))

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

      {(wijzigingen.verslagen.length > 0 || wijzigingen.regels.length > 0) && (
        <section className="wb-card" style={{ marginBottom: 24 }}>
          {wijzigingen.verslagen.length > 0 && (
            <>
              <h2>Verslagen met wijzigingen ({wijzigingen.verslagen.length})</h2>
              <p className="wb-sub">Deze verslagen horen bij het reglement en zijn van toepassing.</p>
              {wijzigingen.verslagen.map((v) => (
                <details key={v.id} style={{ marginTop: 8 }}>
                  <summary>
                    <strong>{v.titel}</strong> · {formatDateBE(v.datum)}
                    {v.artikel ? ` · ${v.artikel}` : ''}
                  </summary>
                  <div className="reglement-body" style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: v.html }} />
                </details>
              ))}
            </>
          )}
          {wijzigingen.regels.length > 0 && (
            <>
              <h2 style={{ marginTop: 16 }}>Wat het platform automatisch toepast</h2>
              <ul>
                {wijzigingen.regels.map((r) => (
                  <li key={r.id}>
                    <strong>{r.naam}</strong>: {r.samenvatting} <span className="wb-sub">(bron: {r.bron || '—'})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

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
