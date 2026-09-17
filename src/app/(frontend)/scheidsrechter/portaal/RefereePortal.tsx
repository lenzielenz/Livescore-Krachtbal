'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { clearNavAuth } from '@/lib/nav-auth-cache'
import { QrCode } from '@/components/QrCode'
import { formatDateBE } from '@/lib/datetime'
import { dateStrBE } from '@/lib/datetime'

type Delegation = { qr: string; validUntil: string }

// Persoonlijk portaal: toont de eigen QR + backup-code en laat toe een tijdelijke 'ziek'-QR
// aan te maken die een vervanger kan gebruiken tot een gekozen datum.
export function RefereePortal({ naam, qrValue, code }: { naam: string; qrValue: string; code: string }) {
  const router = useRouter()
  // Belgische dag, niet de UTC-dag: na 22:00 (zomertijd) sprong de standaardkeuze anders al
  // naar morgen.
  const today = dateStrBE()
  const [validUntil, setValidUntil] = useState(today)
  const [busy, setBusy] = useState(false)
  const [delegation, setDelegation] = useState<Delegation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const maakDelegatie = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/scheidsrechter/delegatie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ validUntil }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setDelegation({ qr: json.qr, validUntil: json.validUntil })
      } else {
        setError(json.error || 'Aanmaken mislukt.')
      }
    } catch {
      setError('Aanmaken mislukt.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    clearNavAuth()
    router.refresh()
  }

  return (
    <>
      <p className="wb-intro">
        Ingelogd als <strong style={{ color: 'var(--txt)' }}>{naam}</strong>. Toon deze QR-code aan de
        aantekenaar om de wedstrijd vrij te geven.{' '}
        <button type="button" onClick={logout} className="wb-link-btn">
          Uitloggen
        </button>
      </p>

      <div className="wb-grid">
        <section className="wb-card" style={{ textAlign: 'center' }}>
          <h2>Mijn persoonlijke QR</h2>
          <p className="wb-sub">Uniek voor jou — de aantekenaar scant deze om de wedstrijd te starten.</p>
          <div className="qr-box">
            <QrCode value={qrValue} size={220} />
          </div>
          <p className="wb-sub" style={{ marginTop: 12 }}>
            Backup-code (intikken als scannen niet lukt):
          </p>
          <p className="qr-code-text">{code}</p>
          <button type="button" onClick={() => window.print()} className="wb-btn" style={{ marginTop: 14 }}>
            🖨️ QR afdrukken
          </button>
          <p className="wb-sub" style={{ marginTop: 6, fontSize: '0.78rem' }}>
            Druk je QR af en hou ze op zak — zo kan je een wedstrijd starten, ook als je gsm leeg is.
          </p>
        </section>

        <section className="wb-card">
          <h2>Ziek? Maak een tijdelijke QR</h2>
          <p className="wb-sub">
            Kan je niet komen? Maak een tijdelijke QR-code aan met een vervaldatum en bezorg ze aan je
            vervanger. Daarmee kan hij/zij de wedstrijd in jouw plaats vrijgeven — automatisch
            ongeldig na de gekozen datum.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
            Geldig tot en met
            <input
              className="wb-input"
              type="date"
              min={today}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </label>
          <button onClick={maakDelegatie} disabled={busy} className="wb-btn wb-btn-primary" style={{ marginTop: 12 }}>
            {busy ? 'Bezig…' : 'Tijdelijke QR aanmaken'}
          </button>
          {error && <p className="wb-msg" style={{ color: '#e0533d' }}>{error}</p>}

          {delegation && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <div className="qr-box">
                <QrCode value={delegation.qr} size={200} />
              </div>
              <p className="wb-sub" style={{ marginTop: 10 }}>
                Geldig tot en met{' '}
                {formatDateBE(new Date(delegation.validUntil), { day: '2-digit', month: 'long', year: 'numeric' })}.
                Backup-code:
              </p>
              <p className="qr-code-text" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{delegation.qr}</p>
            </div>
          )}
        </section>
      </div>

      {/* Alleen zichtbaar bij afdrukken: een propere QR-kaart om op zak te houden. */}
      <div className="ref-printable" aria-hidden>
        <h2 className="ref-print-title">Krachtbal — scheidsrechter</h2>
        <p className="ref-print-name">{naam}</p>
        <div className="ref-print-qr"><QrCode value={qrValue} size={300} /></div>
        <p className="ref-print-code">Backup-code: {code}</p>
        <p className="ref-print-note">Toon deze QR (of tik de code in) aan de aantekenaar om de wedstrijd vrij te geven.</p>
      </div>
    </>
  )
}
