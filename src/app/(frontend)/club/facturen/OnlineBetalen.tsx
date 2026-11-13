'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'

/** "Online betalen": vraagt een betaalpagina aan (Mollie) en stuurt de gebruiker erheen. */
export function OnlineBetalen({ id }: { id: number }) {
  const [bezig, setBezig] = useState(false)
  return (
    <button
      type="button"
      className="wb-btn wb-btn-primary"
      disabled={bezig}
      onClick={async () => {
        setBezig(true)
        try {
          const res = await fetch(`/api/facturen/${id}/online`, { method: 'POST', credentials: 'include' })
          const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
          if (res.ok && j.url) window.location.href = j.url
          else toast('error', j.error ?? 'Online betalen lukte niet.')
        } finally {
          setBezig(false)
        }
      }}
    >
      {bezig ? 'Even geduld…' : '💳 Online betalen'}
    </button>
  )
}
