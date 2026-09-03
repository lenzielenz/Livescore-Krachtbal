'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { PloegVelden, type BeheerClub, type BeheerPloeg } from '@/components/PloegVelden'
import { naarInvoervelden } from '@/lib/wedstrijd-beheer'

export type { BeheerClub, BeheerPloeg }

// Beheerblok onderaan de wedstrijdpagina (enkel federatie/admin): het tijdstip rechtzetten en de
// ploegnaam/club corrigeren, zonder langs de Payload-admin te moeten.
//
// De ploegvelden zelf staan in PloegVelden, want ze horen ook op de ploegpagina — daar bereik je
// een ploeg die (nog) geen wedstrijd heeft.

export function WedstrijdBeheer({
  matchId,
  datumIso,
  thuis,
  uit,
  clubs,
}: {
  matchId: number
  datumIso: string | null
  thuis: BeheerPloeg
  uit: BeheerPloeg
  /** De clubs die deze twee ploegen NU hebben, met hun naam — enkel om te tonen; kiezen gaat via zoeken. */
  clubs: BeheerClub[]
}) {
  const router = useRouter()
  const start = naarInvoervelden(datumIso) ?? { datum: '', uur: '' }
  const [datum, setDatum] = useState(start.datum)
  const [uur, setUur] = useState(start.uur)
  const [busy, setBusy] = useState<string | null>(null)
  const [melding, setMelding] = useState<{ tekst: string; ok: boolean } | null>(null)

  const clubVan = (ploeg: BeheerPloeg) => clubs.find((c) => c.id === ploeg.clubId) ?? null

  const stuur = async (sleutel: string, body: Record<string, unknown>) => {
    setBusy(sleutel)
    setMelding(null)
    try {
      const res = await fetch(`/api/match/${matchId}/beheer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
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

  const ploegRij = (titel: string, ploeg: BeheerPloeg, kant: 'home' | 'away') => (
    <PloegVelden
      titel={titel}
      ploeg={ploeg}
      club={clubVan(ploeg)}
      busy={busy}
      sleutel={`ploeg-${kant}`}
      bewaar={({ naam, clubId, reeks }) =>
        stuur(`ploeg-${kant}`, { action: 'ploeg', kant, naam, clubId, reeks })
      }
      voetnoot="De ploegnaam geldt overal — ook op haar andere wedstrijden en in de rangschikking."
    />
  )

  return (
    <section className="wb-beheer" aria-label="Wedstrijd beheren">
      {/* Met variatieteken (️): zonder rendert dit teken als een leeg blokje i.p.v. een emoji. */}
      <h2 className="wb-beheer-h">🛠️ Wedstrijd rechtzetten</h2>
      <p className="wb-beheer-sub">Enkel zichtbaar voor de federatie. Wijzigingen zijn meteen zichtbaar voor iedereen.</p>

      <div className="wb-beheer-rij">
        <span className="wb-beheer-lbl">Wanneer</span>
        <div className="wb-beheer-velden">
          <label className="wb-beheer-veld">
            <span>Datum</span>
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </label>
          <label className="wb-beheer-veld">
            <span>Aanvangsuur</span>
            <input type="time" value={uur} onChange={(e) => setUur(e.target.value)} />
          </label>
          <button
            type="button"
            className="wb-beheer-btn primair"
            disabled={busy !== null || !datum || !uur}
            onClick={() => void stuur('tijdstip', { action: 'tijdstip', datum, uur })}
          >
            {busy === 'tijdstip' ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
      </div>

      {ploegRij('Thuisploeg', thuis, 'home')}
      {ploegRij('Uitploeg', uit, 'away')}

      {melding && <p className={`wb-beheer-melding ${melding.ok ? 'ok' : 'fout'}`} role="status">{melding.ok ? '✅' : '⚠️'} {melding.tekst}</p>}
    </section>
  )
}
