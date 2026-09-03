'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { PloegVelden, type BeheerClub, type BeheerPloeg } from '@/components/PloegVelden'

// Beheerblok onderaan de ploegpagina (enkel federatie/admin): de ploegnaam rechtzetten en haar
// onder de juiste club hangen.
//
// Dit staat hier én op de wedstrijdpagina, en dat is geen dubbel werk maar een tweede ingang. Via
// een wedstrijd bereik je alleen ploegen die er al een hebben; hier kom je uit op de ploeg zelf —
// precies waar je staat als je haar agenda of haar logo aan het nakijken bent.

export function PloegBeheer({ ploeg, club }: { ploeg: BeheerPloeg; club: BeheerClub | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [melding, setMelding] = useState<{ tekst: string; ok: boolean } | null>(null)

  const bewaar = async ({ naam, clubId, reeks }: { naam: string; clubId: number | null; reeks: string }) => {
    setBusy('ploeg')
    setMelding(null)
    try {
      const res = await fetch(`/api/ploeg/${ploeg.id}/beheer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // clubId gaat altijd mee, ook als null: dat is het verschil tussen "laat de club met rust"
        // en "koppel ze los".
        body: JSON.stringify({ naam, clubId, reeks }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setMelding({ tekst: json.error || 'Opslaan mislukt.', ok: false })
        return false
      }
      setMelding({ tekst: 'Opgeslagen.', ok: true })
      router.refresh()
      return true
    } catch {
      setMelding({ tekst: 'Netwerkfout — probeer opnieuw.', ok: false })
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="wb-beheer" aria-label="Ploeg beheren">
      {/* Met variatieteken (️): zonder rendert dit teken als een leeg blokje i.p.v. een emoji. */}
      <h2 className="wb-beheer-h">🛠️ Ploeg rechtzetten</h2>
      <p className="wb-beheer-sub">Enkel zichtbaar voor de federatie. Wijzigingen zijn meteen zichtbaar voor iedereen.</p>

      <PloegVelden
        titel="Deze ploeg"
        ploeg={ploeg}
        club={club}
        busy={busy}
        sleutel="ploeg"
        bewaar={bewaar}
        voetnoot="De naam en de club gelden overal — op al haar wedstrijden, op het live-bord, in de rangschikking en op het kantinescherm."
      />

      {melding && <p className={`wb-beheer-melding ${melding.ok ? 'ok' : 'fout'}`} role="status">{melding.ok ? '✅' : '⚠️'} {melding.tekst}</p>}
    </section>
  )
}
