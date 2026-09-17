'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { QrCode } from '@/components/QrCode'
import { useCast } from '@/components/use-cast'
import { CAST_APP_ID } from '@/lib/cast'

export type CastMatch = {
  id: number
  reeks: string
  time: string
  status: string
  home: string
  away: string
}

type Slot = 'veld' | 'kantine'

const statusLabel = (s: string) => (s === 'live' ? 'LIVE' : s === 'finished' ? 'einde' : null)

// Eén bediening voor de twee tv-schermen. De aanpak werkt op élk toestel met een browser
// (ook iPhone): de tv opent één vaste scherm-URL en blijft staan; vanaf deze pagina kies je
// wát erop komt. Voor het veldscherm schrijven we de centrale selectie (/api/veld); het
// kantinescherm beheer je via /kantine. Chromecast is een optionele snelkoppeling als er
// een App ID is ingesteld.
export function CastHub({ matches, initialVeldId }: { matches: CastMatch[]; initialVeldId: number | null }) {
  const [origin, setOrigin] = useState('')
  const [veldId, setVeldId] = useState<number | null>(initialVeldId ?? matches[0]?.id ?? null)
  const [savingVeld, setSavingVeld] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const veldMatch = matches.find((m) => m.id === veldId) ?? null
  const veldUrl = origin ? `${origin}/veld/scherm` : '/veld/scherm'
  const kantineUrl = origin ? `${origin}/kantine/scherm` : '/kantine/scherm'

  // Veldscherm-selectie centraal opslaan; de veld-tv pikt de wissel vanzelf op.
  const chooseVeld = async (id: number | null) => {
    setVeldId(id)
    setSavingVeld(true)
    try {
      await fetch('/api/veld', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {
      /* stil — volgende keuze probeert opnieuw */
    } finally {
      setSavingVeld(false)
    }
  }

  // ── Optioneel: Google Cast (Chromecast) als App ID is ingesteld ──
  // Twee losse sessies: het veldscherm en het kantinescherm kunnen naar verschillende tv's.
  // De SDK-afhandeling zelf staat in components/use-cast.ts, zodat ze niet in twee bestanden
  // apart uit elkaar kan groeien — de kantinepagina cast met dezelfde haak.
  const veldCast = useCast('veld')
  const kantineCast = useCast('kantine')
  const castReady = veldCast.klaar || kantineCast.klaar
  const device = { veld: veldCast.apparaat, kantine: kantineCast.apparaat }
  const castTo = (slot: Slot, pad: string) => (slot === 'veld' ? veldCast : kantineCast).cast(pad)
  const stopCast = (slot: Slot) => (slot === 'veld' ? veldCast : kantineCast).stop()

  return (
    <div className="cast-hub">
      <p className="cast-intro">
        Open de scherm-URL <strong>één keer</strong> op de tv — hier kies je wat erop komt.
      </p>

      <div className="cast-grid">
        {/* ── Veldscherm ── */}
        <section className="cast-card">
          <div className="cast-card-head">
            <span className="cast-card-icon">🏟️</span>
            <h2 className="cast-card-title">Veldscherm</h2>
          </div>
          <p className="cast-card-sub">Het volledige scorebord van één wedstrijd op de tv aan het veld.</p>

          {matches.length === 0 ? (
            <p className="cast-empty">Geen wedstrijden vandaag.</p>
          ) : (
            <label className="cast-field">
              <span className="cast-field-label">Wedstrijd op het veldscherm</span>
              <select
                className="cast-select"
                value={veldId ?? ''}
                onChange={(e) => chooseVeld(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Niets tonen —</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {statusLabel(m.status) ? `${statusLabel(m.status)} · ` : `${m.time} · `}
                    {m.home} – {m.away}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="cast-now">
            {veldMatch ? (
              <>
                Nu op het veldscherm: <strong>{veldMatch.home} – {veldMatch.away}</strong>
                {savingVeld && <span className="cast-saving"> · opslaan…</span>}
              </>
            ) : (
              <span className="cast-now-dim">Niets gekozen — het veldscherm toont een wachtscherm.</span>
            )}
          </p>

          <ScreenLink label="Veldscherm-URL (open dit op de tv)" url={veldUrl} />

          {CAST_APP_ID && castReady && (
            <div className="cast-chromecast">
              {device.veld ? (
                <>
                  <span className="cast-dot" /> Op <strong>{device.veld}</strong>
                  <button type="button" className="cast-btn stop cast-btn-sm" onClick={() => stopCast('veld')}>
                    Stop
                  </button>
                </>
              ) : (
                <button type="button" className="cast-btn ghost cast-btn-sm" onClick={() => castTo('veld', '/veld/scherm')}>
                  📺 Of: cast via Chromecast
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Kantinescherm ── */}
        <section className="cast-card">
          <div className="cast-card-head">
            <span className="cast-card-icon">🍻</span>
            <h2 className="cast-card-title">Kantinescherm</h2>
          </div>
          <p className="cast-card-sub">Alle gekozen wedstrijden naast elkaar.</p>

          <Link href="/kantine" className="cast-btn ghost cast-kantine-pick">
            Kies wedstrijden →
          </Link>

          <ScreenLink label="Kantinescherm-URL (open dit op de tv)" url={kantineUrl} />

          {CAST_APP_ID && castReady && (
            <div className="cast-chromecast">
              {device.kantine ? (
                <>
                  <span className="cast-dot" /> Op <strong>{device.kantine}</strong>
                  <button type="button" className="cast-btn stop cast-btn-sm" onClick={() => stopCast('kantine')}>
                    Stop
                  </button>
                </>
              ) : (
                <button type="button" className="cast-btn ghost cast-btn-sm" onClick={() => castTo('kantine', '/kantine/scherm')}>
                  📺 Of: cast via Chromecast
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// Eén scherm-URL met kopiëren, openen en een QR-code om op de tv te scannen.
function ScreenLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard geweigerd — gebruiker kan de URL manueel kopiëren */
    }
  }

  return (
    <div className="cast-screenlink">
      <span className="cast-field-label">{label}</span>
      <div className="cast-url-row">
        <code className="cast-url">{url}</code>
        <button type="button" className="cast-btn cast-btn-sm" onClick={copy}>
          {copied ? '✓ Gekopieerd' : 'Kopieer'}
        </button>
      </div>
      <div className="cast-link-actions">
        <a className="cast-btn ghost cast-btn-sm" href={url} target="_blank" rel="noreferrer">
          Openen ↗
        </a>
        <button type="button" className="cast-btn ghost cast-btn-sm" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Verberg QR' : 'Toon QR'}
        </button>
      </div>
      {showQr && (
        <div className="cast-qr">
          <QrCode value={url} />
          <span className="cast-qr-cap">Scan met het toestel dat de tv aanstuurt</span>
        </div>
      )}
    </div>
  )
}
