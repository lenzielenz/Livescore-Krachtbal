'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Prullenbakje op een tornooikaart (enkel zichtbaar voor wie mag beheren). Verwijderen ruimt ook
// het hele wedstrijdschema op — dus altijd eerst een expliciete bevestiging met de naam erbij.
export function VerwijderTornooi({ id, naam }: { id: number; naam: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const verwijder = async (e: React.MouseEvent) => {
    // De knop ligt op een Link-kaart: niet doorklikken naar het tornooi.
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`"${naam}" verwijderen? Alle wedstrijden en uitslagen van dit tornooi gaan mee verloren.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tournament/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Verwijderen mislukt.')
      router.refresh()
    } catch (err) {
      window.alert((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="trn-hub-del"
      onClick={verwijder}
      disabled={busy}
      title="Tornooi verwijderen"
      aria-label={`${naam} verwijderen`}
    >
      🗑
    </button>
  )
}
