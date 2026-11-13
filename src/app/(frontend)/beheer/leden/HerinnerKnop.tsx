'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'

/** Eén club herinneren aan wat niet in orde is (lib/leden-overzicht-server.ts → herinneringVersturen). */
export function HerinnerKnop({ clubId, clubNaam, aan, laatst }: { clubId: number; clubNaam: string; aan: string[]; laatst: string | null }) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  if (!aan.length) return <span className="led-nul" title="Geen clubbeheerder of -medewerker met een account">geen staf</span>
  const stuur = async () => {
    if (!window.confirm(`Herinnering sturen naar ${clubNaam}?\nAan: ${aan.join(', ')}`)) return
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/herinnering', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ clubId }) })
      const d = (await res.json().catch(() => ({}))) as { error?: string; verstuurd?: unknown[]; zonder?: string[] }
      if (!res.ok) return toast('error', d.error ?? 'Versturen mislukt.')
      toast('success', d.verstuurd?.length ? `Herinnering verstuurd naar ${aan.length} ${aan.length === 1 ? 'persoon' : 'personen'}.` : (d.zonder?.[0] ?? 'Niets te herinneren.'))
      router.refresh()
    } finally {
      setBezig(false)
    }
  }
  return (
    <span className="led-herinner">
      <button type="button" className="ft-btn" disabled={bezig} onClick={() => void stuur()}>
        {bezig ? 'Bezig…' : '🔔 Herinneren'}
      </button>
      {laatst && <span className="led-dim"> laatst {laatst}</span>}
    </span>
  )
}
