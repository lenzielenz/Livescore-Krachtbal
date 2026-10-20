'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateTimeBE } from '@/lib/datetime'

export type OverzichtClub = {
  clubId: number
  clubNaam: string
  totaal: number
  ok: number
  wacht: number
  todo: number
  afgekeurd: number
  keuringVerloopt: number
  herinnering: { titel: string; tekst: string; regels: string[] } | null
  aan: { naam: string; rol: string }[]
  laatst: string | null
}

type Totaal = { totaal: number; ok: number; wacht: number; todo: number; afgekeurd: number; keuringVerloopt: number }

// Ledenoverzicht van de federatie: per club hoeveel leden, wie goedgekeurd is, wie wacht en wie de
// club nog in orde moet brengen. Per club zie je vooraf exact de herinnering en naar wie ze gaat.
export function LedenOverzicht({ clubs, totaal }: { clubs: OverzichtClub[]; totaal: Totaal }) {
  const router = useRouter()
  const [open, setOpen] = useState<number | null>(null)
  const [bezig, setBezig] = useState(false)
  const metPunten = clubs.filter((c) => c.herinnering && c.aan.length)
  const gekozen = clubs.find((c) => c.clubId === open) ?? null

  const stuur = async (clubIds: number[]) => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/herinnering', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clubIds }) })
      const j = (await res.json().catch(() => ({}))) as { verstuurd?: { club: string; aan: string[] }[]; zonder?: string[]; error?: string }
      if (!res.ok) {
        toast('error', j.error ?? 'Versturen mislukt.')
        return
      }
      const v = j.verstuurd ?? []
      toast(v.length ? 'success' : 'info', v.length ? `Herinnering verstuurd naar ${v.map((x) => `${x.club} (${x.aan.join(', ')})`).join('; ')}.` : `Niets verstuurd: ${(j.zonder ?? []).join('; ')}`)
      setOpen(null)
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="lo">
      <div className="lo-kop">
        <h2 className="lo-titel">Leden per club</h2>
        {metPunten.length > 0 && (
          <button
            type="button"
            className="cl-btn cl-btn-send"
            disabled={bezig}
            onClick={() => window.confirm(`Een herinnering sturen naar ${metPunten.length} ${metPunten.length === 1 ? 'club' : 'clubs'}?`) && stuur(metPunten.map((c) => c.clubId))}
          >
            🔔 Herinner alle {metPunten.length} {metPunten.length === 1 ? 'club' : 'clubs'}
          </button>
        )}
      </div>

      <div className="lo-cijfers">
        <div className="lo-cijfer"><strong>{totaal.totaal}</strong><span>spelers</span></div>
        <div className="lo-cijfer ok"><strong>{totaal.ok}</strong><span>goedgekeurd</span></div>
        <div className="lo-cijfer wacht"><strong>{totaal.wacht}</strong><span>wacht op de federatie</span></div>
        <div className="lo-cijfer actie"><strong>{totaal.todo + totaal.afgekeurd}</strong><span>niet in orde (club)</span></div>
        <div className="lo-cijfer wacht"><strong>{totaal.keuringVerloopt}</strong><span>keuring verloopt</span></div>
      </div>

      <div className="lo-tabel-wrap">
        <table className="lo-tabel">
          <thead>
            <tr>
              <th scope="col">Club</th>
              <th scope="col" className="getal">Spelers</th>
              <th scope="col" className="getal" title="Goedgekeurd, mag spelen">✅</th>
              <th scope="col" className="getal" title="Wacht op de federatie">⏳</th>
              <th scope="col" className="getal" title="Niet in orde: aan te vullen of afgekeurd">✎</th>
              <th scope="col" className="getal" title="Medische keuring verloopt binnen 30 dagen">⚠</th>
              <th scope="col"><span className="sr">Herinnering</span></th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <ClubRij key={c.clubId} c={c} open={open === c.clubId} onOpen={() => setOpen(open === c.clubId ? null : c.clubId)} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Het voorbeeld staat onder de tabel (niet erin): op een gsm schuift de tabel horizontaal. */}
      {gekozen?.herinnering && <Voorbeeld c={gekozen} bezig={bezig} onStuur={() => stuur([gekozen.clubId])} onSluit={() => setOpen(null)} />}
    </section>
  )
}

function ClubRij({ c, open, onOpen }: { c: OverzichtClub; open: boolean; onOpen: () => void }) {
  const niet = c.todo + c.afgekeurd
  return (
    <tr className={open ? 'lo-gekozen' : undefined}>
      <th scope="row">
        {c.clubNaam}
        {c.laatst && <span className="lo-sub">herinnerd {formatDateTimeBE(c.laatst)}</span>}
      </th>
      <td className="getal">{c.totaal}</td>
      <td className="getal">{c.ok}</td>
      <td className={`getal${c.wacht ? ' wacht' : ''}`}>{c.wacht || '–'}</td>
      <td className={`getal${niet ? ' actie' : ''}`}>{niet || '–'}</td>
      <td className={`getal${c.keuringVerloopt ? ' wacht' : ''}`}>{c.keuringVerloopt || '–'}</td>
      <td className="lo-actie">
        {c.herinnering ? (
          <button type="button" className="cl-btn lo-knop" aria-expanded={open} aria-label={`Herinnering voor ${c.clubNaam}`} onClick={onOpen}>
            🔔<span className="lo-knop-tekst"> Herinnering</span>
          </button>
        ) : (
          <span className="lo-in-orde" title="Alles in orde">✓</span>
        )}
      </td>
    </tr>
  )
}

function Voorbeeld({ c, bezig, onStuur, onSluit }: { c: OverzichtClub; bezig: boolean; onStuur: () => void; onSluit: () => void }) {
  if (!c.herinnering) return null
  return (
    <div className="lo-voorbeeld" ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>
      <div className="lo-voorbeeld-kop">
        <strong>Herinnering aan {c.clubNaam}</strong>
        <button type="button" className="cl-btn" onClick={onSluit}>Sluiten</button>
      </div>
      <div className="lo-aan">
        <strong>Gaat naar:</strong>{' '}
        {c.aan.length ? c.aan.map((o) => `${o.naam} (${o.rol})`).join(', ') : <em>niemand — deze club heeft geen clubbeheerder met een account</em>}
        <span className="lo-sub">In hun 🔔 meldingen op het platform, en als pushmelding op hun gsm als ze die aanzetten.</span>
      </div>
      <div className="lo-melding" aria-label="Voorbeeld van de herinnering">
        <span className="lo-melding-bron">🔔 Krachtbal Live · nu</span>
        <strong>{c.herinnering.titel}</strong>
        <span>{c.herinnering.tekst}</span>
        <ul>
          {c.herinnering.regels.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <span className="lo-melding-link">Tik om te openen → Leden &amp; registratie</span>
      </div>
      <button type="button" className="cl-btn cl-btn-primary" disabled={bezig || c.aan.length === 0} onClick={onStuur}>
        {bezig ? 'Bezig…' : 'Herinnering versturen'}
      </button>
    </div>
  )
}
