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

  return (
    <div style={{ marginBottom: 12 }}>
      <a
        href={`/scorekeeper/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn--style-primary btn--size-medium"
        style={{ textDecoration: 'none', display: 'inline-block' }}
      >
        ▶ Open aantekenscherm
      </a>
    </div>
  )
}
