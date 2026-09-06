'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { CastKnop } from '@/components/CastKnop'

import type { KantineMatch } from './KantineBoard'
import { type KantineSelectie } from '@/lib/kantine-selectie'

// Jouw eigen kantinescherm samenstellen. Het tornooischerm sloeg aan, dus nu hetzelfde voor de
// competitie — maar per ingelogde gebruiker in plaats van één centrale lijst voor iedereen.
//
// Elke wijziging bewaart meteen (geen "opslaan"-knop): je staat hier vaak met je gsm naast de tv,
// en dan wil je de tv zien meebewegen terwijl je aanvinkt.

type Club = { id: number; name: string }
type Ploeg = { id: number; name: string; clubId: number | null }

export function MijnKantineScherm({
  userId,
  clubs,
  ploegen,
  matches,
  initieel,
}: {
  userId: number
  clubs: Club[]
  ploegen: Ploeg[]
  matches: KantineMatch[]
  initieel: KantineSelectie
}) {
  const [sel, setSel] = useState<KantineSelectie>(initieel)
  const [bezig, setBezig] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)

  // De volledige link heeft het domein nodig; dat kent de server niet. Pas ná de eerste render
  // invullen, anders wijkt de server-HTML af van wat de browser maakt (hydratatiefout).
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const pad = `/kantine/scherm/${userId}`
  const url = origin ? `${origin}${pad}` : ''

  const bewaar = async (next: KantineSelectie) => {
    setBezig(true)
    try {
      await fetch('/api/kantine/mijn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    } catch {
      /* stil — de volgende wijziging probeert opnieuw */
    } finally {
      setBezig(false)
    }
  }

  const wissel = (veld: keyof KantineSelectie, id: number) => {
    setSel((vorige) => {
      const lijst = new Set(vorige[veld])
      if (lijst.has(id)) lijst.delete(id)
      else lijst.add(id)
      const next = { ...vorige, [veld]: [...lijst] }
      void bewaar(next)
      return next
    })
  }

  // Ploegen tonen we van de clubs die je koos — dat is de lijst waarin je wil verfijnen. Koos je
  // nog geen club, dan alle ploegen, zodat je er ook eentje van een andere club bij kan nemen.
  const zichtbarePloegen = useMemo(() => {
    if (sel.clubIds.length === 0) return ploegen
    const gekozen = new Set(sel.clubIds)
    return ploegen.filter((p) => (p.clubId != null && gekozen.has(p.clubId)) || sel.teamIds.includes(p.id))
  }, [ploegen, sel.clubIds, sel.teamIds])

  const leeg = sel.clubIds.length === 0 && sel.teamIds.length === 0 && sel.matchIds.length === 0

  return (
    <div className="kt-mijn">
      <section className="kt-uitleg">
        <h2 className="kt-uitleg-title">📺 Jouw kantinescherm</h2>
        <p className="kt-uitleg-lead">
          Iedereen die inlogt maakt hier zijn eigen kantinescherm. Je kiest één keer wat je wil
          volgen, zet de vaste link op de tv, en verder heb je er geen werk meer aan.
        </p>
        <ol className="kt-uitleg-lijst">
          <li>
            <strong>Kies je club.</strong> Vanaf dan komen <em>alle</em> wedstrijden van die club
            automatisch op het scherm, heel het jaar door — zodra een wedstrijd start, verschijnt ze
            vanzelf met de live stand erbij.
          </li>
          <li>
            <strong>Doordeweeks zie je wat eraan komt.</strong> Is er niets bezig, dan toont het
            scherm de geplande wedstrijden van de komende week, met een aftelling naar de
            eerstvolgende.
          </li>
          <li>
            <strong>Wil je er nog iets bij?</strong> Vink losse ploegen of wedstrijden aan — ook van
            een andere club. Die komen er gewoon bij in de lijst, naast wat je club al aanbrengt.
          </li>
          <li>
            <strong>Zet de link op de tv.</strong> Hij verandert nooit meer, dus één keer instellen
            volstaat voor het hele seizoen.
          </li>
        </ol>
      </section>

      <section className="kt-blok">
        <h3 className="kt-blok-title">1 · Je club{clubs.length > 1 ? '(s)' : ''}</h3>
        <p className="kt-blok-sub">Alles van deze club komt automatisch op het scherm.</p>
        <div className="kt-chips">
          {clubs.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`kt-chip ${sel.clubIds.includes(c.id) ? 'on' : ''}`}
              onClick={() => wissel('clubIds', c.id)}
              aria-pressed={sel.clubIds.includes(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>

      <section className="kt-blok">
        <h3 className="kt-blok-title">2 · Losse ploegen <span className="kt-blok-opt">(optioneel)</span></h3>
        <p className="kt-blok-sub">
          Eén ploeg volgen zonder heel de club? Of net een ploeg van een andere club erbij? Vink ze
          hier aan.
        </p>
        <div className="kt-chips">
          {zichtbarePloegen.length === 0 ? (
            <p className="kt-empty">Geen ploegen gevonden.</p>
          ) : (
            zichtbarePloegen.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`kt-chip ${sel.teamIds.includes(p.id) ? 'on' : ''}`}
                onClick={() => wissel('teamIds', p.id)}
                aria-pressed={sel.teamIds.includes(p.id)}
              >
                {p.name}
              </button>
            ))
          )}
        </div>
      </section>

      <section className="kt-blok">
        <h3 className="kt-blok-title">3 · Losse wedstrijden <span className="kt-blok-opt">(optioneel)</span></h3>
        <p className="kt-blok-sub">
          Een affiche die je deze week sowieso wil meepikken. Deze blijven op je scherm staan zolang
          ze bezig of gepland zijn.
        </p>
        {matches.length === 0 ? (
          <p className="kt-empty">Deze week staan er geen wedstrijden gepland.</p>
        ) : (
          <div className="kt-pick-list">
            {matches.map((m) => {
              const aan = sel.matchIds.includes(m.id)
              return (
                <button
                  type="button"
                  key={m.id}
                  className={`kt-pick ${aan ? 'on' : ''} ${m.status === 'live' ? 'live' : ''}`}
                  onClick={() => wissel('matchIds', m.id)}
                  aria-pressed={aan}
                >
                  <span className="kt-pick-top">
                    <span className={`kt-pick-badge ${m.status}`}>
                      {m.status === 'live' ? '● LIVE' : m.status === 'finished' ? 'Einde' : m.time}
                    </span>
                    <span className="kt-pick-reeks">{m.reeks}</span>
                  </span>
                  <span className="kt-pick-match">
                    <span className="kt-pick-team">{m.home.name}</span>
                    <span className="kt-pick-vs">vs</span>
                    <span className="kt-pick-team">{m.away.name}</span>
                  </span>
                  <span className="kt-pick-check" aria-hidden>{aan ? '✓' : '+'}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="kt-blok kt-blok-link">
        <h3 className="kt-blok-title">4 · Zet hem op de tv</h3>
        {leeg ? (
          <p className="kt-blok-sub">
            Kies eerst hierboven je club — daarna verschijnt hier de vaste link voor je kantine-tv.
          </p>
        ) : (
          <>
            <p className="kt-blok-sub">
              Deze link is van jou en verandert nooit. Open hem op de tv, of cast hem rechtstreeks.
            </p>
            <div className="kt-clublink-row">
              <input className="kt-clublink-url" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                className="kt-clublink-btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(url)
                  setGekopieerd(true)
                  setTimeout(() => setGekopieerd(false), 2000)
                }}
              >
                {gekopieerd ? '✓ Gekopieerd' : '🔗 Kopieer'}
              </button>
              <CastKnop pad={pad} sleutel={`kantine-${userId}`} label="📺 Cast naar tv" />
              <Link href={pad} className="kt-screen-btn">📺 Open mijn kantinescherm →</Link>
            </div>
          </>
        )}
        <p className="kt-control-status">
          {bezig
            ? 'Opslaan…'
            : leeg
              ? 'Nog niets gekozen'
              : `Bewaard — ${sel.clubIds.length} club(s), ${sel.teamIds.length} ploeg(en), ${sel.matchIds.length} losse wedstrijd(en)`}
        </p>
      </section>
    </div>
  )
}
