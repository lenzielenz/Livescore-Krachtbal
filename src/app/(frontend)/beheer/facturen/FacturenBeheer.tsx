'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'
import { BETAALSTAND_LABEL, type Betaalstand, factuurTotaal, type Lijn, lijnBedrag } from '@/lib/facturatie'
import type { BankVoorstel, FactuurRij } from '@/lib/facturatie-server'

const eur = (n: number) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n)

async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const res = await fetch('/api/federatie/facturen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    toast('error', String(j.error ?? 'Er liep iets mis.'))
    return null
  }
  return j
}

export function FacturenBeheer({ rijen, vandaag }: { rijen: FactuurRij[]; vandaag: string }) {
  const router = useRouter()
  const concepten = rijen.filter((r) => r.status === 'concept')
  const verstuurd = rijen.filter((r) => r.status !== 'concept')
  const open = verstuurd.filter((r) => ['open', 'deels', 'vervallen'].includes(r.beeld.stand))
  const vervallen = verstuurd.filter((r) => r.beeld.stand === 'vervallen')

  return (
    <div className="fa">
      <div className="fa-tegels">
        <div className="fa-tegel">
          <span>Openstaand</span>
          <strong>{eur(open.reduce((t, r) => t + r.beeld.open, 0))}</strong>
          <small>{open.length} facturen</small>
        </div>
        <div className={`fa-tegel${vervallen.length ? ' fa-tegel-rood' : ''}`}>
          <span>Vervallen</span>
          <strong>{eur(vervallen.reduce((t, r) => t + r.beeld.open, 0))}</strong>
          <small>{vervallen.length} facturen</small>
        </div>
        <div className="fa-tegel">
          <span>Ontvangen</span>
          <strong>{eur(verstuurd.reduce((t, r) => t + r.beeld.betaald, 0))}</strong>
          <small>op {verstuurd.length} facturen</small>
        </div>
        <div className="fa-tegel">
          <span>Concepten</span>
          <strong>{concepten.length}</strong>
          <small>nog te versturen</small>
        </div>
      </div>

      <Opmaken onKlaar={() => router.refresh()} />
      {concepten.length > 0 && <Concepten rijen={concepten} onKlaar={() => router.refresh()} />}
      <Bankafschrift onKlaar={() => router.refresh()} />
      <Verstuurd rijen={verstuurd} vandaag={vandaag} onKlaar={() => router.refresh()} />
    </div>
  )
}

