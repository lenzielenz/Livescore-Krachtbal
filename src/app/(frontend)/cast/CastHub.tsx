'use client'

// Brug naar de externe Google Cast Sender-SDK, die geen TypeScript-types meelevert.
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { CAST_APP_ID, CAST_NAMESPACE } from '@/lib/cast'
import { QrCode } from './QrCode'

export type CastMatch = {
  id: number
  reeks: string
  time: string
  status: string
  home: string
  away: string
}

const SENDER_SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

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
  const [castReady, setCastReady] = useState(false)
  const sessions = useRef<Record<Slot, any | null>>({ veld: null, kantine: null })
  const [device, setDevice] = useState<Record<Slot, string | null>>({ veld: null, kantine: null })

  useEffect(() => {
    if (!CAST_APP_ID) return
    let cancelled = false
    const initApi = () => {
      const chrome = (window as any).chrome
      if (!chrome?.cast) return
      const sessionRequest = new chrome.cast.SessionRequest(CAST_APP_ID)
      const apiConfig = new chrome.cast.ApiConfig(
        sessionRequest,
        () => {},
        () => {},
        chrome.cast.AutoJoinPolicy.PAGE_SCOPED,
      )
      chrome.cast.initialize(apiConfig, () => !cancelled && setCastReady(true), () => {})
    }
    ;(window as any).__onGCastApiAvailable = (ok: boolean) => ok && initApi()
    if ((window as any).chrome?.cast) initApi()
    else if (!document.querySelector(`script[src="${SENDER_SDK}"]`)) {
      const s = document.createElement('script')
      s.src = SENDER_SDK
      document.head.appendChild(s)
    }
    return () => {
      cancelled = true
    }
  }, [])

  const castTo = (slot: Slot, path: string) => {
    const chrome = (window as any).chrome
    const existing = sessions.current[slot]
    const sendPath = (session: any) => {
      const send = () => session.sendMessage(CAST_NAMESPACE, { path }, () => {}, () => {})
      send()
      setTimeout(send, 1200)
      setTimeout(send, 3000)
    }
    if (existing) {
      sendPath(existing)
      return
    }
    chrome.cast.requestSession((session: any) => {
      sessions.current[slot] = session
      setDevice((d) => ({ ...d, [slot]: session.receiver?.friendlyName ?? 'Chromecast' }))
      session.addUpdateListener((isAlive: boolean) => {
        const stopped = session.status === chrome.cast.SessionStatus.STOPPED
        if (!isAlive || stopped) {
          if (sessions.current[slot] === session) {
            sessions.current[slot] = null
            setDevice((d) => ({ ...d, [slot]: null }))
          }
        }
      })
      sendPath(session)
    }, () => {})
  }

  const stopCast = (slot: Slot) => {
    const session = sessions.current[slot]
    if (session) session.stop(() => {}, () => {})
    sessions.current[slot] = null
    setDevice((d) => ({ ...d, [slot]: null }))
  }

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
