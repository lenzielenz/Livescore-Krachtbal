'use client'

// Brug naar de externe Google Cast Sender-SDK, die geen TypeScript-types meelevert.
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { CAST_APP_ID, CAST_NAMESPACE } from '@/lib/cast'

export type CastMatch = {
  id: number
  reeks: string
  time: string
  status: string
  home: string
  away: string
}

const SENDER_SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

type Slot = 'veld' | 'kantine'

// Eén bedienpaneel voor twee schermen. Per slot (veld + kantine) houden we een
// aparte Cast-sessie naar een eigen Chromecast bij, zodat je vanaf dit ene
// toestel beide tv's tegelijk aanstuurt en de controle hier houdt.
export function CastHub({ matches }: { matches: CastMatch[] }) {
  const [ready, setReady] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<number | null>(matches[0]?.id ?? null)

  // Verbonden toestelnaam per slot (voor de UI); de sessies zelf in een ref.
  const [device, setDevice] = useState<Record<Slot, string | null>>({ veld: null, kantine: null })
  const sessions = useRef<Record<Slot, any | null>>({ veld: null, kantine: null })

  // Cast-SDK laden en initialiseren.
  useEffect(() => {
    if (!CAST_APP_ID) return
    let cancelled = false

    const initApi = () => {
      const chrome = (window as any).chrome
      if (!chrome?.cast) {
        setUnsupported(true)
        return
      }
      const sessionRequest = new chrome.cast.SessionRequest(CAST_APP_ID)
      const apiConfig = new chrome.cast.ApiConfig(
        sessionRequest,
        () => {}, // bestaande sessies beheren we expliciet via requestSession
        () => {}, // ontvanger-beschikbaarheid — niet nodig
        chrome.cast.AutoJoinPolicy.PAGE_SCOPED,
      )
      chrome.cast.initialize(
        apiConfig,
        () => {
          if (!cancelled) setReady(true)
        },
        () => {
          if (!cancelled) setUnsupported(true)
        },
      )
    }

    ;(window as any).__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) initApi()
      else setUnsupported(true)
    }

    if ((window as any).chrome?.cast) {
      initApi()
    } else if (!document.querySelector(`script[src="${SENDER_SDK}"]`)) {
      const s = document.createElement('script')
      s.src = SENDER_SDK
      s.onerror = () => setUnsupported(true)
      document.head.appendChild(s)
    }

    return () => {
      cancelled = true
    }
  }, [])

  // Pad naar een bestaande sessie sturen. Bij een verse verbinding herhalen we
  // het bericht enkele keren: de ontvanger heeft even nodig om zijn kanaal te
  // registreren, anders gaat het eerste bericht verloren.
  const sendPath = (session: any, path: string, retry = false) => {
    const send = () => session.sendMessage(CAST_NAMESPACE, { path }, () => {}, () => {})
    send()
    if (retry) {
      setTimeout(send, 1200)
      setTimeout(send, 3000)
    }
  }

  const cast = (slot: Slot, path: string) => {
    const chrome = (window as any).chrome
    const existing = sessions.current[slot]
    if (existing) {
      // Al verbonden: enkel het nieuwe pad doorsturen (bv. andere wedstrijd).
      sendPath(existing, path)
      return
    }
    chrome.cast.requestSession(
      (session: any) => {
        sessions.current[slot] = session
        setDevice((d) => ({ ...d, [slot]: session.receiver?.friendlyName ?? 'Chromecast' }))
        session.addUpdateListener((isAlive: boolean) => {
          const stopped = session.status === chrome.cast.SessionStatus.STOPPED
          if (!isAlive || stopped) {
            if (sessions.current[slot] === session) {
              sessions.current[slot] = null
              setDevice((d) => ({ ...d, [slot]: null }))
            }
          }
        })
        sendPath(session, path, true)
      },
      () => {
        // Gebruiker sloot de toestelkiezer of er ging iets mis — stil negeren.
      },
    )
  }

  const stop = (slot: Slot) => {
    const session = sessions.current[slot]
    if (session) session.stop(() => {}, () => {})
    sessions.current[slot] = null
    setDevice((d) => ({ ...d, [slot]: null }))
  }

  const selected = matches.find((m) => m.id === selectedMatch) ?? null
  const veldPath = selectedMatch ? `/veld/${selectedMatch}` : null

  if (!CAST_APP_ID) {
    return (
      <div className="cast-note cast-note-warn">
        <strong>Casten is nog niet ingesteld.</strong>
        <p>
          Registreer een Google Cast App ID en zet die in <code>NEXT_PUBLIC_CAST_APP_ID</code>. De volledige
          uitleg staat in <code>docs/CHROMECAST.md</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="cast-hub">
      <p className="cast-intro">
        Stuur het <strong>veldscherm</strong> en het <strong>kantinescherm</strong> naar twee Chromecasts. Je
        houdt de bediening op dit toestel — kies hieronder per scherm een tv.
      </p>

      {unsupported && (
        <div className="cast-note cast-note-warn">
          Deze browser kan niet casten. Gebruik <strong>Google Chrome</strong> of <strong>Edge</strong> op een
          computer of Android-toestel. Op iPhone/iPad ondersteunt de browser geen Chromecast.
        </div>
      )}

      <div className="cast-grid">
        {/* Veldscherm-slot */}
        <section className="cast-card">
          <div className="cast-card-head">
            <span className="cast-card-icon">🏟️</span>
            <h2 className="cast-card-title">Veldscherm</h2>
          </div>
          <p className="cast-card-sub">Het volledige scorebord van één wedstrijd op de tv aan het veld.</p>

          {matches.length === 0 ? (
            <p className="cast-empty">Geen wedstrijden vandaag.</p>
          ) : (
            <label className="cast-field">
              <span className="cast-field-label">Wedstrijd</span>
              <select
                className="cast-select"
                value={selectedMatch ?? ''}
                onChange={(e) => setSelectedMatch(Number(e.target.value))}
              >
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.status === 'live' ? 'LIVE' : m.status === 'finished' ? 'einde' : m.time} · {m.home} – {m.away}
                  </option>
                ))}
              </select>
            </label>
          )}

          {device.veld ? (
            <div className="cast-connected">
              <span className="cast-dot" /> Op <strong>{device.veld}</strong>
              {selected && <span className="cast-onnow">{selected.home} – {selected.away}</span>}
              <div className="cast-actions">
                <button type="button" className="cast-btn ghost" disabled={!veldPath} onClick={() => veldPath && cast('veld', veldPath)}>
                  Wissel wedstrijd
                </button>
                <button type="button" className="cast-btn stop" onClick={() => stop('veld')}>
                  Stop
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="cast-btn"
              disabled={!ready || !veldPath}
              onClick={() => veldPath && cast('veld', veldPath)}
            >
              📺 {ready ? 'Cast veldscherm' : 'Cast laden…'}
            </button>
          )}
        </section>

        {/* Kantinescherm-slot */}
        <section className="cast-card">
          <div className="cast-card-head">
            <span className="cast-card-icon">🍻</span>
            <h2 className="cast-card-title">Kantinescherm</h2>
          </div>
          <p className="cast-card-sub">
            Alle gekozen wedstrijden naast elkaar. Kies welke verschijnen via{' '}
            <Link href="/kantine" className="cast-link">Kantine</Link>.
          </p>

          {device.kantine ? (
            <div className="cast-connected">
              <span className="cast-dot" /> Op <strong>{device.kantine}</strong>
              <div className="cast-actions">
                <button type="button" className="cast-btn stop" onClick={() => stop('kantine')}>
                  Stop
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="cast-btn"
              disabled={!ready}
              onClick={() => cast('kantine', '/kantine/scherm')}
            >
              📺 {ready ? 'Cast kantinescherm' : 'Cast laden…'}
            </button>
          )}
        </section>
      </div>

      <p className="cast-tip">
        Tip: kies bij elke knop een <em>andere</em> Chromecast in het toestelvenster, zodat beide schermen
        tegelijk draaien.
      </p>
    </div>
  )
}
