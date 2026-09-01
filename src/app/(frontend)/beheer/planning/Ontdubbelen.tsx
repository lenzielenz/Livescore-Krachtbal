'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateTimeBE } from '@/lib/datetime'
import { ONTDUBBEL_CONFIRM_PHRASE, type OntdubbelResultaat } from '@/lib/match-duplicates'

// Dubbele wedstrijden opruimen — de weg terug voor een kalender die dubbel in de agenda staat.
//
// Dat gebeurde door twee imports die elkaar overlapten: een kalender van 2400 wedstrijden inladen
// duurt minuten, en wie in die tijd niets ziet gebeuren drukt opnieuw. De import is daar nu tegen
// beveiligd, maar wat er al dubbel in stond moet er ook wéér uit kunnen — zonder 2400 rijen met
// de hand na te kijken.
//
// Twee stappen, net als de import: eerst tellen (er wordt niets weggeschreven) en pas daarna
// verwijderen, met de bevestigingsfrase erbij.

export function Ontdubbelen() {
  const [stand, setStand] = useState<OntdubbelResultaat | null>(null)
  const [bezig, setBezig] = useState<'tellen' | 'opruimen' | null>(null)
  const [bevestig, setBevestig] = useState('')
  const [opgeruimd, setOpgeruimd] = useState(false)

  const tellen = async () => {
    if (bezig) return
    setBezig('tellen')
    setOpgeruimd(false)
    try {
      const r = await fetch('/api/planning/ontdubbel', { credentials: 'include' })
      const d = (await r.json()) as OntdubbelResultaat & { error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? 'Nakijken mislukt.')
      setStand(d)
      if (d.overtollig === 0) toast('success', 'Geen dubbele wedstrijden gevonden.')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBezig(null)
    }
  }

  const opruimen = async () => {
    if (bezig || bevestig.trim() !== ONTDUBBEL_CONFIRM_PHRASE) return
    setBezig('opruimen')
    try {
      const r = await fetch('/api/planning/ontdubbel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm: bevestig.trim() }),
      })
      const d = (await r.json()) as OntdubbelResultaat & { error?: string }
      if (!r.ok || d.error) throw new Error(d.error ?? 'Opruimen mislukt.')
      setStand(d)
      setOpgeruimd(true)
      setBevestig('')
      toast('success', `${d.verwijderd ?? 0} dubbele wedstrijden verwijderd.`)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBezig(null)
    }
  }

  return (
    <details className="pi-wipe od">
      <summary>🧹 Dubbele wedstrijden opruimen</summary>
      <p className="pi-hint">
        Staat dezelfde wedstrijd twee keer in de agenda? Dan is er ooit een import dubbel
        gelopen. Hieronder wordt per <strong>reeks, dag en ploegenpaar</strong> gekeken hoeveel
        wedstrijden er te veel staan. Wat er gespeeld is of waar een video aan hangt, blijft
        altijd staan — een lege kopie verdwijnt.
      </p>

      <div className="tm-acties">
        <button type="button" className="va-btn" onClick={() => void tellen()} disabled={bezig != null}>
          {bezig === 'tellen' ? 'Nakijken…' : '1. Nakijken'}
        </button>
      </div>

      {stand && (
        <div className="pi-cijfers">
          <div className="pi-cijfer"><b>{stand.bekeken}</b><i>wedstrijden bekeken</i></div>
          <div className={`pi-cijfer${stand.overtollig > 0 ? ' waarschuwing' : ''}`}>
            <b>{stand.overtollig}</b>
            <i>{opgeruimd ? 'stonden er te veel' : 'staan er te veel'}</i>
          </div>
          <div className="pi-cijfer"><b>{stand.groepen}</b><i>wedstrijden met een dubbel</i></div>
          {stand.verwijderd != null && (
            <div className="pi-cijfer sterk"><b>{stand.verwijderd}</b><i>verwijderd</i></div>
          )}
        </div>
      )}

      {stand && stand.voorbeeld.length > 0 && !opgeruimd && (
        <table className="pi-tabel">
          <thead>
            <tr><th>Wanneer</th><th>Reeks</th><th>Thuis</th><th>Bezoekers</th><th>Aantal</th></tr>
          </thead>
          <tbody>
            {stand.voorbeeld.map((v) => (
              <tr key={`${v.reeks}-${v.datum}-${v.thuis}-${v.uit}`}>
                <td>{formatDateTimeBE(v.datum)}</td>
                <td>{v.reeks}</td>
                <td>{v.thuis}</td>
                <td>{v.uit}</td>
                <td>{v.aantal}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {stand != null && stand.overtollig > 0 && !opgeruimd && (
        <>
          <p className="pi-hint">
            Typ <code>{ONTDUBBEL_CONFIRM_PHRASE}</code> om te bevestigen:
          </p>
          <input
            className="pi-confirm"
            value={bevestig}
            onChange={(e) => setBevestig(e.target.value)}
            placeholder={ONTDUBBEL_CONFIRM_PHRASE}
            aria-label="Bevestiging"
          />
          <div className="tm-acties">
            <button
              type="button"
              className="va-btn primary"
              onClick={() => void opruimen()}
              disabled={bezig != null || bevestig.trim() !== ONTDUBBEL_CONFIRM_PHRASE}
            >
              {bezig === 'opruimen' ? 'Opruimen…' : `2. ${stand.overtollig} dubbels verwijderen`}
            </button>
          </div>
        </>
      )}
    </details>
  )
}
