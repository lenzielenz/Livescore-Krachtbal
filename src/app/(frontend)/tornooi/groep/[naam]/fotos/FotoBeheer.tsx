'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'

// Beheer van de ingezonden foto's: bekijken, downloaden en verwijderen.
//
// Verwijderen is onomkeerbaar (het bestand gaat mee van schijf), dus er hoort een bevestiging
// bij — maar wel eentje die de vaart er niet uithaalt: wie vijftien wazige foto's opruimt, wil
// niet vijftien keer een venster wegklikken met dezelfde tekst. Vandaar één bevestiging per
// foto, met de inzender erin zodat je weet wát je weggooit.

export type BeheerFoto = {
  id: number
  src: string
  uploaderName: string
  wanneer: string
  opdracht: string | null
}

export function FotoBeheer({ naam, fotos }: { naam: string; fotos: BeheerFoto[] }) {
  const [weg, setWeg] = useState<Set<number>>(new Set())
  const [bezig, setBezig] = useState<number | null>(null)

  const zichtbaar = fotos.filter((f) => !weg.has(f.id))

  const verwijder = async (f: BeheerFoto) => {
    if (bezig != null) return
    const wie = f.uploaderName || 'een supporter'
    if (!window.confirm(`De foto van ${wie} (${f.wanneer}) verwijderen? Dat kan niet ongedaan gemaakt worden.`)) return
    setBezig(f.id)
    try {
      const res = await fetch(`/api/tornooi-groep/foto/${f.id}?naam=${encodeURIComponent(naam)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Verwijderen mislukt.')
      setWeg((s) => new Set(s).add(f.id))
      toast('success', 'Foto verwijderd.')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBezig(null)
    }
  }

  if (zichtbaar.length === 0) {
    return <p className="trn-empty">Geen foto’s (meer) op deze tornooidag.</p>
  }

  return (
    <>
      <div className="trn-actions">
        <a className="trn-btn" href={`/api/tornooi-groep/fotos?naam=${encodeURIComponent(naam)}`}>
          ⬇ Alle foto’s downloaden (zip)
        </a>
        <a className="trn-btn primary" href={`/tornooi/groep/${encodeURIComponent(naam)}/fotos/slideshow`}>
          ▶ Slideshow op het scherm
        </a>
      </div>
      <p className="trn-hint">
        Zodra alle wedstrijden gespeeld zijn, wisselt het kantinescherm zelf af tussen de
        kampioenen, de uitslagen en deze foto’s — zolang de tv ingelogd blijft staan.
      </p>

      <ul className="tf-raster">
        {zichtbaar.map((f) => (
          <li key={f.id} className="tf-kaart">
            <a href={f.src} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- eigen bestand achter een
                  federatie-only route; next/image kan die niet optimaliseren. */}
              <img src={f.src} alt={`Foto van ${f.uploaderName || 'supporter'}`} loading="lazy" />
            </a>
            <span className="tf-meta">
              <b>{f.uploaderName || 'Onbekend'}</b>
              <span>{f.wanneer}</span>
            </span>
            {f.opdracht && <span className="tf-opdracht">{f.opdracht}</span>}
            <span className="tf-acties">
              <a className="trn-mini" href={`${f.src}${f.src.includes('?') ? '&' : '?'}download=1`}>
                ⬇ Bewaren
              </a>
              <button
                type="button"
                className="trn-mini tf-weg"
                onClick={() => void verwijder(f)}
                disabled={bezig != null}
              >
                {bezig === f.id ? 'Bezig…' : '✕ Verwijderen'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
