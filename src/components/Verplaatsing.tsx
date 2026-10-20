'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { brusselsWallUtc, formatDateTimeBE } from '@/lib/datetime'
import type { VerplaatsingRij } from '@/lib/verplaatsing'

import './aftrap-verschuiven.css'

const STATUS: Record<string, string> = {
  wacht_tegenpartij: 'Wacht op de tegenpartij',
  wacht_federatie: 'Beide clubs akkoord — wacht op de federatie',
  geweigerd: 'Geweigerd door de tegenpartij',
  goedgekeurd: 'Goedgekeurd',
  afgewezen: 'Afgewezen door de federatie',
  ingetrokken: 'Ingetrokken',
}

/** Een verplaatsing aanvragen of beantwoorden, op de wedstrijdpagina (lib/verplaatsing.ts). */
export function Verplaatsing({
  matchId,
  aanvraag,
  rol,
}: {
  matchId: number
  aanvraag: VerplaatsingRij | null
  /** 'aanvrager' | 'tegenpartij' | 'federatie' | 'club' (nog geen aanvraag) */
  rol: 'aanvrager' | 'tegenpartij' | 'federatie' | 'club'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [wanneer, setWanneer] = useState('')
  const [reden, setReden] = useState('')
  const [opm, setOpm] = useState('')
  const [bezig, setBezig] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBezig(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/match/${matchId}/verplaatsing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Mislukt.')
      setMsg({ ok: true, t: ok })
      setOpen(false)
      router.refresh()
    } catch (e) {
      setMsg({ ok: false, t: e instanceof Error ? e.message : 'Geen verbinding.' })
    } finally {
      setBezig(false)
    }
  }
  const lopend = aanvraag && (aanvraag.status === 'wacht_tegenpartij' || aanvraag.status === 'wacht_federatie')

  return (
    <section className="av" aria-label="Verplaatsing">
      <div className="av-kop">
        <div>
          <h2 className="av-h">🔁 Verplaatsing</h2>
          {aanvraag ? (
            <p className="av-sub">
              Naar <strong>{formatDateTimeBE(aanvraag.voorgesteld)}</strong> · {STATUS[aanvraag.status] ?? aanvraag.status}
              <br />
              Reden: {aanvraag.reden}
              {aanvraag.tegenpartijOpmerking ? ` · Tegenpartij: ${aanvraag.tegenpartijOpmerking}` : ''}
              {aanvraag.federatieOpmerking ? ` · Federatie: ${aanvraag.federatieOpmerking}` : ''}
            </p>
          ) : (
            <p className="av-sub">Kan deze wedstrijd niet doorgaan op de geplande datum? Stel een nieuwe datum voor: de tegenpartij gaat akkoord, de federatie beslist.</p>
          )}
        </div>
        {!lopend && rol !== 'federatie' && !open && (
          <button type="button" className="av-knop" onClick={() => setOpen(true)}>
            Verplaatsing aanvragen
          </button>
        )}
      </div>

      {open && (
        <div className="av-form">
          <label className="av-uur">
            Nieuwe datum en uur
            <input type="datetime-local" value={wanneer} onChange={(e) => setWanneer(e.target.value)} />
          </label>
          <input className="av-toel" placeholder="Reden (verplicht)" value={reden} maxLength={1000} onChange={(e) => setReden(e.target.value)} />
          <div className="av-acties">
            <button
              type="button"
              className="av-knop"
              disabled={bezig || !wanneer || !reden.trim()}
              onClick={() => {
                const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wanneer)
                if (!m) return
                void post({ actie: 'aanvragen', voorgesteld: brusselsWallUtc(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString(), reden }, 'Aangevraagd — de tegenpartij is verwittigd.')
              }}
            >
              Aanvragen
            </button>
            <button type="button" className="av-zacht" onClick={() => setOpen(false)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {lopend && aanvraag && (
        <div className="av-form">
          {(rol === 'tegenpartij' || rol === 'federatie') && (
            <input className="av-toel" placeholder="Opmerking (optioneel)" value={opm} onChange={(e) => setOpm(e.target.value)} />
          )}
          <div className="av-acties">
            {rol === 'tegenpartij' && aanvraag.status === 'wacht_tegenpartij' && (
              <>
                <button type="button" className="av-knop" disabled={bezig} onClick={() => void post({ actie: 'akkoord', id: aanvraag.id, opmerking: opm }, 'Akkoord — de federatie beslist.')}>
                  👍 Akkoord
                </button>
                <button type="button" className="av-zacht" disabled={bezig} onClick={() => void post({ actie: 'weigeren', id: aanvraag.id, opmerking: opm }, 'Geweigerd.')}>
                  ✋ Weigeren
                </button>
              </>
            )}
            {rol === 'federatie' && (
              <>
                <button type="button" className="av-knop" disabled={bezig} onClick={() => void post({ actie: 'goedkeuren', id: aanvraag.id, opmerking: opm }, 'Goedgekeurd — iedereen is verwittigd.')}>
                  ✅ Goedkeuren
                </button>
                <button type="button" className="av-zacht" disabled={bezig} onClick={() => void post({ actie: 'afwijzen', id: aanvraag.id, opmerking: opm }, 'Afgewezen.')}>
                  Afwijzen
                </button>
              </>
            )}
            {rol === 'aanvrager' && (
              <button type="button" className="av-zacht" disabled={bezig} onClick={() => void post({ actie: 'intrekken', id: aanvraag.id }, 'Ingetrokken.')}>
                Intrekken
              </button>
            )}
          </div>
        </div>
      )}
      {msg && (
        <p className={msg.ok ? 'av-ok' : 'av-fout'} role={msg.ok ? 'status' : 'alert'}>
          {msg.t}
        </p>
      )}
    </section>
  )
}
