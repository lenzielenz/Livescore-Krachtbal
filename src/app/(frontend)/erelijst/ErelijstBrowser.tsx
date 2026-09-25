'use client'

import { useMemo, useState } from 'react'

import { zoekErelijst } from '@/lib/erelijst'
import type { KampioenenSeizoenInput, BekerwinnaarsSeizoenInput, ReferendumPrijsInput, ClubTrofee, Laureaat } from '@/lib/erelijst'
import type { ClubLogoMeta } from '@/lib/club-logo-lookup'
import { ClubNaam, SpelerNaam } from './EntityLinks'
import './erelijst.css'

type Tab = 'kampioenen' | 'bekerwinnaars' | 'referendum'

const TABS: { key: Tab; label: string }[] = [
  { key: 'kampioenen', label: '🥇 Kampioenen' },
  { key: 'bekerwinnaars', label: '🏆 Bekerwinnaars' },
  { key: 'referendum', label: '⭐ Referendum' },
]

// Aantal seizoenen dat standaard zichtbaar is per tab, vóór "toon alles" — houdt de pagina licht
// bij het laden ondanks 60+ seizoenen per archief.
const TOON_AANTAL = 8

export function ErelijstBrowser({
  kampioenenSeizoenen,
  bekerwinnaarsSeizoenen,
  referendumPrijzen,
  clubTrofeeen,
  laureaten,
  clubLogos,
}: {
  kampioenenSeizoenen: KampioenenSeizoenInput[]
  bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[]
  referendumPrijzen: ReferendumPrijsInput[]
  clubTrofeeen: ClubTrofee[]
  laureaten: Laureaat[]
  clubLogos: Record<string, ClubLogoMeta>
}) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('kampioenen')
  const [toonAlles, setToonAlles] = useState<Record<Tab, boolean>>({ kampioenen: false, bekerwinnaars: false, referendum: false })

  const zoekresultaten = useMemo(
    () => (query.trim() ? zoekErelijst(query, kampioenenSeizoenen, bekerwinnaarsSeizoenen, referendumPrijzen) : []),
    [query, kampioenenSeizoenen, bekerwinnaarsSeizoenen, referendumPrijzen],
  )

  const topClubs = clubTrofeeen.slice(0, 10)
  const topLaureaten = laureaten.slice(0, 10)
  const zoekt = query.trim().length > 0

  return (
    <>
      <div className="erl-zoek">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek een club of speler… (bv. “KBC Male” of “Jason De Vooght”)"
          className="erl-zoek-input"
          aria-label="Zoek in de erelijst"
        />
      </div>

      {zoekt ? (
        <section className="erl-zoekresultaten">
          <h2 className="erl-section-title">Zoekresultaten voor &ldquo;{query.trim()}&rdquo;</h2>
          {zoekresultaten.length === 0 ? (
            <p className="erl-leeg">Niets gevonden. Controleer de schrijfwijze of probeer een deel van de naam.</p>
          ) : (
            <ul className="erl-zoek-lijst">
              {zoekresultaten.map((r, i) => (
                <li key={i} className="erl-zoek-item">
                  {r.type === 'kampioen' && (
                    <>
                      <span className="erl-zoek-icon" aria-hidden>🥇</span>
                      <div className="erl-zoek-info">
                        <span className="erl-zoek-naam"><ClubNaam naam={r.naam} logos={clubLogos} /></span>
                        <span className="erl-zoek-detail">kampioen {r.reeksNaam} · {r.seizoen}</span>
                      </div>
                    </>
                  )}
                  {r.type === 'beker' && (
                    <>
                      <span className="erl-zoek-icon" aria-hidden>🏆</span>
                      <div className="erl-zoek-info">
                        <span className="erl-zoek-naam"><ClubNaam naam={r.naam} logos={clubLogos} /></span>
                        <span className="erl-zoek-detail">bekerwinnaar {r.categorie} · {r.seizoen}</span>
                      </div>
                    </>
                  )}
                  {r.type === 'referendum' && (
                    <>
                      <span className="erl-zoek-icon" aria-hidden>⭐</span>
                      <div className="erl-zoek-info">
                        <span className="erl-zoek-naam"><SpelerNaam naam={r.naam} /></span>
                        <span className="erl-zoek-detail">
                          {r.prijs} · {r.jaar} · <ClubNaam naam={r.club} logos={clubLogos} />
                        </span>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <section className="erl-boards">
            <div className="erl-board">
              <h2 className="erl-section-title">🏛️ Clubs met de meeste prijzen</h2>
              <p className="erl-board-sub">Kampioenschappen + bekers + referendumprijzen van haar spelers samengeteld, per club zoals genoteerd in het archief.</p>
              <ol className="erl-board-lijst">
                {topClubs.map((c, i) => (
                  <li key={c.naam} className={`erl-board-item erl-rank-${i < 3 ? i + 1 : 'x'}`}>
                    <span className="erl-rank">{i + 1}</span>
                    <div className="erl-board-info">
                      <div className="erl-board-main">
                        <span className="erl-board-naam"><ClubNaam naam={c.naam} /></span>
                        <span className="erl-board-totaal">{c.totaal}</span>
                      </div>
                      <span className="erl-board-detail">
                        {c.titels}× 🥇 kampioen · {c.bekers}× 🏆 beker · {c.referendumprijzen}× ⭐ referendumprijs
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="erl-board">
              <h2 className="erl-section-title">⭐ Meest bekroonde spelers</h2>
              <p className="erl-board-sub">Referendumprijzen (speler/speelster/belofte van het jaar) door de jaren heen.</p>
              <ol className="erl-board-lijst">
                {topLaureaten.map((l, i) => (
                  <li key={l.naam} className={`erl-board-item erl-rank-${i < 3 ? i + 1 : 'x'}`}>
                    <span className="erl-rank">{i + 1}</span>
                    <div className="erl-board-info">
                      <div className="erl-board-main">
                        <span className="erl-board-naam"><SpelerNaam naam={l.naam} /></span>
                        <span className="erl-board-totaal">{l.aantal}</span>
                      </div>
                      <span className="erl-board-detail">{l.prijzen.join(', ')}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <div className="erl-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`erl-tab${tab === t.key ? ' erl-tab-actief' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'kampioenen' && (
            <div className="erl-seizoenen">
              {(toonAlles.kampioenen ? kampioenenSeizoenen : kampioenenSeizoenen.slice(0, TOON_AANTAL)).map((s) => (
                <div key={s.seizoen} className="erl-kaart">
                  <h3 className="erl-kaart-titel">{s.seizoen}</h3>
                  <ul className="erl-kaart-rijen">
                    {s.reeksen.map((r, i) => (
                      <li key={i} className="erl-kaart-rij">
                        <span className="erl-kaart-label">{r.reeksNaam}</span>
                        <span className="erl-kaart-waarde"><ClubNaam naam={r.kampioen} logos={clubLogos} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!toonAlles.kampioenen && kampioenenSeizoenen.length > TOON_AANTAL && (
                <button type="button" className="erl-meer" onClick={() => setToonAlles((s) => ({ ...s, kampioenen: true }))}>
                  Toon alle {kampioenenSeizoenen.length} seizoenen ↓
                </button>
              )}
            </div>
          )}

          {tab === 'bekerwinnaars' && (
            <div className="erl-seizoenen">
              {(toonAlles.bekerwinnaars ? bekerwinnaarsSeizoenen : bekerwinnaarsSeizoenen.slice(0, TOON_AANTAL)).map((s) => (
                <div key={s.seizoen} className="erl-kaart">
                  <h3 className="erl-kaart-titel">{s.seizoen}</h3>
                  <ul className="erl-kaart-rijen">
                    {s.winnaars.map((w, i) => (
                      <li key={i} className="erl-kaart-rij">
                        <span className="erl-kaart-label">{w.categorie}</span>
                        <span className="erl-kaart-waarde"><ClubNaam naam={w.ploeg} logos={clubLogos} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!toonAlles.bekerwinnaars && bekerwinnaarsSeizoenen.length > TOON_AANTAL && (
                <button type="button" className="erl-meer" onClick={() => setToonAlles((s) => ({ ...s, bekerwinnaars: true }))}>
                  Toon alle {bekerwinnaarsSeizoenen.length} seizoenen ↓
                </button>
              )}
            </div>
          )}

          {tab === 'referendum' && (
            <div className="erl-seizoenen">
              {referendumPrijzen.map((p) => (
                <div key={p.prijs} className="erl-kaart erl-kaart-breed">
                  <h3 className="erl-kaart-titel">{p.prijs}</h3>
                  <ul className="erl-kaart-rijen erl-kaart-rijen-grid">
                    {(toonAlles.referendum ? p.winnaars : p.winnaars.slice(0, TOON_AANTAL)).map((w, i) => (
                      <li key={i} className="erl-kaart-rij">
                        <span className="erl-kaart-label">{w.jaar}</span>
                        <span className="erl-kaart-waarde">
                          <SpelerNaam naam={w.naam} /> <span className="erl-kaart-club">(<ClubNaam naam={w.club} logos={clubLogos} />)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!toonAlles.referendum && referendumPrijzen.some((p) => p.winnaars.length > TOON_AANTAL) && (
                <button type="button" className="erl-meer" onClick={() => setToonAlles((s) => ({ ...s, referendum: true }))}>
                  Toon de volledige geschiedenis ↓
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
