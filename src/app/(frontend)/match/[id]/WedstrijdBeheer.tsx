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

// Forfait-opties: de niet-forfaiterende ploeg wint 30–0 (dubbel: 0–0) — zie forfaitScore()
// in lib/standings.ts. Dezelfde actie als op het scheidsrechtersblad (/scheidsrechter/[matchId]),
// enkel sneller bereikbaar vanaf de wedstrijdpagina zelf, voor het moment dat de melding "ploeg X
// geeft forfait" binnenkomt.
const FORFAIT_OPTIES = (thuisNaam: string, uitNaam: string): { value: string; label: string }[] => [
  { value: 'geen', label: 'Geen forfait' },
  { value: 'thuis', label: `${thuisNaam || 'Thuis'} gaf forfait` },
  { value: 'uit', label: `${uitNaam || 'Uit'} gaf forfait` },
  { value: 'dubbel', label: 'Dubbel forfait' },
]

export function WedstrijdBeheer({
  matchId,
  datumIso,
  thuis,
  uit,
  clubs,
  thuisNaam = '',
  uitNaam = '',
  initialForfaitUitslag = 'geen',
}: {
  matchId: number
  datumIso: string | null
  thuis: BeheerPloeg
  uit: BeheerPloeg
  /** De clubs die deze twee ploegen NU hebben, met hun naam — enkel om te tonen; kiezen gaat via zoeken. */
  clubs: BeheerClub[]
  /** Voor leesbare forfait-knoppen ("KBC Male gaf forfait" i.p.v. "Thuis gaf forfait"). */
  thuisNaam?: string
  uitNaam?: string
  /** Huidige forfait-uitslag van het wedstrijdblad ('geen' als er nog geen is). */
  initialForfaitUitslag?: string
}) {
  const router = useRouter()
  const start = naarInvoervelden(datumIso) ?? { datum: '', uur: '' }
  const [datum, setDatum] = useState(start.datum)
  const [uur, setUur] = useState(start.uur)
  const [busy, setBusy] = useState<string | null>(null)
  const [melding, setMelding] = useState<{ tekst: string; ok: boolean } | null>(null)
  const [ffUitslag, setFfUitslag] = useState(initialForfaitUitslag)
  const [ffSaved, setFfSaved] = useState(initialForfaitUitslag)

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

  const opties = FORFAIT_OPTIES(thuisNaam, uitNaam)
  const saveForfait = async () => {
    setBusy('forfait')
    setMelding(null)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/referee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'forfait', uitslag: ffUitslag }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; score?: { home: number; away: number } | null }
      if (!res.ok || !json.ok) {
        setMelding({ tekst: json.error || 'Opslaan mislukt.', ok: false })
        return
      }
      setFfSaved(ffUitslag)
      setMelding({
        tekst: json.score
          ? `Forfait toegepast — uitslag ${json.score.home}–${json.score.away}. De wedstrijd staat als afgelopen.`
          : 'Forfait verwijderd — de wedstrijd staat terug op gepland.',
        ok: true,
      })
      router.refresh()
    } catch {
      setMelding({ tekst: 'Netwerkfout — probeer opnieuw.', ok: false })
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
    <details className="wb-beheer wb-beheer-inklapbaar">
      <summary className="wb-beheer-summary">
        <span>🛠️ Wedstrijd aanpassen</span>
        <small>Federatiebeheer</small>
      </summary>
      <div className="wb-beheer-inhoud">
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

      <div className={`wb-beheer-rij ${ffSaved !== 'geen' ? 'wb-beheer-rij-ff' : ''}`}>
        <span className="wb-beheer-lbl">Forfait (FF)</span>
        <p className="wb-beheer-tip dim">
          Ploeg niet opgedaagd? Duid meteen aan wie forfait gaf — de uitslag (30–0 / 0–30 / 0–0) komt
          er meteen op te staan en de wedstrijd sluit af, met 4 punten voor de winnaar en 0 voor de forfaitgever.
        </p>
        <div className="wb-beheer-opties">
          {opties.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`wb-beheer-optie ${ffUitslag === o.value ? 'actief' : ''}`}
              onClick={() => setFfUitslag(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {ffSaved !== 'geen' && (
          <p className="wb-beheer-tip" style={{ color: 'var(--pop)' }}>
            Forfait toegepast ({opties.find((o) => o.value === ffSaved)?.label}) — de wedstrijd staat als afgelopen met de forfait-uitslag.
          </p>
        )}
        <button
          type="button"
          className="wb-beheer-btn primair"
          disabled={busy !== null || ffUitslag === ffSaved}
          onClick={() => void saveForfait()}
          style={{ marginTop: 10 }}
        >
          {busy === 'forfait' ? 'Bezig…' : ffUitslag === 'geen' && ffSaved !== 'geen' ? 'Forfait verwijderen' : 'Forfait toepassen'}
        </button>
      </div>

      {melding && <p className={`wb-beheer-melding ${melding.ok ? 'ok' : 'fout'}`} role="status">{melding.ok ? '✅' : '⚠️'} {melding.tekst}</p>}
      </div>
    </details>
  )
}
