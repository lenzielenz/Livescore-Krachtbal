'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { brusselsParts, brusselsWallUtc, formatTimeBE } from '@/lib/datetime'

import './aftrap-verschuiven.css'

// De aftrap verschuiven op de wedstrijddag (lib/aftrap.ts). Zo weinig tikken als kan: reden →
// +15/+30/… → verschuiven. Iedereen (clubs, scheidsrechter, spelers op de selectie) wordt verwittigd.

const REDENEN = [
  { v: 'file', l: '🚗 File / onderweg' },
  { v: 'ziekte', l: '🤒 Ziekte' },
  { v: 'uitloop', l: '⏳ Vorige wedstrijd loopt uit' },
  { v: 'vervroegen', l: '⏩ Wedstrijd ervoor valt weg' },
  { v: 'terrein', l: '🧰 Terrein / materiaal' },
  { v: 'scheidsrechter', l: '🧑‍⚖️ Scheidsrechter later' },
  { v: 'ander', l: '✏️ Andere reden' },
] as const

export type AftrapGeschiedenisRij = { id: number; van: string; naar: string; redenTekst: string; toelichting: string | null; door: string; meegeschoven: boolean }

export function AftrapVerschuiven({
  matchId,
  aftrap,
  volgende,
  magMeeschuiven,
  geschiedenis,
}: {
  matchId: number
  aftrap: string
  volgende: { id: number; titel: string; aftrap: string }[]
  magMeeschuiven: boolean
  geschiedenis: AftrapGeschiedenisRij[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reden, setReden] = useState<string | null>(null)
  const [deltaMin, setDeltaMin] = useState(0)
  const [toelichting, setToelichting] = useState('')
  const [meeschuiven, setMeeschuiven] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const basis = new Date(aftrap)
  const nieuw = new Date(basis.getTime() + deltaMin * 60_000)
  const vroeger = reden === 'vervroegen'
  const stappen = vroeger ? [-60, -45, -30, -15] : [15, 30, 45, 60]

  const zetUur = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return
    const p = brusselsParts(basis)
    const d = brusselsWallUtc(p.year, p.month, p.day, h, m)
    setDeltaMin(Math.round((d.getTime() - basis.getTime()) / 60_000))
  }
  const uurVan = (d: Date) => {
    const p = brusselsParts(d)
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }

  const verstuur = async () => {
    if (!reden || deltaMin === 0) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/match/${matchId}/aftrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nieuw: nieuw.toISOString(), reden, toelichting, volgendeOok: magMeeschuiven && meeschuiven && volgende.length > 0 }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; verschoven?: unknown[] }
      if (!res.ok) throw new Error(j.error ?? 'Verschuiven lukte niet.')
      const n = j.verschoven?.length ?? 1
      setMsg({ ok: true, t: `Verschoven${n > 1 ? ` (${n} wedstrijden)` : ''} — iedereen is verwittigd.` })
      setOpen(false)
      setReden(null)
      setDeltaMin(0)
      setToelichting('')
      router.refresh()
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : 'Geen verbinding — probeer opnieuw.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="av" aria-label="Aftrap verschuiven">
      <div className="av-kop">
        <div>
          <h2 className="av-h">⏱️ Aftrap {formatTimeBE(aftrap)}</h2>
          <p className="av-sub">Later beginnen (file, ziekte, uitloop) of vroeger als een wedstrijd ervoor wegvalt.</p>
        </div>
        {!open && (
          <button type="button" className="av-knop" onClick={() => setOpen(true)}>
            Verschuiven
          </button>
        )}
      </div>

      {open && (
        <div className="av-form">
          <span className="av-lbl">1. Waarom?</span>
          <div className="av-redenen">
            {REDENEN.map((r) => (
              <button
                key={r.v}
                type="button"
                className={`av-chip ${reden === r.v ? 'aan' : ''}`}
                aria-pressed={reden === r.v}
                onClick={() => {
                  setReden(r.v)
                  // Van richting wisselen: het verschil terug op 0, anders staat "vroeger" op +30.
                  if ((r.v === 'vervroegen') !== (deltaMin < 0)) setDeltaMin(0)
                }}
              >
                {r.l}
              </button>
            ))}
          </div>

          {reden && (
            <>
              <span className="av-lbl">2. {vroeger ? 'Hoeveel vroeger?' : 'Hoeveel later?'}</span>
              <div className="av-stappen">
                {stappen.map((s) => (
                  <button key={s} type="button" className={`av-stap ${deltaMin === s ? 'aan' : ''}`} onClick={() => setDeltaMin(s)}>
                    {s > 0 ? `+${s}` : s} min
                  </button>
                ))}
                <label className="av-uur">
                  of uur
                  <input type="time" value={uurVan(nieuw)} onChange={(e) => zetUur(e.target.value)} />
                </label>
              </div>
              {deltaMin !== 0 && (
                <p className="av-nieuw">
                  Nieuwe aftrap <strong>{formatTimeBE(nieuw)}</strong> ({Math.abs(deltaMin)} min {deltaMin > 0 ? 'later' : 'vroeger'})
                </p>
              )}

              {magMeeschuiven && volgende.length > 0 && deltaMin !== 0 && (
                <label className="av-mee">
                  <input type="checkbox" checked={meeschuiven} onChange={(e) => setMeeschuiven(e.target.checked)} />
                  <span>
                    Ook de {volgende.length === 1 ? 'volgende wedstrijd' : `${volgende.length} volgende wedstrijden`} op dit terrein{' '}
                    {Math.abs(deltaMin)} min {deltaMin > 0 ? 'later' : 'vroeger'}:
                    <ul>
                      {volgende.map((v) => (
                        <li key={v.id}>
                          {formatTimeBE(v.aftrap)} → {formatTimeBE(new Date(new Date(v.aftrap).getTime() + deltaMin * 60_000))} · {v.titel}
                        </li>
                      ))}
                    </ul>
                  </span>
                </label>
              )}

              <input
                className="av-toel"
                placeholder="Toelichting (optioneel), bv. ‘ongeval op de E40’"
                value={toelichting}
                maxLength={500}
                onChange={(e) => setToelichting(e.target.value)}
              />
              <div className="av-acties">
                <button type="button" className="av-knop" disabled={busy || deltaMin === 0} onClick={() => void verstuur()}>
                  {busy ? 'Bezig…' : 'Verschuiven en iedereen verwittigen'}
                </button>
                <button type="button" className="av-zacht" onClick={() => setOpen(false)}>
                  Annuleren
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {msg && (
        <p className={msg.ok ? 'av-ok' : 'av-fout'} role={msg.ok ? 'status' : 'alert'}>
          {msg.t}
        </p>
      )}

      {geschiedenis.length > 0 && (
        <ul className="av-log">
          {geschiedenis.map((g) => (
            <li key={g.id}>
              {formatTimeBE(g.van)} → <strong>{formatTimeBE(g.naar)}</strong> · {g.redenTekst}
              {g.meegeschoven ? ' (meegeschoven)' : ''}
              {g.toelichting ? ` — ${g.toelichting}` : ''} <span className="av-door">· {g.door}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
