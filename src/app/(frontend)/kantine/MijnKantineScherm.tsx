'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { CastKnop } from '@/components/CastKnop'

import {
  MAX_PROFIELEN,
  nieuwProfiel,
  veiligeProfielnaam,
  type KantineProfiel,
} from '@/lib/kantine-profielen'
import { selectieIsLeeg, type KantineSelectie } from '@/lib/kantine-selectie'

// Jouw eigen kantineschermen samenstellen. Het tornooischerm sloeg aan, dus nu hetzelfde voor de
// competitie — maar per ingelogde gebruiker in plaats van één centrale lijst.
//
// En niet één scherm, maar zoveel als je er hangen hebt: een club heeft vlot een tv in de kantine,
// één in de bestuurszaal en één bij de jeugdterreinen, en die willen elk iets anders zien. Elk
// profiel krijgt een naam en een eigen vaste link.
//
// Elke wijziging bewaart meteen (geen "opslaan"-knop): je staat hier vaak met je gsm naast de tv,
// en dan wil je de tv zien meebewegen terwijl je aanvinkt.

type Club = { id: number; name: string }
/** `sub` = de reeks (of anders de categorie). Zonder dat label lijken alle ploegen van een club op elkaar. */
type Ploeg = { id: number; name: string; clubId: number | null; sub?: string }
/**
 * Eén regel in de lijst "losse wedstrijden". Bewust smaller dan een bord op het scherm: hier
 * staan enkel het uur, de reeks, de status en de twee ploegnamen. De stand en de logo's horen bij
 * het scherm zelf — ze hier óók opbouwen kostte een volledige matchstate per wedstrijd en maakte
 * deze pagina onbruikbaar traag.
 */
