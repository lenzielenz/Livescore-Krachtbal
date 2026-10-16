'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ClientNotitie } from '@/lib/analyse-notities'

// De wedstrijdvideo met een tijdlijn eronder (zoals bij Veo): de worpen uit de app als merktekens
// (doelpunten groen), je notities als gele vlaggetjes. Tik op een merkteken en de video springt
// erheen. Daaronder de notities: toevoegen (eventueel op het huidige moment), aanpassen, privé
// houden of delen met wie de analyse ziet.

export interface Moment {
  tijdS: number
  soort: 'goal' | 'worp'
  label: string
  kant: 'home' | 'away'
}

const klok = (s: number) => {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s - m * 60)).padStart(2, '0')}`
}

export function AppVideoNotities({
  matchId,
  videoUrl,
  duurS,
  momenten,
  deel,
}: {
  matchId: number
  videoUrl: string | null
  duurS: number | null
  momenten: Moment[]
  /** Deellink-token: alleen lezen, enkel gedeelde notities. */
  deel?: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [duur, setDuur] = useState<number | null>(duurS)
  const [nu, setNu] = useState(0)
  const [notities, setNotities] = useState<ClientNotitie[]>([])
  const [magSchrijven, setMagSchrijven] = useState(false)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [tekst, setTekst] = useState('')
  const [opMoment, setOpMoment] = useState(Boolean(videoUrl))
  const [gedeeld, setGedeeld] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [bewerk, setBewerk] = useState<{ id: ClientNotitie['id']; tekst: string } | null>(null)

  const basis = `/api/analyse/match/${matchId}/notities${deel ? `?deel=${encodeURIComponent(deel)}` : ''}`

  const laad = useCallback(async () => {
    try {
      const r = await fetch(basis, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Notities konden niet geladen worden.')
      setNotities(d.notities)
      setMagSchrijven(Boolean(d.magSchrijven))
      setFout(null)
    } catch (e) {
      setFout((e as Error).message)
    } finally {
      setLaden(false)
    }
  }, [basis])

  useEffect(() => {
    void laad()
  }, [laad])

  const spring = (t: number) => {
    const v = video.current
    if (!v) return
    v.currentTime = Math.max(0, t - 2) // twee tellen aanloop: je ziet de actie ontstaan
    void v.play().catch(() => undefined)
    v.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const voegToe = async () => {
    if (!tekst.trim() || bezig) return
    setBezig(true)
    try {
      const r = await fetch(`/api/analyse/match/${matchId}/notities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tekst,
          tijdS: opMoment && videoUrl ? (video.current?.currentTime ?? nu) : null,
          zichtbaarheid: gedeeld ? 'gedeeld' : 'prive',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Bewaren mislukt.')
      setTekst('')
      await laad()
    } catch (e) {
      setFout((e as Error).message)
    } finally {
      setBezig(false)
    }
  }

  const pas = async (id: ClientNotitie['id'], data: Record<string, unknown>) => {
    const r = await fetch(`/api/analyse/notities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setFout(d.error || 'Aanpassen mislukt.')
    await laad()
  }

  const verwijder = async (id: ClientNotitie['id']) => {
    if (!window.confirm('Deze notitie verwijderen?')) return
    const r = await fetch(`/api/analyse/notities/${id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setFout(d.error || 'Verwijderen mislukt.')
    await laad()
  }

  const totaal = duur && duur > 0 ? duur : Math.max(1, ...momenten.map((m) => m.tijdS), ...notities.map((n) => n.tijdS ?? 0))
  const merk = useMemo(
    () => [
      ...momenten.map((m) => ({ t: m.tijdS, cls: `appv-merk ${m.soort} side-${m.kant}`, titel: m.label })),
      ...notities
        .filter((n) => n.tijdS != null)
        .map((n) => ({ t: n.tijdS as number, cls: 'appv-merk notitie', titel: `${n.auteurNaam}: ${n.tekst.slice(0, 60)}` })),
    ],
    [momenten, notities],
  )

  return (
    <div className="appv">
      {videoUrl ? (
        <>
          <video
            ref={video}
            className="appv-video"
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => setDuur(e.currentTarget.duration || duurS)}
            onTimeUpdate={(e) => setNu(e.currentTarget.currentTime)}
          />
          <div className="appv-tijdlijn" aria-label="Tijdlijn van de wedstrijd">
            <div className="appv-voortgang" style={{ width: `${Math.min(100, (nu / totaal) * 100)}%` }} />
            {merk.map((m, i) => (
              <button
                key={i}
                type="button"
                className={m.cls}
                style={{ left: `${Math.min(100, (m.t / totaal) * 100)}%` }}
                title={`${klok(m.t)} · ${m.titel}`}
                aria-label={`${klok(m.t)} · ${m.titel}`}
                onClick={() => spring(m.t)}
              />
            ))}
          </div>
          {momenten.length > 0 && (
            <div className="appv-momenten">
              {momenten.map((m, i) => (
                <button key={i} type="button" className={`appv-chip ${m.soort} side-${m.kant}`} onClick={() => spring(m.tijdS)}>
                  <b>{klok(m.tijdS)}</b> {m.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="appa-uitleg">
          De wedstrijdvideo staat niet op de site (te groot om mee te sturen). De volgcamera en het wedstrijdcentrum
          tonen de wedstrijd wel; notities kan je hieronder gewoon toevoegen.
        </p>
      )}

      <div className="appv-notities" id="notities">
        <h3>
          Notities <span className="an-chart-hint">{notities.length || ''}</span>
        </h3>
        {magSchrijven && (
          <div className="appv-nieuw">
            <textarea
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              placeholder={videoUrl ? 'Wat valt je op? Pauzeer de video op het moment en schrijf het hier.' : 'Wat valt je op?'}
              maxLength={2000}
              rows={3}
            />
            <div className="appv-opties">
              {videoUrl && (
                <label>
                  <input type="checkbox" checked={opMoment} onChange={(e) => setOpMoment(e.target.checked)} /> Op{' '}
                  {klok(nu)} in de video
                </label>
              )}
              <label>
                <input type="checkbox" checked={gedeeld} onChange={(e) => setGedeeld(e.target.checked)} /> Delen met wie de
                analyse ziet
              </label>
              <button type="button" className="appa-knop vol" disabled={bezig || !tekst.trim()} onClick={voegToe}>
                {bezig ? 'Bewaren…' : 'Notitie toevoegen'}
              </button>
            </div>
          </div>
        )}
        {fout && <p className="appv-fout" role="alert">{fout}</p>}
        {laden ? (
          <p className="appa-uitleg">Notities laden…</p>
        ) : notities.length === 0 ? (
          <p className="appa-uitleg">{magSchrijven ? 'Nog geen notities.' : 'Er zijn geen gedeelde notities.'}</p>
        ) : (
          <ul className="appv-lijst">
            {notities.map((n) => (
              <li key={n.id} className={n.zichtbaarheid === 'gedeeld' ? 'gedeeld' : 'prive'}>
                <div className="appv-notitie-kop">
                  {n.tijdS != null && videoUrl ? (
                    <button type="button" className="appv-tijd" onClick={() => spring(n.tijdS as number)}>
                      ▶ {klok(n.tijdS)}
                    </button>
                  ) : n.tijdS != null ? (
                    <span className="appv-tijd">{klok(n.tijdS)}</span>
                  ) : null}
                  <span className="appv-wie">{n.auteurNaam}</span>
                  <span className="appv-zicht">{n.zichtbaarheid === 'gedeeld' ? 'gedeeld' : 'privé'}</span>
                </div>
                {bewerk?.id === n.id ? (
                  <div className="appv-bewerk">
                    <textarea value={bewerk.tekst} onChange={(e) => setBewerk({ id: n.id, tekst: e.target.value })} rows={3} maxLength={2000} />
                    <button type="button" className="appa-knop vol" onClick={() => void pas(n.id, { tekst: bewerk.tekst }).then(() => setBewerk(null))}>
                      Bewaren
                    </button>
                    <button type="button" className="appa-knop" onClick={() => setBewerk(null)}>
                      Annuleren
                    </button>
                  </div>
                ) : (
                  <p className="appv-tekst">{n.tekst}</p>
                )}
                {(n.eigen || n.magVerwijderen) && bewerk?.id !== n.id && (
                  <div className="appv-acties">
                    {n.eigen && (
                      <>
                        <button type="button" onClick={() => setBewerk({ id: n.id, tekst: n.tekst })}>Aanpassen</button>
                        <button type="button" onClick={() => void pas(n.id, { zichtbaarheid: n.zichtbaarheid === 'gedeeld' ? 'prive' : 'gedeeld' })}>
                          {n.zichtbaarheid === 'gedeeld' ? 'Privé maken' : 'Delen'}
                        </button>
                      </>
                    )}
                    {n.magVerwijderen && (
                      <button type="button" onClick={() => void verwijder(n.id)}>Verwijderen</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
