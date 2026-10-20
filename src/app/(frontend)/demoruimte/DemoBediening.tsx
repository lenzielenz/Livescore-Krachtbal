'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { wisselRol } from '@/components/DemoRolWissel'

export function CodeInvoer() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  return (
    <form
      className="dr-code"
      onSubmit={async (e) => {
        e.preventDefault()
        const res = await fetch('/api/demoruimte/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
        if (!res.ok) return setFout('Die code klopt niet.')
        router.refresh()
      }}
    >
      <p>Geef de toegangscode van de demoruimte.</p>
      <input type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} aria-label="Toegangscode" />
      <button type="submit" className="dr-knop">
        Binnen
      </button>
      {fout && <p className="dr-fout">{fout}</p>}
    </form>
  )
}

export function Klaarzetten({ klaar }: { klaar: boolean }) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [verslag, setVerslag] = useState<{ ok: boolean; stappen: string[]; fout?: string; duurMs: number } | null>(null)
  return (
    <div className="dr-klaar">
      <button
        type="button"
        className="dr-knop"
        disabled={bezig}
        onClick={async () => {
          if (klaar && !window.confirm('Alles in de demo wissen en opnieuw klaarzetten? Wat je tijdens een vorige demo deed, verdwijnt.')) return
          setBezig(true)
          setVerslag(null)
          try {
            const res = await fetch('/api/demoruimte/klaarzetten', { method: 'POST' })
            setVerslag((await res.json().catch(() => ({ ok: false, stappen: [], fout: 'Onverwacht antwoord.', duurMs: 0 }))) as never)
            router.refresh()
          } catch {
            setVerslag({ ok: false, stappen: [], fout: 'Geen verbinding.', duurMs: 0 })
          } finally {
            setBezig(false)
          }
        }}
      >
        {bezig ? '⏳ Bezig met klaarzetten… (± 1 minuut)' : klaar ? '↻ Opnieuw klaarzetten' : '▶ Demo klaarzetten'}
      </button>
      {verslag && (
        <div className={verslag.ok ? 'dr-verslag' : 'dr-verslag dr-fout'} role="status">
          <strong>{verslag.ok ? `✅ Klaar in ${Math.round(verslag.duurMs / 1000)} s` : `⚠️ ${verslag.fout}`}</strong>
          <ul>
            {verslag.stappen.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Enkel het referendum opnieuw klaarzetten (stemmen en uitslag weg, verse open ronde), zonder de
// rest van de demo te wissen: om het stemmen of de bekendmaking nog eens te tonen.
export function ReferendumReset() {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null)
  return (
    <div className="dr-reset">
      <button
        type="button"
        className="dr-knop dr-knop-klein"
        disabled={bezig}
        onClick={async () => {
          if (!window.confirm('Het referendum resetten? Alle stemmen en de bekendgemaakte uitslag van dit seizoen verdwijnen.')) return
          setBezig(true)
          setMelding(null)
          try {
            const res = await fetch('/api/demoruimte/referendum', { method: 'POST' })
            const j = (await res.json().catch(() => ({}))) as { ok?: boolean; melding?: string; error?: string }
            setMelding({ ok: Boolean(j.ok), tekst: j.ok ? String(j.melding ?? 'Gereset.') : String(j.error ?? 'Resetten mislukt.') })
            router.refresh()
          } catch {
            setMelding({ ok: false, tekst: 'Geen verbinding.' })
          } finally {
            setBezig(false)
          }
        }}
      >
        {bezig ? '⏳ Bezig…' : '↻ Referendum resetten'}
      </button>
      {melding && (
        <span className={melding.ok ? 'dr-reset-ok' : 'dr-reset-fout'} role="status">
          {melding.ok ? '✅ ' : '⚠️ '}
          {melding.tekst}
        </span>
      )}
    </div>
  )
}

export function RolKiezer({ huidig, rollen }: { huidig: string | null; rollen: { sleutel: string; label: string; naam: string; icoon: string; start: string }[] }) {
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const kies = async (sleutel: string, start: string) => {
    setBezig(sleutel)
    setFout(null)
    const f = await wisselRol(sleutel, start)
    if (f) {
      setFout(f)
      setBezig(null)
    }
  }
  return (
    <>
      <div className="dr-rollen">
        {rollen.map((r) => (
          <button key={r.sleutel} type="button" className={`dr-rol ${huidig === r.sleutel ? 'aan' : ''}`} disabled={bezig != null} onClick={() => void kies(r.sleutel, r.start)}>
            <span className="dr-rol-icoon">{r.icoon}</span>
            <span className="dr-rol-label">{r.label}</span>
            <span className="dr-rol-naam">{bezig === r.sleutel ? 'Even…' : r.naam}</span>
          </button>
        ))}
        <button type="button" className={`dr-rol ${huidig === 'publiek' ? 'aan' : ''}`} disabled={bezig != null} onClick={() => void kies('publiek', '/')}>
          <span className="dr-rol-icoon">👤</span>
          <span className="dr-rol-label">Niet ingelogd</span>
          <span className="dr-rol-naam">bezoeker</span>
        </button>
      </div>
      {fout && <p className="dr-fout">{fout}</p>}
    </>
  )
}
