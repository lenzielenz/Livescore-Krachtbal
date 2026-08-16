'use client'

import { useRef, useState } from 'react'

import { toast } from '@/components/Toaster'

type Voorstel = { clubId: number; naam: string; primary: string; secondary: string }
type Antwoord = {
  ok: true
  commit: boolean
  bron: string
  clubsInPdf: number
  clubsTotaal: number
  teVullen: number
  bijgewerkt: number
  voorstel: Voorstel[]
  errors: string[]
}

/**
 * Vult ontbrekende clubkleuren aan uit de officiële Reeksen-PDF (KVKBF) — enkel als startwaarde
 * voor clubs zónder kleur. Een club met een logo (of een handmatig gekozen kleur) wordt nooit
 * overschreven; dit is puur een nette default in plaats van het groen/blauw-standaardkoppel.
 */
export function ClubKleurenImport() {
  const [bestand, setBestand] = useState<File | null>(null)
  const [proef, setProef] = useState<Antwoord | null>(null)
  const [busy, setBusy] = useState<'proef' | 'echt' | null>(null)
  const [klaar, setKlaar] = useState<Antwoord | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const verstuur = async (commit: boolean) => {
    if (busy || !bestand) return
    setBusy(commit ? 'echt' : 'proef')
    try {
      const body = new FormData()
      body.append('pdf', bestand)
      const r = await fetch(`/api/planning/kleuren${commit ? '?commit=1' : ''}`, { method: 'POST', body })
      const d = (await r.json()) as Antwoord & { error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? 'Kon de kleuren niet inlezen.')

      if (commit) {
        setKlaar(d)
        setProef(null)
        toast('success', `${d.bijgewerkt} clubkleur(en) ingevuld.`)
      } else {
        setProef(d)
        setKlaar(null)
        if (d.teVullen === 0) toast('info', 'Niets aan te vullen — alle herkende clubs hebben al een kleur.')
      }
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const opnieuw = () => {
    setBestand(null)
    setProef(null)
    setKlaar(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const res = klaar ?? proef

  return (
    <details className="plan pi-kleuren">
      <summary>🎨 Clubkleuren aanvullen uit de Reeksen-PDF</summary>
      <div className="pi-kleuren-body">
        <p className="pi-kleuren-intro">
          Laad de officiële Reeksen-PDF (met truikleuren per ploeg) op. Enkel clubs die nog{' '}
          <strong>géén</strong> kleur hebben — geen logo, niet handmatig ingesteld — krijgen een
          startkleur op basis van hun truikleur. Bestaande kleuren blijven onaangeroerd.
        </p>

        <label className="pi-file">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              setBestand(e.target.files?.[0] ?? null)
              setProef(null)
              setKlaar(null)
            }}
          />
          <span className="pi-file-btn">📄 PDF kiezen</span>
          <span className="pi-file-naam">{bestand ? bestand.name : 'Geen bestand gekozen'}</span>
        </label>

        <div className="plan-actions">
          <button type="button" className="btn" onClick={() => void verstuur(false)} disabled={busy !== null || !bestand}>
            {busy === 'proef' ? 'Controleren…' : '1. Controleren'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void verstuur(true)}
            disabled={busy !== null || !proef || proef.teVullen === 0}
            title={!proef ? 'Controleer eerst het bestand' : undefined}
          >
            {busy === 'echt' ? 'Invullen…' : `2. Invullen${proef ? ` (${proef.teVullen})` : ''}`}
          </button>
          {(proef || klaar) && (
            <button type="button" className="btn pi-reset" onClick={opnieuw} disabled={busy !== null}>
              Opnieuw beginnen
            </button>
          )}
        </div>

        {res && (
          <section className={`pi-res ${klaar ? 'done' : ''}`} aria-live="polite">
            <h2 className="pi-res-title">
              {klaar ? '✅ Kleuren ingevuld' : '🔍 Controle — er is nog niets weggeschreven'}
            </h2>
            <p className="pi-bronregel">
              Gelezen uit <strong>{res.bron}</strong> · {res.clubsInPdf} van {res.clubsTotaal} clubs herkend in de PDF
            </p>
            {res.voorstel.length > 0 && (
              <ul className="pi-kleuren-lijst">
                {res.voorstel.map((v) => (
                  <li key={v.clubId}>
                    <span className="pi-kleuren-swatch" style={{ background: v.primary }} aria-hidden />
                    <span className="pi-kleuren-swatch" style={{ background: v.secondary }} aria-hidden />
                    {v.naam}
                  </li>
                ))}
              </ul>
            )}
            {res.errors.length > 0 && (
              <div className="plan-errors">
                <h3>{res.errors.length} fout(en)</h3>
                <ul>
                  {res.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </details>
  )
}
