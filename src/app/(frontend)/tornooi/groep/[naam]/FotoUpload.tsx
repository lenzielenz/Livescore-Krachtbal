'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

import type { Opdracht } from '@/lib/foto-opdrachten'

// 📷 Supporters delen hun foto's van de tornooidag. Alles staat in ÉÉN kaart: de opdracht van het
// moment, wat je ermee wint (ze verschijnt op het kantinescherm) en de twee manieren om ze in te
// sturen.
//
// Twee dingen zitten hier bewust anders dan je zou verwachten:
//
// • De opdracht komt van de SERVER en staat nergens in de browser. Elke deelnemer heeft zijn
//   eigen geschudde reeks van vijftig, en hoe ver hij staat volgt uit de foto's die hij al
//   instuurde. Daardoor doet dezelfde supporter op zijn tablet verder waar zijn gsm stopte, en
//   levert een gewiste browsergeschiedenis geen nieuwe start op.
//
// • Wie niet ingelogd is, krijgt de opdracht níét te zien. Meedoen kan alleen ingelogd — anders
//   valt er geen eigen reeks toe te kennen — en een opdracht tonen die je niet kan insturen is
//   een uitnodiging naar een gesloten deur.
export function FotoUpload({
  groep,
  opdracht: initieel,
}: {
  groep: string
  /** De opdracht die nu aan de beurt is, of null voor wie niet ingelogd is. */
  opdracht: Opdracht | null
}) {
  // Twee wegen naar dezelfde upload: rechtstreeks fotograferen (capture opent de camera-app) of
  // uit de galerij kiezen. Eén gedeeld input met `multiple` toont op veel telefoons enkel de
  // galerij — vandaar twee aparte inputs, elk met hun eigen knop.
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerijRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [gelukt, setGelukt] = useState(false)
  const [opdracht, setOpdracht] = useState<Opdracht | null>(initieel)

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setMelding(null)
    setGelukt(false)
    try {
      const form = new FormData()
      form.set('groep', groep)
      for (const f of Array.from(files)) form.append('fotos', f)
      const res = await fetch('/api/tornooi-foto', { method: 'POST', credentials: 'include', body: form })
      const data = (await res.json().catch(() => ({}))) as {
        aantal?: number
        volgende?: Opdracht
        error?: string
      }
      if (!res.ok) throw new Error(data.error || 'Insturen mislukt.')
      const n = data.aantal ?? files.length
      // De server zegt zelf welke opdracht nu aan de beurt is — die hoeft de browser niet uit te
      // rekenen, en ze klopt ook als er intussen op een ander toestel ingestuurd werd.
      if (data.volgende) setOpdracht(data.volgende)
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

  // Niet ingelogd: geen opdracht, wel de uitnodiging. Met uitleg waaróm — anders lijkt inloggen
  // een drempel in plaats van de manier waarop je je eigen rijtje krijgt.
  if (!opdracht) {
    return (
      <section className="fo-kaart" aria-label="Foto-opdracht van de tornooidag">
        <div className="fo-kop">
          <span className="fo-titel">📸 Foto-opdracht</span>
        </div>
        <p className="fo-opdracht">Doe mee met de foto-opdrachten</p>
        <p className="fo-uitleg">
          Elke deelnemer krijgt een eigen rijtje van 50 opdrachten, in een eigen volgorde — jouw
          foto verschijnt op het kantinescherm, met de opdracht eronder. Log in om je eerste
          opdracht te zien.
        </p>
        <div className="fo-knoppen">
          <Link href={`/inloggen?next=/tornooi/groep/${encodeURIComponent(groep)}`} className="fo-btn primair">
            📸 Log in en doe mee
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="fo-kaart" aria-label="Foto-opdracht van de tornooidag">
      <div className="fo-kop">
        <span className="fo-titel">📸 Foto-opdracht</span>
        <span className="fo-teller">
          {opdracht.nummer} van {opdracht.totaal}
        </span>
      </div>
      {/* De opdracht zelf is de blikvanger: groot, en ze wisselt telkens je er één inzendt. */}
      <p className="fo-opdracht">{opdracht.tekst}</p>
      <p className="fo-uitleg">
        Trek de foto en stuur ze in — ze verschijnt op het kantinescherm en je krijgt meteen een
        nieuwe opdracht.
      </p>
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
      {/* Galerij: meerdere foto's in één keer — samen beantwoorden ze één opdracht. */}
      <input ref={galerijRef} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
      {melding && (
        <p className={`fo-melding ${gelukt ? 'ok' : 'fout'}`} role="status">
          {gelukt ? '✅' : '⚠️'} {melding}
        </p>
      )}
    </section>
  )
}
