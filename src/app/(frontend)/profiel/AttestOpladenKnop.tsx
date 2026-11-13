'use client'

import { useState } from 'react'

import { AttestBezorgen } from '@/components/AttestBezorgen'

/** "Attest bezorgen" op Mijn profiel: opent de camera met kader of het opladen, voor dit lid (via zijn QR-code). */
export function AttestOpladenKnop({ code, naam }: { code: string; naam: string }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" className="wb-btn wb-btn-primary" onClick={() => setOpen(true)}>
        📷 Attest bezorgen
      </button>
    )
  }
  return (
    <div style={{ flexBasis: '100%' }}>
      <AttestBezorgen code={code} naam={naam} />
      <button type="button" className="wb-btn" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>
        Sluiten
      </button>
    </div>
  )
}
