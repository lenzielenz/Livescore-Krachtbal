'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

/** Knop "Medische kaart aanvragen" — voor jezelf (playerId leeg) of als club voor een lid. */
export function KaartAanvragen({ open, playerId, klein }: { open: boolean; playerId?: number; klein?: boolean }) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  if (open) return klein ? <span className="cl-sub">🩺 kaart aangevraagd</span> : <p className="wb-sub">🩺 Je aanvraag ligt bij de federatie.</p>
  return (
    <button
      type="button"
      className={klein ? 'cl-btn' : 'wb-btn wb-btn-primary'}
      disabled={bezig}
      onClick={async () => {
        setBezig(true)
        try {
          const res = await fetch('/api/medische-kaart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(playerId != null ? { playerId } : {}),
          })
          const d = (await res.json().catch(() => ({}))) as { error?: string }
          if (!res.ok) return toast('error', d.error ?? 'Aanvragen mislukt.')
          toast('success', playerId != null ? 'Aangevraagd bij de federatie; het lid krijgt een melding.' : 'Aangevraagd bij de federatie; je club krijgt een melding.')
          router.refresh()
        } finally {
          setBezig(false)
        }
      }}
    >
      🩺 Medische kaart aanvragen
    </button>
  )
}
