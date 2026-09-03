'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { clubVanPloeg, naamSleutel } from '@/lib/season-import'
import { naarInvoervelden } from '@/lib/wedstrijd-beheer'

import './wedstrijd-beheer.css'

export type BeheerClub = { id: number; naam: string }
export type BeheerPloeg = { id: number; naam: string; clubId: number | null }

// Beheerblok onderaan de wedstrijdpagina (enkel federatie/admin): het tijdstip rechtzetten en de
// ploegnaam/club corrigeren, zonder langs de Payload-admin te moeten.
//
// De club staat er bewust bij. De aanleiding was niet de naam op zich maar wat eraan hangt: het
// logo en de kleuren komen van de CLUB, dus een ploeg onder de verkeerde club toont het verkeerde
// (of geen) logo. Zodra je de naam aanpast, stelt het formulier de club voor die uit die naam
// volgt — dezelfde regel als de import ("KBC St. Michiels A-1" → "KBC St. Michiels").

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
  clubs: BeheerClub[]
}) {
  const router = useRouter()
  const start = naarInvoervelden(datumIso) ?? { datum: '', uur: '' }
  const [datum, setDatum] = useState(start.datum)
  const [uur, setUur] = useState(start.uur)
  const [busy, setBusy] = useState<string | null>(null)
  const [melding, setMelding] = useState<{ tekst: string; ok: boolean } | null>(null)

  // Clubnaam → id, om bij een ploegnaam de bijhorende club te kunnen voorstellen.
  const clubOpNaam = useMemo(() => new Map(clubs.map((c) => [naamSleutel(c.naam), c.id])), [clubs])

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

      <PloegRij
        titel="Thuisploeg"
        ploeg={thuis}
        kant="home"
        clubs={clubs}
        clubOpNaam={clubOpNaam}
        busy={busy}
        stuur={stuur}
      />
      <PloegRij
        titel="Uitploeg"
        ploeg={uit}
        kant="away"
        clubs={clubs}
        clubOpNaam={clubOpNaam}
        busy={busy}
        stuur={stuur}
      />

      {melding && <p className={`wb-beheer-melding ${melding.ok ? 'ok' : 'fout'}`} role="status">{melding.ok ? '✅' : '⚠️'} {melding.tekst}</p>}
    </section>
  )
}

function PloegRij({
  titel,
  ploeg,
  kant,
  clubs,
  clubOpNaam,
  busy,
  stuur,
}: {
  titel: string
  ploeg: BeheerPloeg
  kant: 'home' | 'away'
  clubs: BeheerClub[]
  clubOpNaam: Map<string, number>
  busy: string | null
  stuur: (sleutel: string, body: Record<string, unknown>) => Promise<boolean>
}) {
  const [naam, setNaam] = useState(ploeg.naam)
  const [clubId, setClubId] = useState<string>(ploeg.clubId != null ? String(ploeg.clubId) : '')
  const sleutel = `ploeg-${kant}`

  // De club die uit de ingetypte naam volgt. Bestaat ze, dan stellen we ze voor; anders zwijgen we
  // liever dan een club te noemen die er niet is.
  const voorstel = clubOpNaam.get(naamSleutel(clubVanPloeg(naam))) ?? null
  const toonVoorstel = voorstel != null && String(voorstel) !== clubId

  return (
    <div className="wb-beheer-rij">
      <span className="wb-beheer-lbl">{titel}</span>
      <div className="wb-beheer-velden">
        <label className="wb-beheer-veld breed">
          <span>Ploegnaam</span>
          <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label className="wb-beheer-veld breed">
          <span>Club (logo &amp; kleuren)</span>
          <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            <option value="">— Geen club —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.naam}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="wb-beheer-btn primair"
          disabled={busy !== null || !naam.trim() || (naam === ploeg.naam && clubId === (ploeg.clubId != null ? String(ploeg.clubId) : ''))}
          onClick={() => void stuur(sleutel, { action: 'ploeg', kant, naam, ...(clubId ? { clubId: Number(clubId) } : {}) })}
        >
          {busy === sleutel ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>
      {toonVoorstel && (
        <p className="wb-beheer-tip">
          Bij deze naam hoort <strong>{clubs.find((c) => c.id === voorstel)?.naam}</strong>.{' '}
          <button type="button" className="wb-beheer-link" onClick={() => setClubId(String(voorstel))}>Die club kiezen</button>
        </p>
      )}
      <p className="wb-beheer-tip dim">De ploegnaam geldt overal — ook op haar andere wedstrijden en in de rangschikking.</p>
    </div>
  )
}
