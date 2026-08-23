'use client'

import Link from 'next/link'
import { useState } from 'react'

// Je eigen account definitief verwijderen. Bewust in twee stappen én met een getypte bevestiging:
// dit is onomkeerbaar. De server controleert dezelfde bevestiging nog eens (zie
// /api/profile/account) — de knop is dus geen enige beveiliging.
export function AccountVerwijderen() {
  const [open, setOpen] = useState(false)
  const [tekst, setTekst] = useState('')
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const verwijder = async () => {
    setBusy(true)
    setFout(null)
    try {
      const res = await fetch('/api/profile/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bevestiging: tekst }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Verwijderen mislukt.')
      // Weg van elke pagina die een sessie verwacht; de bevestiging staat op de publieke pagina.
      window.location.href = '/account-verwijderen?klaar=1'
    } catch (e) {
      setFout((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <section className="wb-card av-card">
      <h2 className="av-title">Account verwijderen</h2>
      {!open ? (
        <>
          <p className="av-tekst">
            Wil je stoppen? Je kan je account hier zelf definitief verwijderen. Wat er precies
            verdwijnt en wat er bewaard blijft, staat op{' '}
            <Link href="/account-verwijderen" className="av-link">deze pagina</Link>.
          </p>
          <button type="button" className="wb-btn av-btn" onClick={() => setOpen(true)}>
            Ik wil mijn account verwijderen
          </button>
        </>
      ) : (
        <>
          <p className="av-tekst">
            Dit kan niet ongedaan gemaakt worden. Je account, je profielfoto, je pushmeldingen en je
            stemmen verdwijnen. De wedstrijden die je aantekende blijven bestaan als officieel
            verslag, maar niet langer op jouw naam.
          </p>
          <label className="av-label" htmlFor="av-bevestig">
            Typ <b>VERWIJDER</b> om te bevestigen:
          </label>
          <input
            id="av-bevestig"
            className="av-input"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Typ VERWIJDER om te bevestigen"
          />
          {fout && <p className="av-fout">{fout}</p>}
          <div className="av-knoppen">
            <button
              type="button"
              className="wb-btn av-btn danger"
              disabled={busy || tekst.trim().toUpperCase() !== 'VERWIJDER'}
              onClick={() => void verwijder()}
            >
              {busy ? 'Bezig…' : 'Definitief verwijderen'}
            </button>
            <button type="button" className="wb-btn" disabled={busy} onClick={() => { setOpen(false); setTekst(''); setFout(null) }}>
              Annuleren
            </button>
          </div>
        </>
      )}
    </section>
  )
}