function Opmaken({ onKlaar }: { onKlaar: () => void }) {
  const [keuze, setKeuze] = useState({ aansluitingen: true, boetes: true, scheidsrechters: false })
  const [bezig, setBezig] = useState(false)
  return (
    <section className="wb-card fa-blok">
      <h2>Nieuwe facturen opmaken</h2>
      <p className="wb-sub">Per club een concept met wat ze verschuldigd is en nog niet gefactureerd werd. Niets wordt dubbel gefactureerd; je kijkt alles na vóór het versturen.</p>
      <div className="fa-vinken">
        {(
          [
            ['aansluitingen', 'Aansluitingen (lidgeld per speler en lid)'],
            ['boetes', 'Opgelegde boetes'],
            ['scheidsrechters', 'Scheidsrechterskosten (volgens de instelling wie betaalt)'],
          ] as const
        ).map(([k, label]) => (
          <label key={k}>
            <input type="checkbox" checked={keuze[k]} onChange={(e) => setKeuze({ ...keuze, [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="wb-btn wb-btn-primary"
        disabled={bezig || (!keuze.aansluitingen && !keuze.boetes && !keuze.scheidsrechters)}
        onClick={async () => {
          setBezig(true)
          const j = await post({ actie: 'opmaken', ...keuze })
          setBezig(false)
          if (!j) return
          const n = (j.gemaakt as number[]).length
          toast('success', n ? `${n} concept${n === 1 ? '' : 'en'} gemaakt. Kijk ze na en verstuur.` : 'Er is niets nieuws te factureren.')
          onKlaar()
        }}
      >
        {bezig ? 'Bezig…' : 'Concepten maken voor alle clubs'}
      </button>
    </section>
  )
}

function Concepten({ rijen, onKlaar }: { rijen: FactuurRij[]; onKlaar: () => void }) {
  const [bezig, setBezig] = useState(false)
  return (
    <section className="wb-card fa-blok">
      <div className="fa-kop">
        <h2>Concepten ({rijen.length})</h2>
        <button
          type="button"
          className="wb-btn wb-btn-primary"
          disabled={bezig}
          onClick={async () => {
            if (!confirm(`${rijen.length} facturen versturen? Ze krijgen een nummer en de clubs krijgen een melding. Daarna veranderen ze niet meer.`)) return
            setBezig(true)
            const j = await post({ actie: 'versturen', ids: rijen.map((r) => r.id) })
            setBezig(false)
            if (j) toast('success', `${(j.verstuurd as string[]).length} facturen verstuurd.`)
            onKlaar()
          }}
        >
          Alle concepten versturen
        </button>
      </div>
      <ul className="fa-lijst">
        {rijen.map((r) => (
          <Concept key={r.id} r={r} onKlaar={onKlaar} />
        ))}
      </ul>
    </section>
  )
}

function Concept({ r, onKlaar }: { r: FactuurRij; onKlaar: () => void }) {
  const [lijnen, setLijnen] = useState<Lijn[]>(r.lijnen)
  const [opmerking, setOpmerking] = useState(r.opmerking ?? '')
  const [nieuw, setNieuw] = useState({ omschrijving: '', aantal: '1', eenheidsprijs: '' })
  const [bezig, setBezig] = useState(false)
  const gewijzigd = JSON.stringify(lijnen) !== JSON.stringify(r.lijnen) || opmerking !== (r.opmerking ?? '')
  const bewaar = async () => {
    setBezig(true)
    const j = await post({ actie: 'bewerken', id: r.id, lijnen, opmerking })
    setBezig(false)
    if (j) {
      toast('success', 'Concept bewaard.')
      onKlaar()
    }
  }
  return (
    <li className="fa-concept">
      <div className="fa-kop">
        <strong>{r.club.naam}</strong>
        <span className="fa-totaal">{eur(factuurTotaal(lijnen))}</span>
      </div>
      <table className="fa-tabel">
        <tbody>
          {lijnen.map((l, i) => (
            <tr key={i}>
              <td>{l.omschrijving}</td>
              <td className="fa-r">{l.aantal} × {eur(l.eenheidsprijs)}</td>
              <td className="fa-r">{eur(lijnBedrag(l))}</td>
              <td>
                <button type="button" className="fa-x" aria-label="Lijn weghalen" onClick={() => setLijnen(lijnen.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fa-rij">
        <input placeholder="Extra lijn (bv. administratiekost, creditnota met negatief bedrag)" value={nieuw.omschrijving} onChange={(e) => setNieuw({ ...nieuw, omschrijving: e.target.value })} />
        <input className="fa-klein" inputMode="decimal" placeholder="Aantal" value={nieuw.aantal} onChange={(e) => setNieuw({ ...nieuw, aantal: e.target.value })} />
        <input className="fa-klein" inputMode="decimal" placeholder="Prijs €" value={nieuw.eenheidsprijs} onChange={(e) => setNieuw({ ...nieuw, eenheidsprijs: e.target.value })} />
        <button
          type="button"
          className="wb-btn"
          disabled={!nieuw.omschrijving.trim() || !nieuw.eenheidsprijs}
          onClick={() => {
            setLijnen([...lijnen, { soort: 'ander', omschrijving: nieuw.omschrijving.trim(), aantal: Number(nieuw.aantal.replace(',', '.')) || 1, eenheidsprijs: Number(nieuw.eenheidsprijs.replace(',', '.')) || 0, sleutels: [] }])
            setNieuw({ omschrijving: '', aantal: '1', eenheidsprijs: '' })
          }}
        >
          + Lijn
        </button>
      </div>
      <textarea className="fa-opm" placeholder="Opmerking op de factuur (optioneel)" value={opmerking} onChange={(e) => setOpmerking(e.target.value)} rows={2} />
      <div className="fa-knoppen">
        {gewijzigd && (
          <button type="button" className="wb-btn wb-btn-primary" disabled={bezig} onClick={bewaar}>
            Bewaren
          </button>
        )}
        <a className="wb-btn" href={`/api/facturen/${r.id}/pdf`} target="_blank" rel="noopener">
          Voorbeeld (PDF)
        </a>
        <button
          type="button"
          className="wb-btn"
          disabled={bezig || gewijzigd}
          title={gewijzigd ? 'Bewaar eerst je wijzigingen' : undefined}
          onClick={async () => {
            setBezig(true)
            const j = await post({ actie: 'versturen', id: r.id })
            setBezig(false)
            if (j) toast('success', `Verstuurd als ${(j.verstuurd as string[])[0]}.`)
            onKlaar()
          }}
        >
          Versturen
        </button>
        <button
          type="button"
          className="wb-btn fa-rood"
          disabled={bezig}
          onClick={async () => {
            if (!confirm('Dit concept verwijderen? De lijnen kunnen later opnieuw gefactureerd worden.')) return
            if (await post({ actie: 'verwijderen', id: r.id })) onKlaar()
          }}
        >
          Verwijderen
        </button>
      </div>
    </li>
  )
}

function Bankafschrift({ onKlaar }: { onKlaar: () => void }) {
  const [csv, setCsv] = useState<string | null>(null)
  const [regels, setRegels] = useState<BankVoorstel[] | null>(null)
  const [bezig, setBezig] = useState(false)
  const teBoeken = regels?.filter((r) => r.status === 'koppelen') ?? []
  return (
    <section className="wb-card fa-blok">
      <h2>Bankafschrift inlezen</h2>
      <p className="wb-sub">
        Exporteer de verrichtingen van de rekening als CSV (KBC, BNP Paribas Fortis, Belfius, ING…). Elke betaling met de gestructureerde mededeling van
        een factuur wordt eraan gekoppeld. Je ziet eerst wat er gebeurt; niets wordt twee keer geboekt.
      </p>
      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          // Banken exporteren vaak in Windows-1252; probeer eerst UTF-8.
          const buf = await f.arrayBuffer()
          let tekst = new TextDecoder('utf-8').decode(buf)
          if (tekst.includes('�')) tekst = new TextDecoder('windows-1252').decode(buf)
          setCsv(tekst)
          setBezig(true)
          const j = await post({ actie: 'bank-voorbeeld', csv: tekst })
          setBezig(false)
          setRegels(j ? (j.regels as BankVoorstel[]) : null)
        }}
      />
      {bezig && <p className="wb-sub">Bezig met lezen…</p>}
      {regels && (
        <>
          <p className="wb-sub">
            {regels.length} binnenkomende betalingen · <strong>{teBoeken.length} te koppelen</strong> · {regels.filter((r) => r.status === 'al-geboekt').length} al geboekt ·{' '}
            {regels.filter((r) => r.status === 'geen-factuur').length} zonder factuur
          </p>
          <table className="fa-tabel fa-bank">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Van</th>
                <th>Mededeling</th>
                <th className="fa-r">Bedrag</th>
                <th>Factuur</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.sleutel} className={`fa-bank-${r.status}`}>
                  <td>{formatDateBE(r.datum)}</td>
                  <td>{r.tegenpartij}</td>
                  <td className="fa-dim">{r.mededeling}</td>
                  <td className="fa-r">{eur(r.bedrag)}</td>
                  <td>
                    {r.factuur ? `${r.factuur.nummer} · ${r.factuur.club}` : '—'}
                    {r.status === 'al-geboekt' ? ' (al geboekt)' : ''}
                    {r.factuur && r.status === 'koppelen' && r.bedrag !== r.factuur.open ? <span className="fa-let-klein"> · open was {eur(r.factuur.open)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            disabled={bezig || !teBoeken.length || !csv}
            onClick={async () => {
              setBezig(true)
              const j = await post({ actie: 'bank-importeren', csv })
              setBezig(false)
              if (j) {
                toast('success', `${j.geboekt} betalingen geboekt.`)
                setRegels(null)
                setCsv(null)
                onKlaar()
              }
            }}
          >
            {teBoeken.length} betalingen boeken
          </button>
        </>
      )}
    </section>
  )
}

const FILTERS: { k: 'alle' | Betaalstand; label: string }[] = [
  { k: 'alle', label: 'Alle' },
  { k: 'open', label: 'Open' },
  { k: 'deels', label: 'Deels' },
  { k: 'vervallen', label: 'Vervallen' },
  { k: 'betaald', label: 'Betaald' },
  { k: 'geannuleerd', label: 'Geannuleerd' },
]

function Verstuurd({ rijen, vandaag, onKlaar }: { rijen: FactuurRij[]; vandaag: string; onKlaar: () => void }) {
  const [filter, setFilter] = useState<'alle' | Betaalstand>('alle')
  const [zoek, setZoek] = useState('')
  const zicht = useMemo(
    () => rijen.filter((r) => (filter === 'alle' || r.beeld.stand === filter) && (!zoek.trim() || `${r.club.naam} ${r.nummer}`.toLowerCase().includes(zoek.trim().toLowerCase()))),
    [rijen, filter, zoek],
  )
  return (
    <section className="wb-card fa-blok">
      <div className="fa-kop">
        <h2>Verstuurde facturen</h2>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- een CSV-download van een API-route, geen pagina */}
        <a className="wb-btn" href="/api/federatie/facturen?formaat=csv">
          ⬇ Export voor de boekhouding (CSV)
        </a>
      </div>
      <div className="fa-filters">
        {FILTERS.map((f) => (
          <button key={f.k} type="button" aria-pressed={filter === f.k} onClick={() => setFilter(f.k)}>
            {f.label} ({f.k === 'alle' ? rijen.length : rijen.filter((r) => r.beeld.stand === f.k).length})
          </button>
        ))}
        <input placeholder="Zoek club of nummer" value={zoek} onChange={(e) => setZoek(e.target.value)} />
      </div>
      {zicht.length === 0 ? (
        <p className="empty">Geen facturen.</p>
      ) : (
        <ul className="fa-lijst">
          {zicht.map((r) => (
            <Factuur key={r.id} r={r} vandaag={vandaag} onKlaar={onKlaar} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Factuur({ r, vandaag, onKlaar }: { r: FactuurRij; vandaag: string; onKlaar: () => void }) {
  const [open, setOpen] = useState(false)
  const [bet, setBet] = useState({ bedrag: String(r.beeld.open || ''), datum: vandaag, opmerking: '' })
  const [bezig, setBezig] = useState(false)
  return (
    <li className="fa-factuur">
      <button type="button" className="fa-regel" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="fa-nr">{r.nummer}</span>
        <span className="fa-club">{r.club.naam}</span>
        <span className="fa-dim">{r.datum ? formatDateBE(r.datum) : ''}</span>
        <span className="fa-r">{eur(r.totaal)}</span>
        <span className={`fa-stand fa-stand-${r.beeld.stand}`}>{BETAALSTAND_LABEL[r.beeld.stand]}</span>
      </button>
      {open && (
        <div className="fa-detail">
          <p className="fa-dim">
            Mededeling {r.ogm} · te betalen vóór {r.vervaldatum ? formatDateBE(r.vervaldatum) : '—'} · betaald {eur(r.beeld.betaald)} · open {eur(r.beeld.open)}
            {r.annuleerReden ? ` · geannuleerd: ${r.annuleerReden}` : ''}
          </p>
          {r.betalingen.length > 0 && (
            <ul className="fa-betalingen">
              {r.betalingen.map((b) => (
                <li key={b.id}>
                  {formatDateBE(b.datum)} · {eur(b.bedrag)} · {b.bron === 'bank' ? 'bankafschrift' : b.bron === 'online' ? 'online' : 'manueel'}
                  {b.tegenpartij ? ` · ${b.tegenpartij}` : ''}
                  <button
                    type="button"
                    className="fa-x"
                    aria-label="Betaling schrappen"
                    onClick={async () => {
                      if (!confirm('Deze betaling schrappen? De factuur staat dan weer open voor dat bedrag.')) return
                      if (await post({ actie: 'betaling-schrappen', betalingId: b.id })) onKlaar()
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="fa-knoppen">
            <a className="wb-btn" href={`/api/facturen/${r.id}/pdf`} target="_blank" rel="noopener">
              PDF
            </a>
            {r.status === 'verstuurd' && (
              <a className="wb-btn" href={`/api/facturen/${r.id}/ubl`} title="UBL 2.1 volgens Peppol BIS Billing 3.0">
                e-factuur (Peppol)
              </a>
            )}
          </div>
          {r.status === 'verstuurd' && r.beeld.open > 0 && (
            <div className="fa-rij">
              <input className="fa-klein" inputMode="decimal" value={bet.bedrag} onChange={(e) => setBet({ ...bet, bedrag: e.target.value })} aria-label="Bedrag" />
              <input type="date" value={bet.datum} max={vandaag} onChange={(e) => setBet({ ...bet, datum: e.target.value })} aria-label="Datum" />
              <input placeholder="Opmerking (bv. cash, bank)" value={bet.opmerking} onChange={(e) => setBet({ ...bet, opmerking: e.target.value })} />
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                disabled={bezig}
                onClick={async () => {
                  setBezig(true)
                  const j = await post({ actie: 'betaling', id: r.id, ...bet })
                  setBezig(false)
                  if (j) {
                    toast('success', 'Betaling geboekt.')
                    onKlaar()
                  }
                }}
              >
                Betaling boeken
              </button>
            </div>
          )}
          {r.status === 'verstuurd' && r.beeld.betaald === 0 && (
            <button
              type="button"
              className="wb-btn fa-rood"
              onClick={async () => {
                const reden = prompt('Waarom annuleer je deze factuur? (De club krijgt een melding; het nummer blijft bestaan.)')
                if (reden && (await post({ actie: 'annuleren', id: r.id, reden }))) onKlaar()
              }}
            >
              Annuleren…
            </button>
          )}
        </div>
      )}
    </li>
  )
}
