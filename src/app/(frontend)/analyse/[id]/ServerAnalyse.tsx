'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// De video-analyse laten draaien op de server: één knop, en de voortgang blijft staan ook al
// klap je de pagina dicht. Het rekenwerk (worpen zoeken, bal volgen, spelers herkennen) duurt
// minuten tot een uur, dus de stand komt uit de database en niet uit deze component.

type Stand = {
  status: 'wachtrij' | 'bezig' | 'klaar' | 'mislukt' | 'afgebroken'
  stap: string
  stapNummer: number
  stappen: number
  gestart: string
  geeindigd?: string
  fout?: string
  rapport?: { voorstellen?: number; detecties?: number; metLanding?: number; duurSeconden?: number }
  instellingen?: { stand: string; bewegend: boolean; tracking: boolean; overlay: boolean }
}

type Antwoord = {
  stand: Stand | null
  kanAnalyseren: boolean
  reden: string | null
  heeftKalibratie: boolean
  andereLoopt: boolean
}

const duurTekst = (s?: number) =>
  s == null ? '' : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`

export function ServerAnalyse({ matchId, heeftVideo }: { matchId: number; heeftVideo: boolean }) {
  const [info, setInfo] = useState<Antwoord | null>(null)
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [stand, setStand] = useState<'snel' | 'gewoon' | 'nauwkeurig'>('gewoon')
  const [bewegend, setBewegend] = useState(false)
  const [tracking, setTracking] = useState(false)
  const timer = useRef<number | null>(null)

  const haal = useCallback(async () => {
    try {
      const res = await fetch(`/api/cv/match/${matchId}/analyseer`)
      if (!res.ok) return
      setInfo((await res.json()) as Antwoord)
    } catch {
      /* stil: een mislukte peiling is geen fout die de gebruiker moet zien */
    }
  }, [matchId])

  useEffect(() => {
    void haal()
  }, [haal])

  // Zolang er iets draait: elke vijf seconden kijken. Niet vaker — het is rekenwerk van
  // minuten, en elke peiling kost de server een databaseronde.
  const draait = info?.stand?.status === 'bezig' || info?.stand?.status === 'wachtrij'
  useEffect(() => {
    if (!draait) return
    timer.current = window.setInterval(() => void haal(), 5000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [draait, haal])

  const start = async () => {
    setBusy(true)
    setFout(null)
    try {
      const res = await fetch(`/api/cv/match/${matchId}/analyseer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stand, bewegend, tracking, overlay: true }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setFout(data.error ?? 'Starten mislukt.')
        return
      }
      await haal()
    } catch {
      setFout('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    try {
      await fetch(`/api/cv/match/${matchId}/analyseer`, { method: 'DELETE' })
      await haal()
    } finally {
      setBusy(false)
    }
  }

  if (!heeftVideo) return null
  const s = info?.stand ?? null
  const pct = s && s.stappen > 0 ? Math.round(((s.stapNummer - 1) / s.stappen) * 100) : 0

  return (
    <section className="sa" id="serveranalyse">
      <h2 className="an-h2">🤖 Video automatisch analyseren</h2>

      {info && !info.kanAnalyseren && (
        <p className="sa-let-op">{info.reden}</p>
      )}

      {draait ? (
        <div className="sa-bezig">
          <div className="sa-balk" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.max(6, pct)}%` }} />
          </div>
          <p className="sa-stap">
            <strong>Stap {s?.stapNummer} van {s?.stappen}:</strong> {s?.stap}…
          </p>
          <p className="sa-hint">
            Dit duurt minuten tot een uur, afhankelijk van de lengte van de video. Je mag deze
            pagina gerust sluiten — de analyse loopt door en de stand blijft hier staan.
          </p>
          <button type="button" className="va-btn" disabled={busy} onClick={() => void stop()}>
            Analyse afbreken
          </button>
        </div>
      ) : (
        <>
          {s?.status === 'klaar' && (
            <p className="sa-klaar">
              ✅ Klaar in {duurTekst(s.rapport?.duurSeconden)}: <strong>{s.rapport?.voorstellen ?? 0} voorstellen</strong>
              {s.rapport?.metLanding ? ` (${s.rapport.metLanding} met landingspunt)` : ''} — bekijk en
              bevestig ze hierboven bij de video.
            </p>
          )}
          {s?.status === 'mislukt' && <p className="sa-let-op">❌ Mislukt: {s.fout}</p>}
          {s?.status === 'afgebroken' && <p className="sa-let-op">⏹ Afgebroken. {s.fout ?? ''}</p>}

          <p className="sa-lead">
            De server zoekt zelf de worpen in de opname en zet ze klaar als voorstellen die jij
            bevestigt of afwijst.
            {info && !info.heeftKalibratie && (
              <>
                {' '}Zonder veldkalibratie weet hij <em>wanneer</em> er geworpen wordt, maar niet
                waar de bal landt — kalibreer hieronder om ook zones en afstanden te krijgen.
              </>
            )}
          </p>

          <div className="sa-opties">
            <label className="sa-optie">
              <span>Precisie</span>
              <select value={stand} onChange={(e) => setStand(e.target.value as typeof stand)}>
                <option value="snel">Snel</option>
                <option value="gewoon">Gewoon</option>
                <option value="nauwkeurig">Nauwkeurig (traagst)</option>
              </select>
            </label>
            <label className="sa-vink">
              <input type="checkbox" checked={bewegend} onChange={(e) => setBewegend(e.target.checked)} />
              <span>Camera bewoog (gsm in de hand)</span>
            </label>
            <label className="sa-vink">
              <input type="checkbox" checked={tracking} onChange={(e) => setTracking(e.target.checked)} />
              <span>Ook spelers volgen (loopafstand, sprintjes)</span>
            </label>
          </div>

          <div className="sa-acties">
            <button
              type="button"
              className="va-btn primary"
              disabled={busy || !info?.kanAnalyseren || info?.andereLoopt}
              onClick={() => void start()}
            >
              {busy ? 'Starten…' : s?.status === 'klaar' ? '🤖 Opnieuw analyseren' : '🤖 Analyseer de video'}
            </button>
            {info?.andereLoopt && (
              <span className="sa-hint">Er loopt al een analyse van een andere wedstrijd — even wachten.</span>
            )}
          </div>
          {fout && <p className="sa-let-op">{fout}</p>}
        </>
      )}
    </section>
  )
}
