'use client'

import { useRef, useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateTimeBE } from '@/lib/datetime'
import type { ImportSamenvatting } from '@/lib/season-import'
import './planning-import.css'

type Antwoord = ImportSamenvatting & { ok: true; commit: boolean; bron: string }

/**
 * Seizoensimport in twee stappen: eerst controleren (er wordt níets weggeschreven), dan pas
 * doorvoeren. De tussenstap is er niet voor de vorm — je ziet er of de kolommen juist gelezen zijn
 * en welke clubs/ploegen nieuw aangemaakt worden, vóór je 600 wedstrijden in de kalender zet.
 */
// Moet letterlijk (hoofdlettergevoelig) ingetypt worden vóór de wipe-import mag draaien — zelfde
// frase als de server verwacht (api/planning/seizoen/route.ts, WIPE_CONFIRM_PHRASE).
const WIPE_CONFIRM_PHRASE = 'VERWIJDER ALLES'

export function PlanningImport() {
  const [bestand, setBestand] = useState<File | null>(null)
  const [tekst, setTekst] = useState('')
  const [proef, setProef] = useState<Antwoord | null>(null)
  const [busy, setBusy] = useState<'proef' | 'echt' | null>(null)
  const [klaar, setKlaar] = useState<Antwoord | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // "Vervang volledig speelplan": verwijdert ALLE bestaande competitiewedstrijden (elk seizoen,
  // elke reeks — met hun worpen/statistieken/wedstrijdbladen) vóór het importeren. Bewust een
  // aparte, uitgeklapte keuze met een letterlijke bevestigingsfrase — niet zomaar een vinkje.
  const [wipe, setWipe] = useState(false)
  const [wipeConfirm, setWipeConfirm] = useState('')

  const heeftInvoer = Boolean(bestand) || tekst.trim().length > 0
  const wipeBevestigd = !wipe || wipeConfirm.trim() === WIPE_CONFIRM_PHRASE

  const verstuur = async (commit: boolean) => {
    if (busy || !heeftInvoer) return
    if (commit && wipe && !wipeBevestigd) return
    setBusy(commit ? 'echt' : 'proef')
    try {
      const body = new FormData()
      if (bestand) body.append('file', bestand)
      else body.append('text', tekst)
      if (wipe && commit) body.append('confirm', wipeConfirm.trim())

      const params = new URLSearchParams()
      if (commit) params.set('commit', '1')
      if (wipe) params.set('wipe', '1')
      const r = await fetch(`/api/planning/seizoen?${params}`, { method: 'POST', body })
      const d = (await r.json()) as Antwoord & { error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? 'Import mislukt.')

      if (commit) {
        setKlaar(d)
        setProef(null)
        const a = d.aangemaakt
        const verwijderdBit = wipe ? `${d.verwijderd ?? 0} oude wedstrijden verwijderd, ` : ''
        toast('success', `${verwijderdBit}${a?.wedstrijden ?? 0} wedstrijden, ${a?.ploegen ?? 0} ploegen en ${a?.clubs ?? 0} clubs aangemaakt.`)
      } else {
        setProef(d)
        setKlaar(null)
        if (d.nieuweWedstrijden === 0 && !wipe) toast('info', 'Niets nieuws gevonden — alles staat er al in.')
      }
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const opnieuw = () => {
    setBestand(null)
    setTekst('')
    setProef(null)
    setKlaar(null)
    setWipe(false)
    setWipeConfirm('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const res = klaar ?? proef

  return (
    <div className="plan">
      <p className="wb-intro">
        Laad het volledige speelplan in één keer op — alle reeksen samen. Een <strong>Excel</strong>
        (.xlsx) of CSV volstaat; de kolommen worden herkend aan de koprij, in welke volgorde ze ook
        staan. Herkende namen: <code>Datum</code>, <code>Uur</code>, <code>Reeks</code>,{' '}
        <code>Thuisploeg</code>, <code>Bezoekers</code>. Clubs en ploegen die nog niet bestaan,
        worden automatisch aangemaakt. Wedstrijden die er al in staan, worden overgeslagen — hetzelfde
        bestand nog eens inladen kan dus geen kwaad.
      </p>

      <div className="pi-bron">
        <label className="pi-file">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,text/csv"
            onChange={(e) => {
              setBestand(e.target.files?.[0] ?? null)
              setProef(null)
              setKlaar(null)
            }}
          />
          <span className="pi-file-btn">📄 Excel of CSV kiezen</span>
          <span className="pi-file-naam">{bestand ? bestand.name : 'Geen bestand gekozen'}</span>
        </label>

        {!bestand && (
          <details className="pi-plak">
            <summary>… of plak het speelplan als tekst</summary>
            <textarea
              className="plan-area"
              rows={8}
              value={tekst}
              onChange={(e) => {
                setTekst(e.target.value)
                setProef(null)
                setKlaar(null)
              }}
              placeholder={'Datum;Uur;Reeks;Thuisploeg;Bezoekers\n13/09/2026;14:00;1NAH;KBK Temse;KBC Male'}
            />
          </details>
        )}
      </div>

      <details className="pi-wipe" open={wipe}>
        <summary onClick={(e) => { e.preventDefault(); setWipe((v) => !v) }}>
          <input type="checkbox" checked={wipe} readOnly /> ⚠️ Vervang het volledige speelplan (nieuwe competitie)
        </summary>
        <div className="pi-wipe-body">
          <p className="pi-wipe-warn">
            Verwijdert <strong>ALLE</strong> bestaande wedstrijden — élk seizoen, élke reeks, ook
            afgesloten historische wedstrijden met hun worpen, statistieken en wedstrijdbladen —
            vóór dit bestand ingeladen wordt. <strong>Onomkeerbaar.</strong> Clubs en ploegen
            blijven wél staan. Gebruik dit enkel om een volledig nieuw seizoen op te starten.
          </p>
          {wipe && (
            <label className="pi-wipe-confirm">
              Typ <code>{WIPE_CONFIRM_PHRASE}</code> om te bevestigen:
              <input
                type="text"
                value={wipeConfirm}
                onChange={(e) => { setWipeConfirm(e.target.value); setProef(null); setKlaar(null) }}
                placeholder={WIPE_CONFIRM_PHRASE}
                autoComplete="off"
              />
            </label>
          )}
        </div>
      </details>

      <div className="plan-actions">
        <button type="button" className="btn" onClick={() => void verstuur(false)} disabled={busy !== null || !heeftInvoer}>
          {busy === 'proef' ? 'Controleren…' : '1. Controleren'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void verstuur(true)}
          disabled={busy !== null || !proef || proef.nieuweWedstrijden === 0 || (wipe && !wipeBevestigd)}
          title={!proef ? 'Controleer eerst het bestand' : wipe && !wipeBevestigd ? `Typ "${WIPE_CONFIRM_PHRASE}" om te bevestigen` : undefined}
        >
          {busy === 'echt' ? 'Importeren…' : `2. Importeren${proef ? ` (${proef.nieuweWedstrijden})` : ''}`}
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
            {klaar ? '✅ Import uitgevoerd' : '🔍 Controle — er is nog niets weggeschreven'}
          </h2>
          <p className="pi-bronregel">
            Gelezen uit <strong>{res.bron}</strong>
            {res.header && <> · kolommen herkend: {res.header.filter(Boolean).join(', ')}</>}
          </p>

          <div className="pi-cijfers">
            {(res.teVerwijderen != null || res.verwijderd != null) && (
              <Cijfer
                label={klaar ? 'oude wedstrijden verwijderd' : 'zouden verwijderd worden'}
                waarde={(klaar ? res.verwijderd : res.teVerwijderen) ?? 0}
                waarschuwing
              />
            )}
            <Cijfer label="wedstrijden in het bestand" waarde={res.gelezen.wedstrijden} />
            <Cijfer label={klaar ? 'aangemaakt' : 'nieuw'} waarde={klaar ? (res.aangemaakt?.wedstrijden ?? 0) : res.nieuweWedstrijden} sterk />
            <Cijfer label="stonden er al in" waarde={res.bestaandeWedstrijden} />
            <Cijfer label="nieuwe ploegen" waarde={klaar ? (res.aangemaakt?.ploegen ?? 0) : res.nieuwePloegen.length} />
            <Cijfer label="nieuwe clubs" waarde={klaar ? (res.aangemaakt?.clubs ?? 0) : res.nieuweClubs.length} />
            <Cijfer label="rijen met een probleem" waarde={res.issues.length} waarschuwing={res.issues.length > 0} />
          </div>

          {!klaar && res.voorbeeld.length > 0 && (
            <div className="pi-blok">
              <h3>Zo wordt het gelezen</h3>
              <table className="pi-tabel">
                <thead>
                  <tr>
                    <th>Wanneer</th>
                    <th>Reeks</th>
                    <th>Thuis</th>
                    <th>Bezoekers</th>
                  </tr>
                </thead>
                <tbody>
                  {res.voorbeeld.map((v, i) => (
                    <tr key={i}>
                      <td>{formatDateTimeBE(v.datum)}</td>
                      <td>{v.reeks}</td>
                      <td>{v.thuis}</td>
                      <td>{v.uit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pi-hint">Klopt de datum en het uur? Dan zijn de kolommen juist gelezen.</p>
            </div>
          )}

          {!klaar && res.nieuweClubs.length > 0 && (
            <Lijst titel={`${res.nieuweClubs.length} nieuwe club(s)`} items={res.nieuweClubs} />
          )}
          {!klaar && res.nieuwePloegen.length > 0 && (
            <Lijst
              titel={`${res.nieuwePloegen.length} nieuwe ploeg(en)`}
              items={res.nieuwePloegen.map((p) => `${p.naam} — ${p.reeks}`)}
            />
          )}

          {res.issues.length > 0 && (
            <div className="plan-errors">
              <h3>{res.issues.length} rij(en) overgeslagen</h3>
              <ul>
                {res.issues.slice(0, 100).map((i, n) => (
                  <li key={n}>
                    <span className="plan-err-reason">
                      {i.rij > 0 ? `rij ${i.rij}: ` : ''}
                      {i.reden}
                    </span>
                    <span className="plan-err-line">{i.ruw}</span>
                  </li>
                ))}
              </ul>
              {res.issues.length > 100 && <p className="pi-hint">… en nog {res.issues.length - 100} andere.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Cijfer({ label, waarde, sterk, waarschuwing }: { label: string; waarde: number; sterk?: boolean; waarschuwing?: boolean }) {
  return (
    <div className={`pi-cijfer${sterk ? ' sterk' : ''}${waarschuwing ? ' waarschuwing' : ''}`}>
      <b>{waarde}</b>
      <i>{label}</i>
    </div>
  )
}

function Lijst({ titel, items }: { titel: string; items: string[] }) {
  return (
    <details className="pi-blok pi-lijst">
      <summary>{titel}</summary>
      <ul>
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </details>
  )
}
