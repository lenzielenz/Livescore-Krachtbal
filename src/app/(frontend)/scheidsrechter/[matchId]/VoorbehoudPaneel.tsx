'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { COMITE_LABEL, VOORBEHOUD_ONDERWERPEN } from '@/lib/voorbehoud-onderwerpen'

type Kant = 'thuis' | 'uit'
export type BladRij = { side?: Kant | null; naam?: string | null; reden?: string | null; score?: string | null; speeltijd?: string | null; onderwerp?: string | null }
type Speler = { id: number; naam: string; rugnummer: number | null }

/**
 * Voorbehoud en uitsluiting noteren (RCVK items 25 en 27), zoals vroeger op de voor- of keerzijde van
 * het blad: voor welke ploeg, wie het vraagt (kapitein; U12–U16 de coach), een kort relaas, de score
 * en de speeltijd. Na het indienen wordt elk voorbehoud een dossier dat de club binnen 5 werkdagen
 * moet bekrachtigen. Zodra de scheidsrechter aftekende, ligt alles vast (item 37).
 */
export function VoorbehoudPaneel({
  matchId,
  ploegen,
  spelers,
  begin,
  vergrendeld,
  stand,
  rapportVolgtBegin,
}: {
  matchId: string | number
  ploegen: Record<Kant, string>
  spelers: Record<Kant, Speler[]>
  begin: { voorbehoud: BladRij[]; uitsluitingen: BladRij[] }
  vergrendeld: string | null
  stand: string
  /** "Zie scheidsrechtersrapport" voor een andere onregelmatigheid (RCVK item 27). */
  rapportVolgtBegin: boolean
}) {
  const [rijen, setRijen] = useState(begin)
  const [soort, setSoort] = useState<'voorbehoud' | 'uitsluiting'>('voorbehoud')
  const [side, setSide] = useState<Kant>('thuis')
  const [naam, setNaam] = useState('')
  const [speler, setSpeler] = useState('')
  const [reden, setReden] = useState('')
  const [score, setScore] = useState(stand)
  const [speeltijd, setSpeeltijd] = useState('')
  const [onderwerp, setOnderwerp] = useState('')
  const [rapportVolgt, setRapportVolgt] = useState(rapportVolgtBegin)
  const [bezig, setBezig] = useState(false)

  const stuur = async (body: Record<string, unknown>, ok: string) => {
    setBezig(true)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/referee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; rijen?: BladRij[] }
      if (!res.ok) return toast('error', d.error ?? 'Bewaren mislukt.')
      const veld = String(body.action).startsWith('voorbehoud') ? 'voorbehoud' : 'uitsluitingen'
      setRijen((r) => ({ ...r, [veld]: d.rijen ?? [] }))
      toast('success', ok)
      return true
    } finally {
      setBezig(false)
    }
  }

  const noteer = async () => {
    const gelukt = await stuur(
      {
        action: soort,
        side,
        naam: soort === 'voorbehoud' ? naam : spelers[side].find((s) => String(s.id) === speler)?.naam ?? naam,
        playerId: soort === 'uitsluiting' && speler ? Number(speler) : undefined,
        reden,
        score,
        speeltijd,
        onderwerp: soort === 'voorbehoud' ? onderwerp : undefined,
      },
      soort === 'voorbehoud' ? 'Voorbehoud genoteerd. Na het indienen moet de club het binnen 5 werkdagen bekrachtigen.' : 'Uitsluiting genoteerd op het blad.',
    )
    if (gelukt) {
      setReden('')
      setNaam('')
      setSpeler('')
      setSpeeltijd('')
      setOnderwerp('')
    }
  }

  const zetRapportVolgt = async (aan: boolean) => {
    setBezig(true)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/referee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'rapport-volgt', aan }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; rapportVolgt?: boolean }
      if (!res.ok) return toast('error', d.error ?? 'Bewaren mislukt.')
      setRapportVolgt(Boolean(d.rapportVolgt))
    } finally {
      setBezig(false)
    }
  }

  const lijst = (titel: string, items: BladRij[], actie: string) =>
    items.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <h3 style={{ fontSize: '0.9rem', margin: '0 0 6px' }}>{titel}</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((r, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <strong>{r.side === 'uit' ? ploegen.uit : ploegen.thuis}</strong>
              {(() => {
                const o = VOORBEHOUD_ONDERWERPEN.find((x) => x.value === r.onderwerp)
                return o ? ` · ${o.label}${o.comite ? ` (${COMITE_LABEL[o.comite]})` : ''}` : ''
              })()}
              {r.naam ? ` — ${r.naam}` : ''}: {r.reden}
              {r.score ? ` (stand ${r.score}` : ''}
              {r.score && r.speeltijd ? `, ${r.speeltijd})` : r.score ? ')' : r.speeltijd ? ` (${r.speeltijd})` : ''}
              {!vergrendeld && (
                <button type="button" className="wb-btn" style={{ marginLeft: 8, padding: '2px 8px' }} disabled={bezig} onClick={() => void stuur({ action: actie, index: i }, 'Regel geschrapt.')}>
                  schrappen
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <section className="wb-card" id="voorbehoud" style={{ marginBottom: 16 }}>
      <h2>⚖️ Voorbehoud en uitsluiting</h2>
      <p className="wb-sub">
        Enkel de kapitein (U12–U16: de coach) vraagt voorbehoud, tijdens de eerstvolgende onderbreking na de feiten. Noteer een kort
        relaas met de stand en de speeltijd. Na het indienen moet de club het binnen 5 werkdagen bekrachtigen, anders volgen 75 euro
        administratieve kosten (RCVK item 25).
      </p>
      {vergrendeld ? (
        <p className="wb-sub">{vergrendeld}</p>
      ) : (
        <>
          <div className="bl-form">
            <label>
              Wat
              <select className="wb-input" value={soort} onChange={(e) => setSoort(e.target.value === 'uitsluiting' ? 'uitsluiting' : 'voorbehoud')}>
                <option value="voorbehoud">Voorbehoud</option>
                <option value="uitsluiting">Uitsluiting</option>
              </select>
            </label>
            <label>
              Ploeg
              <select className="wb-input" value={side} onChange={(e) => { setSide(e.target.value === 'uit' ? 'uit' : 'thuis'); setSpeler('') }}>
                <option value="thuis">Thuis — {ploegen.thuis}</option>
                <option value="uit">Uit — {ploegen.uit}</option>
              </select>
            </label>
            {soort === 'voorbehoud' && (
              <label>
                Waarover (bepaalt het comité)
                <select className="wb-input" value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)}>
                  <option value="">Kies…</option>
                  {VOORBEHOUD_ONDERWERPEN.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                      {o.comite ? ` — ${COMITE_LABEL[o.comite]}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {soort === 'voorbehoud' ? (
              <label>
                Gevraagd door
                <input className="wb-input" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam van de kapitein of coach" />
              </label>
            ) : (
              <label>
                Speler
                <select className="wb-input" value={speler} onChange={(e) => setSpeler(e.target.value)}>
                  <option value="">Kies…</option>
                  {spelers[side].map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.rugnummer != null ? `#${p.rugnummer} ` : ''}
                      {p.naam}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Stand
              <input className="wb-input" value={score} onChange={(e) => setScore(e.target.value)} placeholder="bv. 12-9" />
            </label>
            <label>
              Speeltijd
              <input className="wb-input" value={speeltijd} onChange={(e) => setSpeeltijd(e.target.value)} placeholder="bv. 2e helft 14'" />
            </label>
            <label className="bl-breed">
              {soort === 'voorbehoud' ? 'Kort relaas van de feiten' : 'Reden van de uitsluiting'}
              <textarea className="wb-input" rows={2} value={reden} onChange={(e) => setReden(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            disabled={bezig || reden.trim().length < 5 || (soort === 'voorbehoud' ? naam.trim().length < 2 || !onderwerp : !speler)}
            onClick={() => void noteer()}
          >
            {bezig ? 'Bezig…' : soort === 'voorbehoud' ? 'Voorbehoud noteren' : 'Uitsluiting noteren'}
          </button>
        </>
      )}
      {rijen.voorbehoud.length + rijen.uitsluitingen.length > 0 ? (
        <p className="wb-sub" style={{ marginTop: 10 }}>
          📝 Op het blad komt <strong>zie scheidsrechtersrapport</strong>. Maak na de wedstrijd het rapport op (hieronder) voor het scheidsrechterscomité.
        </p>
      ) : (
        <label className="wb-sub" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" checked={rapportVolgt} disabled={bezig || Boolean(vergrendeld)} onChange={(e) => void zetRapportVolgt(e.target.checked)} />
          <span>
            Andere onregelmatigheid: zet <strong>zie scheidsrechtersrapport</strong> op het blad (RCVK item 27)
          </span>
        </label>
      )}
      {lijst('Voorbehoud', rijen.voorbehoud, 'voorbehoud-schrappen')}
      {lijst('Uitsluitingen', rijen.uitsluitingen, 'uitsluiting-schrappen')}
    </section>
  )
}
