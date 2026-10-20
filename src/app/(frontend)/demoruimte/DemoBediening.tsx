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
