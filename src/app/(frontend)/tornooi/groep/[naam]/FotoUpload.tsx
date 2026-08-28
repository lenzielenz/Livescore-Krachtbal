'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { opdrachtOp, willekeurigeStart } from '@/lib/foto-opdrachten'

// 📷 Supporters delen hun foto's van de tornooidag. Na het insturen zien ze de foto niet terug —
// alles komt samen op één plek bij de organisatie. Om de mensen te prikkelen hangt er een
// foto-opdracht aan ("Foto met het scorebord", …) die doorschuift telkens ze er één volbracht
// hebben. Elke gsm begint op een willekeurige plek in de lijst (en onthoudt zijn voortgang in
// localStorage) — zo jaagt niet iedereen op dezelfde foto. Niet ingelogd? Vriendelijk doorverwijzen.
export function FotoUpload({ groep, ingelogd }: { groep: string; ingelogd: boolean }) {
  // Twee wegen naar dezelfde upload: rechtstreeks fotograferen (capture opent de camera-app) of
  // uit de galerij kiezen. Eén gedeeld input met `multiple` toont op veel telefoons enkel de
  // galerij — vandaar twee aparte inputs, elk met hun eigen knop.
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerijRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
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

  if (!ingelogd) {
    return (
      <Link href={`/inloggen?next=/tornooi/groep/${encodeURIComponent(groep)}`} className="trn-btn">
        📷 Deel je foto’s van de dag
      </Link>
    )
  }

  const opdracht = stap != null ? opdrachtOp(stap) : null

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setMelding(null)
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
      setMelding(`✅ Bedankt! ${n === 1 ? 'Je foto is' : `${n} foto’s zijn`} bezorgd aan de organisatie. Nieuwe opdracht hieronder!`)
    } catch (e) {
      setMelding(`⚠️ ${(e as Error).message}`)
    } finally {
      setBusy(false)
      // Leegmaken zodat dezelfde foto meteen opnieuw gekozen kan worden.
      if (cameraRef.current) cameraRef.current.value = ''
      if (galerijRef.current) galerijRef.current.value = ''
    }
  }

  return (
    <span className="trn-fotoupload">
      <span className="trn-foto-knoppen">
        <button
          type="button"
          className="trn-btn primary"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          {busy ? '⏳ Insturen…' : '📸 Foto nemen'}
        </button>
        <button type="button" className="trn-btn" disabled={busy} onClick={() => galerijRef.current?.click()}>
          🖼️ Uit galerij
        </button>
      </span>
      {opdracht && (
        <span className="trn-foto-opdracht" title="Volbreng de opdracht en stuur je foto in — dan verschijnt de volgende!">
          <em>Opdracht:</em> {opdracht}
        </span>
      )}
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
      {melding && <span className="trn-foto-melding" role="status">{melding}</span>}
    </span>
  )
}
