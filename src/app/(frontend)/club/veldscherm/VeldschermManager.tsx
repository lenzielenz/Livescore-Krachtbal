'use client'

import { useEffect, useState } from 'react'

import { QrCode } from '@/components/QrCode'
import { MAX_VELDEN, MIN_VELDEN, type FieldScreenTheme } from '@/lib/field-screens'
import type { FieldScreenRow } from '@/lib/field-screens-data'

// Aantal velden instellen + per veld de scherm-URL delen (kopiëren/openen/QR). Wijzigen van het
// aantal (POST /api/veldscherm/velden) synct meteen — nieuwe velden komen erbij met een verse
// koppelcode, een verkleining verwijdert enkel velden die nu niet gekoppeld zijn (zie
// planVeldenSync in lib/field-screens.ts).
export function VeldschermManager({
  clubId,
  screens,
  demoScreens,
}: {
  clubId: number
  screens: FieldScreenRow[]
  demoScreens: FieldScreenRow[]
}) {
  const [rows, setRows] = useState(screens)
  const [count, setCount] = useState(Math.max(MIN_VELDEN, screens.length || MIN_VELDEN))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const applyCount = async (next: number) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/veldscherm/velden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { screens?: FieldScreenRow[]; blockedByLive?: string[]; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Opslaan mislukt.')
        return
      }
      setRows(data.screens ?? rows)
      setCount((data.screens ?? rows).length)
      if (data.blockedByLive && data.blockedByLive.length > 0) {
        setError(`${data.blockedByLive.join(', ')} is nu gekoppeld aan een lopende wedstrijd en kan pas verdwijnen als die afgelopen is.`)
      }
    } catch {
      setError('Opslaan mislukt — probeer opnieuw.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="vb">
      <div className="vb-count">
        <label className="vb-count-label" htmlFor="vb-count-input">Aantal velden</label>
        <div className="vb-count-row">
          <input
            id="vb-count-input"
            className="vb-count-input"
            type="number"
            min={MIN_VELDEN}
            max={MAX_VELDEN}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <button type="button" className="vb-btn" disabled={saving} onClick={() => void applyCount(count)}>
            {saving ? 'Bezig…' : 'Bijwerken'}
          </button>
        </div>
        {error && <p className="vb-error">{error}</p>}
      </div>

      {rows.length === 0 ? (
        <p className="empty">Nog geen velden ingesteld — kies hierboven een aantal.</p>
      ) : (
        <div className="vb-grid">
          {rows.map((s) => (
            <VeldCard key={s.id} screen={s} clubId={clubId} url={origin ? `${origin}/veld/club/${s.id}` : `/veld/club/${s.id}`} />
          ))}
        </div>
      )}

      {demoScreens.length > 0 && (
        <div className="vb-demo">
          <h2 className="vb-demo-title">Demo — visueel testen</h2>
          <p className="vb-demo-hint">
            Twee vaste testschermen, los van je echte velden: een wachtscherm en een scorebord met een
            fictieve wedstrijd. Handig om het uiterlijk te tunen zonder een echte wedstrijd te starten.
          </p>
          <div className="vb-grid">
            {demoScreens.map((s) => (
              <VeldCard key={s.id} screen={s} clubId={clubId} url={origin ? `${origin}/veld/club/${s.id}` : `/veld/club/${s.id}`} demo />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function VeldCard({ screen, url, demo = false }: { screen: FieldScreenRow; clubId: number; url: string; demo?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [theme, setTheme] = useState<FieldScreenTheme>(screen.theme)
  const [themeSaving, setThemeSaving] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* klembord geweigerd — url staat gewoon op het scherm om manueel te kopiëren */
    }
  }

  const chooseTheme = async (next: FieldScreenTheme) => {
    if (next === theme || themeSaving) return
    const prev = theme
    setTheme(next)
    setThemeSaving(true)
    try {
      const res = await fetch('/api/veldscherm/thema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldScreenId: screen.id, theme: next }),
      })
      if (!res.ok) setTheme(prev)
    } catch {
      setTheme(prev)
    } finally {
      setThemeSaving(false)
    }
  }

  return (
    <div className="vb-card">
      <div className="vb-card-head">
        <span className="vb-card-icon">{demo ? '🧪' : '🏟️'}</span>
        <h2 className="vb-card-title">{screen.naam}</h2>
        {demo && <span className="vb-demo-badge">Demo</span>}
      </div>
      <p className="vb-card-status">
        {screen.pairedMatchId ? (
          <>⚡ {demo ? 'Fictieve wedstrijd — altijd live' : 'Nu gekoppeld aan een lopende wedstrijd'}</>
        ) : (
          <>Wachtscherm — koppelcode <strong>{screen.pairingCode ?? '—'}</strong></>
        )}
      </p>
      <div className="vb-theme">
        <span className="vb-theme-label">Kleurthema</span>
        <div className="vb-theme-row" role="group" aria-label="Kleurthema voor dit veld">
          <button
            type="button"
            className={`vb-theme-btn${theme === 'dark' ? ' on' : ''}`}
            disabled={themeSaving}
            onClick={() => void chooseTheme('dark')}
          >
            🌙 Donker
          </button>
          <button
            type="button"
            className={`vb-theme-btn light${theme === 'light' ? ' on' : ''}`}
            disabled={themeSaving}
            onClick={() => void chooseTheme('light')}
          >
            ☀️ Licht
          </button>
        </div>
      </div>
      <div className="vb-url-row">
        <code className="vb-url">{url}</code>
        <button type="button" className="vb-btn vb-btn-sm" onClick={() => void copy()}>
          {copied ? '✓ Gekopieerd' : 'Kopieer'}
        </button>
      </div>
      <div className="vb-link-actions">
        <a className="vb-btn ghost vb-btn-sm" href={url} target="_blank" rel="noreferrer">Openen ↗</a>
        <button type="button" className="vb-btn ghost vb-btn-sm" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Verberg QR' : 'Toon QR'}
        </button>
      </div>
      {showQr && (
        <div className="vb-qr">
          <QrCode value={url} />
          <span className="vb-qr-cap">Scan met het toestel dat de tv aanstuurt</span>
        </div>
      )}
    </div>
  )
}
