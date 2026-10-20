'use client'

import { useState } from 'react'

import { DEMO_ROLLEN } from '@/lib/demoruimte/rollen'

/** Wissel van rol in de demoruimte en ga meteen naar `naar` (of herlaad de huidige pagina). */
export async function wisselRol(rol: string, naar?: string | null): Promise<string | null> {
  const res = await fetch('/api/demoruimte/als', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rol }) })
  const j = (await res.json().catch(() => ({}))) as { error?: string; start?: string }
  if (!res.ok) return j.error ?? 'Wisselen lukte niet.'
  // Volledig herladen: elke pagina leest de sessie opnieuw (server components, SSE, cache).
  window.location.assign(naar ?? window.location.pathname + window.location.search)
  return null
}

/** Het keuzemenu in de demoband: "kijk als …" vanop elke pagina. */
export function DemoRolWissel({ huidig }: { huidig: string | null }) {
  const [bezig, setBezig] = useState(false)
  return (
    <select
      className="demo-band-kies"
      aria-label="Kijk als"
      value={huidig ?? 'publiek'}
      disabled={bezig}
      onChange={async (e) => {
        setBezig(true)
        const fout = await wisselRol(e.target.value)
        if (fout) {
          alert(fout)
          setBezig(false)
        }
      }}
    >
      <option value="publiek">👤 Niet ingelogd</option>
      {DEMO_ROLLEN.map((r) => (
        <option key={r.sleutel} value={r.sleutel}>
          {r.icoon} {r.label}
        </option>
      ))}
    </select>
  )
}

/** Een stap uit het draaiboek: wissel van rol en open het scherm. */
export function DemoStapKnop({ rol, href, tekst, icoon }: { rol: string; href: string | null; tekst: string; icoon: string }) {
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  return (
    <button
      type="button"
      className="dr-stap"
      disabled={!href || bezig}
      title={!href ? 'Zet de demo eerst klaar' : undefined}
      onClick={async () => {
        setBezig(true)
        setFout(null)
        const f = await wisselRol(rol, href)
        if (f) {
          setFout(f)
          setBezig(false)
        }
      }}
    >
      <span className="dr-stap-rol">{icoon}</span>
      <span className="dr-stap-tekst">
        {tekst}
        {fout && <span className="dr-fout"> — {fout}</span>}
      </span>
      <span aria-hidden className="dr-stap-pijl">
        {bezig ? '…' : '→'}
      </span>
    </button>
  )
}
