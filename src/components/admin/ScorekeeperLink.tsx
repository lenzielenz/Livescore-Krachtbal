'use client'

import { useDocumentInfo } from '@payloadcms/ui'

// UI-veld in de Wedstrijd-edit-view: snelkoppeling naar het aantekenscherm.
export function ScorekeeperLink() {
  const { id } = useDocumentInfo()

  if (!id) {
    return (
      <div style={{ marginBottom: 12 }}>
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13 }}>
          Sla de wedstrijd eerst op; daarna verschijnt hier de knop om het aantekenscherm te openen.
        </p>
      </div>
    )
  }

  const links: { href: string; label: string }[] = [
    { href: `/scorekeeper/${id}`, label: '▶ Aantekenscherm' },
    { href: `/opstelling/${id}`, label: '👥 Opstelling (clubs)' },
    { href: `/scheidsrechter/${id}`, label: '🧑‍⚖️ Scheidsrechter' },
    { href: `/aftekenen/${id}`, label: '✍️ Aftekenen' },
  ]
  return (
    <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--style-secondary btn--size-medium"
          style={{ textDecoration: 'none', display: 'inline-block' }}
        >
          {l.label}
        </a>
      ))}
    </div>
  )
}
