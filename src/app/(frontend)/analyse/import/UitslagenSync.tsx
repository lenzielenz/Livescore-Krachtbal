'use client'

import { useState } from 'react'

type Rapport = {
  ok?: boolean
  commit?: boolean
  url?: string
  gelezen?: number
  gespeeld?: number
  gekoppeld?: number
  bijgewerkt?: number
  ongewijzigd?: number
  zelfAangetekend?: string[]
  conflicten?: string[]
  onbekend?: string[]
  reeksOnbekend?: string[]
  voorbeelden?: string[]
  fouten?: string[]
  fragment?: string
  error?: string
}

// Uitslagen rechtstreeks bij de federatie ophalen. De server doet de fetch (de browser mag
// krachtbal.be niet uitlezen) en toont eerst een voorbeschouwing: pas na "Overnemen" wordt er
// iets weggeschreven.
export function UitslagenSync() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [rapport, setRapport] = useState<Rapport | null>(null)

  const run = async (commit: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/results/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commit, ...(url.trim() ? { url: url.trim() } : {}) }),
      })
      setRapport(await res.json())
    } catch (e) {
      setRapport({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const lijst = (titel: string, items: string[] | undefined, hint?: string, open = false) =>
    items && items.length > 0 ? (
      <details className="imp-det" open={open}>
        <summary>
          {titel}: {items.length}
        </summary>
        <ul>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
        {hint && <p className="imp-hint">{hint}</p>}
      </details>
    ) : null

  return (
    <div className="imp">
      <label className="imp-check" style={{ display: 'block' }}>
        Adres (leeg = de kalenderpagina van krachtbal.be)
        <input
          className="va-url"
          type="url"
          inputMode="url"
          placeholder="https://www.krachtbal.be/kalender.php"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: '100%', marginTop: 6 }}
        />
      </label>

      <div className="imp-actions">
        <button type="button" className="sk-btn" disabled={busy} onClick={() => void run(false)}>
          {busy ? 'Bezig…' : '👁 Ophalen en tonen (niets opslaan)'}
        </button>
        <button type="button" className="sk-btn primary" disabled={busy} onClick={() => void run(true)}>
          {busy ? 'Bezig…' : '⬇ Uitslagen overnemen'}
        </button>
      </div>

      {rapport &&
        (rapport.error ? (
          <p className="wb-msg">{rapport.error}</p>
        ) : (
          <div className="imp-report">
            <div className="rep-cards">
              <div className="rep-card"><span className="rep-num">{rapport.gespeeld ?? 0}</span><span className="rep-lbl">Uitslagen</span></div>
              <div className="rep-card"><span className="rep-num">{rapport.gekoppeld ?? 0}</span><span className="rep-lbl">Herkend</span></div>
              <div className="rep-card"><span className="rep-num">{rapport.bijgewerkt ?? 0}</span><span className="rep-lbl">{rapport.commit ? 'Overgenomen' : 'Zou overnemen'}</span></div>
              <div className="rep-card"><span className="rep-num">{rapport.ongewijzigd ?? 0}</span><span className="rep-lbl">Al gelijk</span></div>
              <div className="rep-card"><span className="rep-num">{rapport.zelfAangetekend?.length ?? 0}</span><span className="rep-lbl">Zelf geteld</span></div>
            </div>
            <p className="imp-note">
              {rapport.commit
                ? `✓ ${rapport.bijgewerkt ?? 0} uitslagen overgenomen van ${rapport.url ?? 'de federatie'}.`
                : 'Voorbeeld — er is nog niets opgeslagen. Controleer hieronder en klik "Uitslagen overnemen".'}
            </p>

            {lijst('Herkende uitslagen', rapport.voorbeelden, undefined, true)}
            {lijst(
              '⚠ Andere stand bij ons',
              rapport.conflicten,
              'De federatie is de officiële bron, dus haar uitslag wordt overgenomen. Loopt dit vaak op, kijk dan na wie er aantekende.',
            )}
            {lijst(
              '↷ Zelf aangetekend — niet aangeraakt',
              rapport.zelfAangetekend,
              'Deze wedstrijden hebben eigen worpdata of een ingediend wedstrijdblad. Die tellen zwaarder dan een webpagina, dus we laten ze staan.',
            )}
            {lijst(
              '? Niet teruggevonden in onze kalender',
              rapport.onbekend,
              'Meestal een ploegnaam die anders geschreven staat, of een wedstrijd die nog niet in het speelplan zit.',
            )}
            {lijst('↷ Onbekende reeksen', rapport.reeksOnbekend)}
            {lijst('Fouten', rapport.fouten)}

            {rapport.gelezen === 0 && (
              <details className="imp-det" open>
                <summary>Niets herkend op die pagina</summary>
                <p className="imp-hint">
                  De pagina is opgehaald, maar er stonden geen leesbare uitslagen in. Hieronder het
                  begin van de eerste tabel — stuur dat door, dan stemmen we de lezing erop af.
                </p>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.72rem', overflowX: 'auto' }}>{rapport.fragment}</pre>
              </details>
            )}
          </div>
        ))}
    </div>
  )
}