export type KantineKeuze = {
  id: number
  reeks: string
  time: string
  status: string
  home: { name: string }
  away: { name: string }
}

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
  matches: KantineKeuze[]
  initieel: KantineProfiel[]
}) {
  // Nog geen profiel? Dan begint iedereen met één leeg scherm — anders staat deze pagina er
  // zonder aanknopingspunt bij.
  const [profielen, setProfielen] = useState<KantineProfiel[]>(() => (initieel.length ? initieel : [nieuwProfiel([])]))
  const [actiefId, setActiefId] = useState(() => (initieel[0]?.id ?? profielen[0].id))
  const [bezig, setBezig] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)
  const [hernoemt, setHernoemt] = useState(false)
  const [ploegZoek, setPloegZoek] = useState('')
  const [wedstrijdZoek, setWedstrijdZoek] = useState('')

  const actief = profielen.find((p) => p.id === actiefId) ?? profielen[0]
  const sel: KantineSelectie = actief

  // De volledige link heeft het domein nodig; dat kent de server niet. Pas ná de eerste render
  // invullen, anders wijkt de server-HTML af van wat de browser maakt (hydratatiefout).
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  // Elk profiel heeft zijn eigen pad. Het eerste profiel is óók bereikbaar via het korte pad
  // zonder profiel — dat is de link die vóór de profielen bestond en op een tv kan hangen.
  const pad = `/kantine/scherm/${userId}/${actief.id}`
  const url = origin ? `${origin}${pad}` : ''

  const bewaar = async (next: KantineProfiel[]) => {
    setBezig(true)
    try {
      await fetch('/api/kantine/mijn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profielen: next }),
      })
    } catch {
      /* stil — de volgende wijziging probeert opnieuw */
    } finally {
      setBezig(false)
    }
  }

  /** Werk het actieve profiel bij en bewaar de hele lijst. */
  const pasAan = (maak: (p: KantineProfiel) => KantineProfiel) => {
    setProfielen((vorige) => {
      const next = vorige.map((p) => (p.id === actief.id ? maak(p) : p))
      void bewaar(next)
      return next
    })
  }

  const wissel = (veld: keyof KantineSelectie, id: number) => {
    pasAan((p) => {
      const lijst = new Set(p[veld])
      if (lijst.has(id)) lijst.delete(id)
      else lijst.add(id)
      return { ...p, [veld]: [...lijst] }
    })
  }

  const voegToe = () => {
    setProfielen((vorige) => {
      if (vorige.length >= MAX_PROFIELEN) return vorige
      const vers = nieuwProfiel(vorige)
      const next = [...vorige, vers]
      setActiefId(vers.id)
      void bewaar(next)
      return next
    })
  }

  const verwijder = () => {
    if (profielen.length <= 1) return
    if (!confirm(`Scherm "${actief.naam}" verwijderen? De link ernaartoe werkt daarna niet meer.`)) return
    setProfielen((vorige) => {
      const next = vorige.filter((p) => p.id !== actief.id)
      setActiefId(next[0].id)
      void bewaar(next)
      return next
    })
  }

  const hernoem = (ruw: string) => pasAan((p) => ({ ...p, naam: veiligeProfielnaam(ruw, p.naam) }))

  // Ploegen tonen we van de clubs die je koos — dat is de lijst waarin je wil verfijnen. Koos je
  // nog geen club, dan alle ploegen, zodat je er ook eentje van een andere club bij kan nemen.
  const zichtbarePloegen = useMemo(() => {
    if (sel.clubIds.length === 0) return ploegen
    const gekozen = new Set(sel.clubIds)
    return ploegen.filter((p) => (p.clubId != null && gekozen.has(p.clubId)) || sel.teamIds.includes(p.id))
  }, [ploegen, sel.clubIds, sel.teamIds])

  const gefilterdePloegen = useMemo(() => {
    const zoek = ploegZoek.trim().toLocaleLowerCase('nl-BE')
    return zichtbarePloegen
      .filter((p) => !zoek || `${p.name} ${p.sub ?? ''}`.toLocaleLowerCase('nl-BE').includes(zoek))
      .slice().sort((a, b) => {
        const gekozenVerschil = Number(sel.teamIds.includes(b.id)) - Number(sel.teamIds.includes(a.id))
        return gekozenVerschil || a.name.localeCompare(b.name, 'nl-BE')
      })
  }, [zichtbarePloegen, ploegZoek, sel.teamIds])

  const gefilterdeWedstrijden = useMemo(() => {
    const zoek = wedstrijdZoek.trim().toLocaleLowerCase('nl-BE')
    return matches
      .filter((m) => !zoek || `${m.home.name} ${m.away.name} ${m.reeks} ${m.time}`.toLocaleLowerCase('nl-BE').includes(zoek))
      .slice().sort((a, b) => Number(sel.matchIds.includes(b.id)) - Number(sel.matchIds.includes(a.id)))
  }, [matches, wedstrijdZoek, sel.matchIds])

  const leeg = selectieIsLeeg(sel)

  return (
    <div className="kt-mijn">
      <section className="kt-uitleg">
        <h2 className="kt-uitleg-title">📺 Jouw kantineschermen</h2>
        <p className="kt-uitleg-lead">
          Iedereen die inlogt maakt hier zijn eigen kantinescherm — of meerdere, als je er meer dan
          één hangen hebt. Je kiest één keer wat elk scherm toont, zet de vaste link op de tv, en
          verder heb je er geen werk meer aan.
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
            <strong>Meerdere tv&apos;s?</strong> Maak een tweede scherm aan met een eigen naam en een
            eigen link — bijvoorbeeld één voor de kantine en één bij de jeugdterreinen.
          </li>
        </ol>
      </section>

      {/* ── Welk scherm ben je aan het instellen? ───────────────────────────────────────────── */}
      <section className="kt-blok kt-profielen">
        <h3 className="kt-blok-title">Welk scherm?</h3>
        <p className="kt-blok-sub">
          Elk scherm heeft een eigen naam en een eigen link. Handig als er meer dan één tv hangt.
        </p>
        <div className="kt-prof-rij">
          {profielen.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`kt-prof-tab ${p.id === actief.id ? 'on' : ''}`}
              onClick={() => {
                setActiefId(p.id)
                setHernoemt(false)
              }}
              aria-pressed={p.id === actief.id}
            >
              📺 {p.naam}
            </button>
          ))}
          {profielen.length < MAX_PROFIELEN && (
            <button type="button" className="kt-prof-tab nieuw" onClick={voegToe}>
              + Scherm erbij
            </button>
          )}
        </div>
        <div className="kt-prof-acties">
          {hernoemt ? (
            <input
              className="kt-prof-naam"
              autoFocus
              defaultValue={actief.naam}
              onBlur={(e) => {
                hernoem(e.currentTarget.value)
                setHernoemt(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setHernoemt(false)
              }}
              aria-label="Naam van dit scherm"
            />
          ) : (
            <button type="button" className="kt-prof-knop" onClick={() => setHernoemt(true)}>
              ✏️ Naam wijzigen
            </button>
          )}
          {profielen.length > 1 && (
            <button type="button" className="kt-prof-knop gevaar" onClick={verwijder}>
              🗑 Dit scherm verwijderen
            </button>
          )}
        </div>
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

      <details className="kt-blok kt-keuze-details">
        <summary className="kt-keuze-summary">
          <span>
            <strong>2 · Losse ploegen</strong>
            <small>Optioneel · kies één ploeg zonder de volledige club</small>
          </span>
          <span className="kt-keuze-aantal">
            {sel.teamIds.length ? `${sel.teamIds.length} gekozen` : 'Open selectie'}
            <span className="kt-keuze-pijl" aria-hidden>⌄</span>
          </span>
        </summary>
        <div className="kt-keuze-inhoud">
          <p className="kt-blok-sub">
            Eén ploeg volgen zonder heel de club? Zoek op ploeg of reeks. Gekozen ploegen staan
            automatisch bovenaan.
          </p>
          <label className="kt-keuze-zoek">
            <span aria-hidden>⌕</span>
            <input
              type="search"
              value={ploegZoek}
              onChange={(e) => setPloegZoek(e.currentTarget.value)}
              placeholder="Zoek ploeg of reeks…"
              aria-label="Zoek een losse ploeg"
            />
          </label>
          <div className="kt-keuze-scroll">
            <div className="kt-chips">
              {gefilterdePloegen.length === 0 ? (
                <p className="kt-empty">Geen ploegen gevonden.</p>
              ) : (
                gefilterdePloegen.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`kt-chip ${p.sub ? 'met-sub' : ''} ${sel.teamIds.includes(p.id) ? 'on' : ''}`}
                    onClick={() => wissel('teamIds', p.id)}
                    aria-pressed={sel.teamIds.includes(p.id)}
                  >
                    <span className="kt-chip-naam">{p.name}</span>
                    {p.sub && <span className="kt-chip-sub">{p.sub}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </details>

      <details className="kt-blok kt-keuze-details">
        <summary className="kt-keuze-summary">
          <span>
            <strong>3 · Losse wedstrijden</strong>
            <small>Optioneel · voeg één specifieke affiche toe</small>
          </span>
          <span className="kt-keuze-aantal">
            {sel.matchIds.length ? `${sel.matchIds.length} gekozen` : 'Open selectie'}
            <span className="kt-keuze-pijl" aria-hidden>⌄</span>
          </span>
        </summary>
        <div className="kt-keuze-inhoud">
          <p className="kt-blok-sub">
            Zoek op ploeg, reeks of uur. Gekozen wedstrijden staan bovenaan en blijven zichtbaar
            zolang ze bezig of gepland zijn.
          </p>
          <label className="kt-keuze-zoek">
            <span aria-hidden>⌕</span>
            <input
              type="search"
              value={wedstrijdZoek}
              onChange={(e) => setWedstrijdZoek(e.currentTarget.value)}
              placeholder="Zoek wedstrijd, reeks of uur…"
              aria-label="Zoek een losse wedstrijd"
            />
          </label>
          <div className="kt-keuze-scroll wedstrijden">
            {matches.length === 0 ? (
              <p className="kt-empty">Deze week staan er geen wedstrijden gepland.</p>
            ) : gefilterdeWedstrijden.length === 0 ? (
              <p className="kt-empty">Geen wedstrijden gevonden voor deze zoekopdracht.</p>
            ) : (
              <div className="kt-pick-list">
                {gefilterdeWedstrijden.map((m) => {
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
          </div>
        </div>
      </details>

      <section className="kt-blok kt-blok-link">
        <h3 className="kt-blok-title">4 · Zet &laquo;{actief.naam}&raquo; op de tv</h3>
        {leeg ? (
          <p className="kt-blok-sub">
            Kies eerst hierboven je club — daarna verschijnt hier de vaste link voor je kantine-tv.
          </p>
        ) : (
          <>
            <p className="kt-blok-sub">
              Deze link hoort bij dit scherm en verandert nooit. Open hem op de tv, of cast hem
              rechtstreeks.
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
              <CastKnop pad={pad} sleutel={`kantine-${userId}-${actief.id}`} label="📺 Cast naar tv" />
              <Link href={pad} className="kt-screen-btn">📺 Open dit scherm →</Link>
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
