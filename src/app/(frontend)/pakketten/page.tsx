import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { PACKAGES_ENABLED, PACKAGE_LIST } from '@/lib/packages'
import './pakketten.css'

export const metadata: Metadata = {
  title: 'Pakketten — Krachtbal Live',
  description:
    'Drie pakketten voor Krachtbal Live: van snel live scoren tot volledige spelerstatistieken, heatmaps en meters per speler.',
  alternates: { canonical: '/pakketten' },
}

// Wat elk pakket aan statistieken ontsluit (voor de vergelijkingstabel).
const STAT_ROWS: { label: string; key: keyof (typeof PACKAGE_LIST)[number]['stats'] }[] = [
  { label: 'Heatmap van de worpen', key: 'heatmap' },
  { label: 'Meters per speler', key: 'metersPerPlayer' },
  { label: 'Vergelijkende ploegstatistieken', key: 'teamCompare' },
  { label: 'Shot map per worp', key: 'shotmapDots' },
  { label: 'Volledige spelerstabel', key: 'playerTable' },
  { label: 'Speler-kaarten met trajecten', key: 'playerCards' },
]

export default function PakkettenPage() {
  // Pakket-feature gedeactiveerd: de prijzenpagina is niet beschikbaar.
  if (!PACKAGES_ENABLED) notFound()

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <header className="pk-hero">
          <h1>Pakketten</h1>
          <p>
            Kies hoe diep je wedstrijd geanalyseerd wordt. Van snel live scoren tot alle data die het
            model aanbiedt. Een pakket hoort bij je club en geldt voor al je wedstrijden.
          </p>
          <p className="pk-disclaimer">Prijzen zijn voorlopig en indicatief.</p>
        </header>

        <div className="pk-cards">
          {PACKAGE_LIST.map((pkg) => (
            <div key={pkg.tier} className={`pk-card${pkg.highlight ? ' pk-card-hl' : ''}`}>
              {pkg.highlight && <span className="pk-badge">Aanbevolen</span>}
              <h2 className="pk-name">{pkg.name}</h2>
              <p className="pk-tagline">{pkg.tagline}</p>
              <p className="pk-price">
                <span className="pk-amount">€{pkg.priceMonthly}</span>
                <span className="pk-per">/ maand</span>
              </p>
              <p className="pk-mode">
                {pkg.scoringMode === 'simple'
                  ? '⚡ Snel scoren (+1 nek / +2 rug)'
                  : '🎯 Volledig veldscherm (worp per worp)'}
              </p>
              <ul className="pk-features">
                {pkg.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h2 className="pk-table-title">Statistieken per pakket</h2>
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th>Statistiek</th>
                {PACKAGE_LIST.map((pkg) => (
                  <th key={pkg.tier}>{pkg.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  {PACKAGE_LIST.map((pkg) => (
                    <td key={pkg.tier} className={pkg.stats[row.key] ? 'yes' : 'no'}>
                      {pkg.stats[row.key] ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
