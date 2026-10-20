'use client'

import { useState } from 'react'

import { formatDateTimeBE } from '@/lib/datetime'
import './herstellink.css'

/**
 * Wachtwoord vergeten: de beheerder maakt een eenmalige herstellink en geeft ze zelf door.
 *
 * Bewust geen mail en bewust geen "zet even een wachtwoord voor hem": de gebruiker kiest het
 * zelf via de link, de beheerder ziet het nooit. De link staat één keer op het scherm — daarna
 * is ze weg (ze staat nergens bewaard), dus de kopieerknop staat er meteen naast.
 *
 * Gedeeld door /beheer/accounts (federatie/admin, alle accounts) en /beheer/club-team
 * (club-beheerder, enkel de eigen clubleden) — zie /api/admin/users/herstellink voor de
 * toegangscontrole per rol.
 */
export function Herstellink({
  userId,
  email,
  chipClassName = 'acc-chip',
  label,
}: {
  userId: number
  email: string
  /** Klasse van de gebruikende pagina's eigen knop-look (bv. "acc-chip" of "ct-chip"). */
  chipClassName?: string
  /** Tekst voor het sleutel-icoon, bv. "👪 ouder" (standaard "Herstellink"). */
  label?: string
}) {
  const [link, setLink] = useState<string | null>(null)
  const [vervalt, setVervalt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const maak = async () => {
    if (!window.confirm(`Een herstellink maken voor ${email}?\n\nDe vorige link (als die er was) vervalt daarmee. Geef de nieuwe link zelf door — bv. via WhatsApp.`)) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/users/herstellink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; link?: string; vervalt?: string }
      if (!res.ok || !data.link) {
        setMsg(data.error ?? 'Aanmaken mislukt.')
        return
      }
      setLink(data.link)
      setVervalt(data.vervalt ?? null)
    } catch {
      setMsg('Er ging iets mis.')
    } finally {
      setBusy(false)
    }
  }

  const kopieer = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setMsg('✓ Gekopieerd')
    } catch {
      setMsg('Kopiëren lukte niet — selecteer de link hierboven.')
    }
  }

  return (
    <div className="herstel">
      <button type="button" className={chipClassName} onClick={maak} disabled={busy} title="Maak een eenmalige link waarmee deze persoon zelf een nieuw wachtwoord kiest">
        {busy ? 'Bezig…' : `🔑 ${label ?? 'Herstellink'}`}
      </button>
      {link && (
        <div className="herstel-uit">
          <code className="herstel-link">{link}</code>
          <button type="button" className={chipClassName} onClick={kopieer}>
            Kopieer
          </button>
          <span className="herstel-info">
            Geldig tot {vervalt ? formatDateTimeBE(new Date(vervalt), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'morgen'} · werkt één keer
          </span>
        </div>
      )}
      {msg && <span className="herstel-msg">{msg}</span>}
    </div>
  )
}
