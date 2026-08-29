'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { FOTO_OPDRACHTEN, opdrachtOp, willekeurigeStart } from '@/lib/foto-opdrachten'

// 📷 Supporters delen hun foto's van de tornooidag. Alles staat in ÉÉN kaart: de opdracht van het
// moment, wat je ermee wint (ze verschijnt op het kantinescherm) en de twee manieren om ze in te
// sturen. Los van elkaar oogden die knoppen rommelig en nodigde niets uit om mee te doen.
// Na het insturen ziet de supporter zijn foto niet terug — alles komt samen bij de organisatie —
// maar schuift de volgende opdracht meteen aan. Elke gsm begint op een willekeurige plek in de
// lijst (en onthoudt zijn voortgang in localStorage), zodat niet iedereen op dezelfde foto jaagt.
export function FotoUpload({ groep, ingelogd }: { groep: string; ingelogd: boolean }) {
  // Twee wegen naar dezelfde upload: rechtstreeks fotograferen (capture opent de camera-app) of
  // uit de galerij kiezen. Eén gedeeld input met `multiple` toont op veel telefoons enkel de
  // galerij — vandaar twee aparte inputs, elk met hun eigen knop.
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerijRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [gelukt, setGelukt] = useState(false)
  // Opdracht-index start pas na de mount (localStorage bestaat niet op de server).
  const [stap, setStap] = useState<number | null>(null)
  const sleutel = `kb-foto-opdracht:${groep}`
  useEffect(() => {
    let bewaard: number | null = null
    try {
      const ruw = localStorage.getItem(sleutel)
      if (ruw != null && Number.isFinite(Number(ruw))) bewaard = Number(ruw)
    } catch {
      /* privémodus of geblokkeerde opslag — start gewoon vooraan */
    }
    // Nog geen voortgang op dit toestel → loot een eigen startopdracht en leg ze meteen vast.
    const start = bewaard ?? willekeurigeStart()
    if (bewaard == null) {
      try {
        localStorage.setItem(sleutel, String(start))
      } catch {
        /* geen opslag — dan loot dit toestel bij het volgende bezoek gewoon opnieuw */
      }
    }
    setStap(start)
    // eslint-disable-next-line
  }, [groep])

  const opdracht = stap != null ? opdrachtOp(stap) : null

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setMelding(null)
    setGelukt(false)
    try {
      const form = new FormData()
      form.set('groep', groep)
      if (opdracht) form.set('opdracht', opdracht)
      for (const f of Array.from(files)) form.append('fotos', f)
      const res = await fetch('/api/tornooi-foto', { method: 'POST', credentials: 'include', body: form })
      const data = (await res.json().catch(() => ({}))) as { aantal?: number; error?: string }
      if (!res.ok) throw new Error(data.error || 'Insturen mislukt.')
      const n = data.aantal ?? files.length
      // Opdracht volbracht → de volgende schuift aan (en blijft onthouden op dit toestel).
      const volgende = (stap ?? willekeurigeStart()) + 1
      setStap(volgende)
      try {
        localStorage.setItem(sleutel, String(volgende))
      } catch {
        /* geen opslag — de opdracht wisselt dan enkel binnen deze sessie */
      }
      setGelukt(true)
      setMelding(
        `${n === 1 ? 'Je foto is' : `${n} foto’s zijn`} binnen — bedankt! Je volgende opdracht staat hierboven al klaar.`,
      )
    } catch (e) {
      setGelukt(false)
      setMelding((e as Error).message)
    } finally {
      setBusy(false)
      // Leegmaken zodat dezelfde foto meteen opnieuw gekozen kan worden.
      if (cameraRef.current) cameraRef.current.value = ''
      if (galerijRef.current) galerijRef.current.value = ''
    }
  }

  // De kaart is altijd hetzelfde geheel — enkel de onderkant verschilt voor wie niet ingelogd is.
  return (
    <section className="fo-kaart" aria-label="Foto-opdracht van de tornooidag">
      <div className="fo-kop">
        <span className="fo-titel">📸 Foto-opdracht</span>
        {stap != null && (
          <span className="fo-teller">{(stap % FOTO_OPDRACHTEN.length) + 1} van {FOTO_OPDRACHTEN.length}</span>
        )}
      </div>
      {/* De opdracht zelf is de blikvanger: groot, en ze wisselt telkens je er één inzendt. */}
      <p className="fo-opdracht">{opdracht ?? 'Je opdracht wordt geladen…'}</p>
      <p className="fo-uitleg">
        Trek de foto en stuur ze in — ze verschijnt op het kantinescherm en je krijgt meteen een
        nieuwe opdracht.
      </p>
      {ingelogd ? (
        <>
          <div className="fo-knoppen">
            <button type="button" className="fo-btn primair" disabled={busy} onClick={() => cameraRef.current?.click()}>
              {busy ? '⏳ Insturen…' : '📸 Foto nemen'}
            </button>
            <button type="button" className="fo-btn" disabled={busy} onClick={() => galerijRef.current?.click()}>
              🖼️ Uit galerij
            </button>
          </div>
          {/* Camera: `capture=environment` opent meteen de achtercamera op gsm (op desktop valt
              de browser gewoon terug op een bestandskiezer). */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          {/* Galerij: meerdere foto's in één keer. */}
          <input
            ref={galerijRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          {melding && (
            <p className={`fo-melding ${gelukt ? 'ok' : 'fout'}`} role="status">
              {gelukt ? '✅' : '⚠️'} {melding}
            </p>
          )}
        </>
      ) : (
        <div className="fo-knoppen">
          <Link href={`/inloggen?next=/tornooi/groep/${encodeURIComponent(groep)}`} className="fo-btn primair">
            📸 Log in en doe mee
          </Link>
        </div>
      )}
    </section>
  )
}
