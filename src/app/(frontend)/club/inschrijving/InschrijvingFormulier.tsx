'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'

type Ploeg = { team?: number | null; naam: string; reeks: string; thuisdag?: 'za' | 'zo' | null; thuisUur?: string | null; koppelMet?: string | null; opmerking?: string | null }
type Onb = { weekend: string; reden?: string | null; hard?: boolean }
type Invoer = { ploegen: Ploeg[]; aantalVelden: number; onbeschikbaar: Onb[]; wensen: string | null }

const STATUS: Record<string, string> = { nieuw: 'Nog niet ingevuld', concept: 'Bewaard, nog niet ingediend', ingediend: 'Ingediend bij de federatie', verwerkt: 'Verwerkt door de federatie' }

export function InschrijvingFormulier({
  ronde,
  status,
  ingediendOp,
  open,
  reeksen,
  begin,
  eersteWeekend,
  laatsteWeekend,
}: {
  ronde: number
  status: string
  ingediendOp: string | null
  open: boolean
  reeksen: { value: string; label: string }[]
  begin: Invoer
  eersteWeekend: string
  laatsteWeekend: string
}) {
  const router = useRouter()
  const [v, setV] = useState<Invoer>(begin)
  const [bezig, setBezig] = useState(false)
  const [nieuweDatum, setNieuweDatum] = useState('')

  const zetPloeg = (i: number, p: Partial<Ploeg>) => setV({ ...v, ploegen: v.ploegen.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const verstuur = async (indienen: boolean) => {
    setBezig(true)
    try {
      const res = await fetch('/api/club/inschrijving', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ronde, ...v, indienen }) })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', d.error ?? 'Mislukt.')
      toast('success', indienen ? 'Ingediend — de federatie is verwittigd.' : 'Bewaard.')
      router.refresh()
    } catch {
      toast('error', 'Geen verbinding — je invoer staat nog hier; probeer opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  const andereNamen = (i: number) => v.ploegen.filter((p, j) => j !== i && p.naam.trim() && p.reeks !== v.ploegen[i].reeks).map((p) => p.naam.trim())

  return (
    <div className="ins">
      <p className={`ins-status ins-${status}`}>
        {STATUS[status] ?? status}
        {ingediendOp ? ` · ${formatDateTimeBE(ingediendOp)}` : ''}
      </p>

      <section className="ins-blok">
        <h2>1. Ploegen</h2>
        <p className="ins-uitleg">
          Per ploeg de reeks en wanneer jullie thuis spelen. <strong>Koppelen</strong>: twee ploegen van jullie club (bv. heren en dames) die zo veel
          mogelijk hetzelfde weekend tegen dezelfde club spelen, op hetzelfde terrein — leuk voor supporters, makkelijk voor vervoer.
        </p>
        <div className="ins-ploegen">
          {v.ploegen.map((p, i) => (
            <div key={i} className="ins-ploeg">
              <div className="ins-rij">
                <label className="ins-veld ins-breed">
                  Ploegnaam
                  <input disabled={!open} value={p.naam} onChange={(e) => zetPloeg(i, { naam: e.target.value })} />
                </label>
                <label className="ins-veld ins-breed">
                  Reeks
                  <select disabled={!open} value={p.reeks} onChange={(e) => zetPloeg(i, { reeks: e.target.value })}>
                    <option value="">— kies —</option>
                    {reeksen.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="ins-rij">
                <div className="ins-veld">
                  Thuis op
                  <div className="ins-toggle" role="group" aria-label="Thuisdag">
                    {(['za', 'zo'] as const).map((d) => (
                      <button key={d} type="button" disabled={!open} className={(p.thuisdag ?? 'za') === d ? 'aan' : ''} onClick={() => zetPloeg(i, { thuisdag: d })}>
                        {d === 'za' ? 'Zaterdag' : 'Zondag'}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="ins-veld">
                  Uur
                  <input type="time" disabled={!open} value={p.thuisUur ?? ''} onChange={(e) => zetPloeg(i, { thuisUur: e.target.value })} />
                </label>
                <label className="ins-veld ins-breed">
                  Koppelen met
                  <select disabled={!open} value={p.koppelMet ?? ''} onChange={(e) => zetPloeg(i, { koppelMet: e.target.value || null })}>
                    <option value="">— niet —</option>
                    {andereNamen(i).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {open && (
                <button type="button" className="ins-weg" onClick={() => setV({ ...v, ploegen: v.ploegen.filter((_, j) => j !== i) })}>
                  ✕ Deze ploeg niet inschrijven
                </button>
              )}
            </div>
          ))}
        </div>
        {open && (
          <button type="button" className="ins-knop ins-zacht" onClick={() => setV({ ...v, ploegen: [...v.ploegen, { naam: '', reeks: '', thuisdag: 'za', thuisUur: '14:00' }] })}>
            + Ploeg toevoegen
          </button>
        )}
      </section>

      <section className="ins-blok">
        <h2>2. Terrein</h2>
        <div className="ins-veld">
          Aantal velden (wedstrijden tegelijk)
          <div className="ins-toggle" role="group" aria-label="Aantal velden">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" disabled={!open} className={v.aantalVelden === n ? 'aan' : ''} onClick={() => setV({ ...v, aantalVelden: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="ins-uitleg">
          Weekends dat jullie terrein <strong>niet vrij</strong>{' '}is (kermis, eigen tornooi, werken). Daar plannen we geen thuiswedstrijd. &quot;Liever niet&quot; proberen we te
          vermijden; &quot;kan echt niet&quot; is hard.
        </p>
        {v.onbeschikbaar.map((o, i) => (
          <div key={i} className="ins-rij ins-onb">
            <span className="ins-datum">{formatDateBE(o.weekend)}</span>
            <input
              disabled={!open}
              placeholder="Reden (optioneel)"
              value={o.reden ?? ''}
              onChange={(e) => setV({ ...v, onbeschikbaar: v.onbeschikbaar.map((x, j) => (j === i ? { ...x, reden: e.target.value } : x)) })}
            />
            <div className="ins-toggle" role="group" aria-label="Hoe hard">
              <button type="button" disabled={!open} className={o.hard !== false ? 'aan' : ''} onClick={() => setV({ ...v, onbeschikbaar: v.onbeschikbaar.map((x, j) => (j === i ? { ...x, hard: true } : x)) })}>
                Kan echt niet
              </button>
              <button type="button" disabled={!open} className={o.hard === false ? 'aan' : ''} onClick={() => setV({ ...v, onbeschikbaar: v.onbeschikbaar.map((x, j) => (j === i ? { ...x, hard: false } : x)) })}>
                Liever niet
              </button>
            </div>
            {open && (
              <button type="button" className="ins-weg" aria-label="Verwijderen" onClick={() => setV({ ...v, onbeschikbaar: v.onbeschikbaar.filter((_, j) => j !== i) })}>
                ✕
              </button>
            )}
          </div>
        ))}
        {open && (
          <div className="ins-rij">
            <input type="date" min={eersteWeekend} max={laatsteWeekend} value={nieuweDatum} onChange={(e) => setNieuweDatum(e.target.value)} aria-label="Datum" />
            <button
              type="button"
              className="ins-knop ins-zacht"
              disabled={!nieuweDatum}
              onClick={() => {
                setV({ ...v, onbeschikbaar: [...v.onbeschikbaar, { weekend: nieuweDatum, hard: true }] })
                setNieuweDatum('')
              }}
            >
              + Weekend toevoegen
            </button>
          </div>
        )}
      </section>

      <section className="ins-blok">
        <h2>3. Andere wensen</h2>
        <textarea
          disabled={!open}
          rows={3}
          placeholder="Bv. onze U14 liefst niet op hetzelfde moment als de heren (zelfde trainer)."
          value={v.wensen ?? ''}
          onChange={(e) => setV({ ...v, wensen: e.target.value })}
        />
      </section>

      {open && (
        <div className="ins-acties">
          <button type="button" className="ins-knop" disabled={bezig} onClick={() => void verstuur(true)}>
            {status === 'ingediend' ? 'Opnieuw indienen' : 'Indienen bij de federatie'}
          </button>
          <button type="button" className="ins-knop ins-zacht" disabled={bezig} onClick={() => void verstuur(false)}>
            Bewaren (nog niet indienen)
          </button>
        </div>
      )}
    </div>
  )
}
