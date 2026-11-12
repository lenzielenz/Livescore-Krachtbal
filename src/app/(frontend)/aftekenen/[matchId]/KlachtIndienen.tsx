'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { formatDateTimeBE } from '@/lib/datetime'

export type KlachtInfo = {
  id: number
  club: string
  reden: string
  status: string
  beslissing: string | null
  op: string
  /** Een voorbehoud van op het blad (RCVK item 25), te bekrachtigen door de club van die ploeg. */
  voorbehoud?: boolean
  bekrachtigTegen?: string | null
  relaas?: string | null
  magBeantwoorden?: boolean
}

const STATUS: Record<string, string> = {
  open: '⏳ Bij de federatie',
  heropend: '↺ Blad heropend',
  afgewezen: '✗ Afgewezen',
  te_bekrachtigen: '✍️ Te bekrachtigen door de club',
  afgezien: '— Club zag af',
  vervallen: '⌛ Niet bekrachtigd, vervallen',
}

// Onder een ingediend blad: de klachten erover, en (voor de clubverantwoordelijken van beide ploegen)
// een klacht indienen. De federatie beslist op /beheer/klachten.
export function KlachtIndienen({ matchId, klachten, magIndienen, weigering }: { matchId: string; klachten: KlachtInfo[]; magIndienen: boolean; weigering: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reden, setReden] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const dienIn = async () => {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/klacht', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: Number(matchId), reden }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return setFout(j.error ?? 'Indienen mislukt.')
      setOpen(false)
      setReden('')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  if (!klachten.length && !magIndienen) return null
  return (
    <section className="aft-klacht">
      <h3>⚖️ Klacht over dit blad</h3>
      {klachten.map((k) => (
        <div key={k.id} className={`aft-klacht-item ${k.status}`}>
          <div className="aft-klacht-kop">
            <strong>{k.club}</strong>
            <span>{STATUS[k.status] ?? k.status}</span>
          </div>
          <p>{k.voorbehoud ? `Voorbehoud: ${k.reden}` : k.reden}</p>
          {k.relaas && <p className="aft-dim">Relaas van de club: {k.relaas}</p>}
          {k.voorbehoud && k.status === 'te_bekrachtigen' && <VoorbehoudAntwoord k={k} />}
          {k.beslissing && <p className="aft-klacht-beslissing">Federatie: {k.beslissing}</p>}
          <small>{formatDateTimeBE(k.op)}</small>
        </div>
      ))}
      {magIndienen &&
        (open ? (
          <div className="aft-klacht-form">
            <label>
              Wat klopt er niet op het blad?
              <textarea rows={4} value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Bv. speler 7 van de tegenpartij stond niet op de selectie, of de eindstand is 15–12 in plaats van 15–13." />
            </label>
            <p className="aft-dim">De federatie krijgt de klacht meteen, de andere club ook. Gaat de federatie akkoord, dan wordt het blad heropend en opnieuw ondertekend.</p>
            <div className="aft-knoppen">
              <button type="button" className="wb-btn" onClick={() => setOpen(false)} disabled={bezig}>Annuleren</button>
              <button type="button" className="wb-btn wb-btn-primary aft-teken" onClick={dienIn} disabled={bezig || reden.trim().length < 15}>
                {bezig ? 'Bezig…' : 'Klacht indienen bij de federatie'}
              </button>
            </div>
            {fout && <p className="wb-msg">{fout}</p>}
          </div>
        ) : (
          <button type="button" className="wb-btn" onClick={() => setOpen(true)}>Klacht indienen</button>
        ))}
      {!magIndienen && weigering && klachten.length > 0 && <p className="aft-dim">{weigering}</p>}
    </section>
  )
}

// Een voorbehoud bekrachtigen (binnen 5 werkdagen, met een uitgebreid relaas) of ervan afzien. Zonder
// antwoord vervalt het en volgen 75 euro administratieve kosten (RCVK item 25, lib/voorbehoud.ts).
function VoorbehoudAntwoord({ k }: { k: KlachtInfo }) {
  const router = useRouter()
  const [relaas, setRelaas] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const tegen = k.bekrachtigTegen ? formatDateTimeBE(k.bekrachtigTegen) : null
  if (!k.magBeantwoorden) return tegen ? <p className="aft-dim">De club bekrachtigt tegen {tegen}.</p> : null

  const stuur = async (actie: 'bekrachtigen' | 'afzien') => {
    if (actie === 'afzien' && !window.confirm('Afzien van dit voorbehoud? De federatie behandelt het dan niet, en er zijn geen kosten.')) return
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/klacht', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actie, id: k.id, relaas }) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return setFout(j.error ?? 'Bewaren mislukt.')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="aft-klacht-form">
      <label>
        Uitgebreid relaas van de feiten{tegen ? ` — tegen ${tegen}` : ''}
        <textarea rows={4} value={relaas} onChange={(e) => setRelaas(e.target.value)} placeholder="Wat gebeurde er precies, wanneer, en wat vraagt de club aan de federatie?" />
      </label>
      <p className="aft-dim">
        Bekrachtigen stuurt het voorbehoud naar de federatie. Afzien kost niets. Niets doen: na de termijn vervalt het en volgen 75 euro
        administratieve kosten.
      </p>
      <div className="aft-knoppen">
        <button type="button" className="wb-btn" onClick={() => void stuur('afzien')} disabled={bezig}>
          Afzien
        </button>
        <button type="button" className="wb-btn wb-btn-primary aft-teken" onClick={() => void stuur('bekrachtigen')} disabled={bezig || relaas.trim().length < 30}>
          {bezig ? 'Bezig…' : 'Bekrachtigen'}
        </button>
      </div>
      {fout && <p className="wb-msg">{fout}</p>}
    </div>
  )
}
