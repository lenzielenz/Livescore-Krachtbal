'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { AantekenaarRol } from '@/lib/aantekenaars'

export interface Regel {
  matchId: number
  tornooiId: number | null
  tornooi: string
  label: string
  home: string | null
  away: string | null
  status: string
  hoofd: { naam: string; rol: AantekenaarRol; acties: number } | null
  medewerkers: string[]
  afsluiter: string | null
  laatste: number
}

export interface PersoonTotaal {
  id: number
  naam: string
  rol: AantekenaarRol
  wedstrijden: number
  afgesloten: number
  acties: number
}

const datum = (ms: number) =>
  ms > 0
    ? new Date(ms).toLocaleString('nl-BE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Brussels',
      })
    : '—'

const STATUS: Record<string, string> = { pending: 'te spelen', live: 'bezig', finished: 'afgelopen' }

/**
 * Twee blikken op hetzelfde spoor: per persoon (wie doet er veel) en per wedstrijd (wie tekende
 * díé ene aan). Bij een betwiste uitslag begint de federatie bij de tweede lijst; bij een vraag
 * over de werklast op een tornooidag bij de eerste.
 *
 * Zoeken filtert beide lijsten tegelijk — je typt een naam of een ploeg en ziet meteen allebei.
 */
export function AantekenaarsOverzicht({
  regels,
  personen,
  afgekapt,
  max,
}: {
  regels: Regel[]
  personen: PersoonTotaal[]
  afgekapt: boolean
  max: number
}) {
  const [zoek, setZoek] = useState('')
  const term = zoek.trim().toLowerCase()

  const gefilterd = useMemo(() => {
    if (!term) return regels
    return regels.filter((r) =>
      [r.tornooi, r.label, r.home ?? '', r.away ?? '', r.hoofd?.naam ?? '', r.afsluiter ?? '', ...r.medewerkers]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [regels, term])

  const gefilterdePersonen = useMemo(
    () => (term ? personen.filter((p) => p.naam.toLowerCase().includes(term)) : personen),
    [personen, term],
  )

  if (regels.length === 0) {
    return (
      <p className="empty">
        Nog geen enkele tornooiwedstrijd met een aantekenspoor. Zodra iemand een wedstrijd aantekent,
        verschijnt ze hier.
      </p>
    )
  }

  return (
    <div className="ant-wrap">
      <input
        type="search"
        className="ant-zoek"
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
        placeholder="Zoek op naam, ploeg of tornooi…"
        aria-label="Zoeken"
      />

      <section className="ant-sec">
        <h2 className="ant-titel">Per persoon</h2>
        <div className="ant-personen">
          {gefilterdePersonen.map((p) => (
            <div key={p.id} className="ant-persoon">
              <span className="ant-naam">{p.naam}</span>
              <span className={`ant-rol ${p.rol}`}>{p.rol === 'supporter' ? 'supporter' : 'organisatie'}</span>
              <span className="ant-tel">
                {p.wedstrijden} {p.wedstrijden === 1 ? 'wedstrijd' : 'wedstrijden'}
                {p.afgesloten > 0 && <> · {p.afgesloten}× afgesloten</>}
              </span>
            </div>
          ))}
          {gefilterdePersonen.length === 0 && <p className="ant-leeg">Geen naam die daarop lijkt.</p>}
        </div>
      </section>

      <section className="ant-sec">
        <h2 className="ant-titel">Per wedstrijd</h2>
        <div className="ant-tabel-wrap">
          <table className="ant-tabel">
            <thead>
              <tr>
                <th className="l">Wedstrijd</th>
                <th className="l">Aangetekend door</th>
                <th className="l">Afgesloten door</th>
                <th>Status</th>
                <th>Laatste actie</th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map((r) => (
                <tr key={r.matchId}>
                  <td className="l">
                    <span className="ant-tornooi">{r.tornooi}</span>
                    <span className="ant-affiche">
                      {r.tornooiId ? (
                        <Link href={`/tornooi/${r.tornooiId}`}>
                          {r.home && r.away ? `${r.home} – ${r.away}` : r.label}
                        </Link>
                      ) : r.home && r.away ? (
                        `${r.home} – ${r.away}`
                      ) : (
                        r.label
                      )}
                    </span>
                  </td>
                  <td className="l">
                    {r.hoofd ? (
                      <>
                        <span className="ant-naam">{r.hoofd.naam}</span>
                        {r.hoofd.rol === 'supporter' && <span className="ant-rol supporter">supporter</span>}
                        {r.medewerkers.length > 0 && (
                          <span className="ant-mede" title={r.medewerkers.join(', ')}>
                            +{r.medewerkers.length}
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="l">{r.afsluiter ?? '—'}</td>
                  <td>
                    <span className={`ant-status ${r.status}`}>{STATUS[r.status] ?? r.status}</span>
                  </td>
                  <td className="ant-datum">{datum(r.laatste)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {gefilterd.length === 0 && <p className="ant-leeg">Geen wedstrijd die daarop past.</p>}
        {/* Zwijgend afkappen zou het overzicht laten liegen: het lijkt dan volledig terwijl het dat niet is. */}
        {afgekapt && (
          <p className="ant-hint">
            Enkel de {max} laatst gewijzigde wedstrijden staan hier. Zoek op een tornooinaam om
            oudere terug te vinden.
          </p>
        )}
      </section>
    </div>
  )
}
