'use client'

import { useState } from 'react'

import { KEURING_ITEMS, KEURING_OPTIONS } from '@/lib/keuring'
import { MATCHSHEET_STATUS_OPTIONS, nextStatus, type MatchSheetStatus } from '@/lib/matchsheet-workflow'
import {
  OFFICIAL_FUNCTIE_KEYS,
  OFFICIAL_LABELS,
  requiredOfficials,
  validateOfficials,
} from '@/lib/officials-rules'
import type { Reeks } from '@/lib/reeksen'

const statusLabel = (s: string) =>
  MATCHSHEET_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

export type VergoedingState = {
  refereeKm: number | ''
  uitslag: string
  vanToepassing: boolean
  gemeldThuis: boolean
  gemeldUit: boolean
  aantalAutos: number | ''
  km: number | ''
}

const FORFAIT_OPTIES: { value: string; label: string }[] = [
  { value: 'geen', label: 'Geen' },
  { value: 'thuis', label: 'Thuis FF' },
  { value: 'uit', label: 'Bezoekers FF' },
  { value: 'dubbel', label: 'Dubbel FF' },
]

export function RefereePanel({
  matchId,
  reeks,
  assignedRefereeId,
  initialStatus,
  initialKeuring,
  initialOfficials,
  initialVergoeding,
  initialStartAkkoord,
  initialStartNaam,
  lineupReady,
  officialsHint,
}: {
  matchId: string
  reeks: Reeks | null
  assignedRefereeId: number | null
  initialStatus: string
  initialKeuring: Record<string, string>
  initialOfficials: Record<string, string>
  initialVergoeding: VergoedingState
  initialStartAkkoord: boolean
  initialStartNaam: string
  lineupReady: { homeOk: boolean; awayOk: boolean }
  officialsHint: string | null
}) {
  const [status, setStatus] = useState<MatchSheetStatus>(initialStatus as MatchSheetStatus)
  const [keuring, setKeuring] = useState<Record<string, string>>(initialKeuring)
  const [officials, setOfficials] = useState<Record<string, string>>(initialOfficials)
  const [verg, setVerg] = useState<VergoedingState>(initialVergoeding)
  const [startAkkoord, setStartAkkoord] = useState<boolean>(initialStartAkkoord)
  const [startNaam, setStartNaam] = useState<string>(initialStartNaam)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const saveStartAkkoord = async (akkoord: boolean) => {
    const { ok, json } = await post({ action: 'wedstrijdstart', akkoord, naam: startNaam })
    if (ok) {
      setStartAkkoord(akkoord)
      setMsg(akkoord ? 'Akkoord gegeven — de aantekenaar kan de wedstrijd openen.' : 'Akkoord ingetrokken.')
    } else {
      setMsg(json.error || 'Mislukt.')
    }
  }

  const saveVergoeding = async () => {
    const { ok, json } = await post({
      action: 'vergoeding',
      refereeKm: verg.refereeKm === '' ? 0 : Number(verg.refereeKm),
      forfait: {
        uitslag: verg.uitslag || 'geen',
        vanToepassing: verg.vanToepassing,
        gemeldThuis: verg.gemeldThuis,
        gemeldUit: verg.gemeldUit,
        aantalAutos: verg.aantalAutos === '' ? 0 : Number(verg.aantalAutos),
        km: verg.km === '' ? 0 : Number(verg.km),
      },
    })
    setMsg(ok ? 'Vergoeding & forfait bewaard.' : json.error || 'Mislukt.')
  }

  const required = new Set(reeks ? requiredOfficials(reeks) : [])
  const validation = reeks ? validateOfficials(reeks, officials) : { ok: true, errors: [] as string[] }

  const saveOfficials = async () => {
    const { ok, json } = await post({ action: 'officials', officials })
    if (!ok) {
      setMsg(json.error || 'Mislukt.')
      return
    }
    setMsg(
      validation.ok
        ? 'Officials bewaard — volledig en geldig.'
        : 'Officials bewaard. Let op: nog niet volledig (zie aandachtspunten).',
    )
  }

  const post = async (body: Record<string, unknown>) => {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/matchsheet/${matchId}/referee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setBusy(false)
    return { ok: res.ok, json }
  }

  const saveKeuring = async () => {
    const { ok, json } = await post({ action: 'keuring', keuring })
    setMsg(ok ? 'Keuring bewaard.' : json.error || 'Mislukt.')
  }

  const goTo = async (to: MatchSheetStatus) => {
    const { ok, json } = await post({ action: 'status', to })
    if (ok) {
      setStatus(json.status)
      setMsg(`Status → ${statusLabel(json.status)}.`)
    } else {
      setMsg(json.error || 'Statuswijziging mislukt.')
    }
  }

  const next = nextStatus(status)

  const startBlokkers: string[] = []
  if (!lineupReady.homeOk) startBlokkers.push('opstelling thuis')
  if (!lineupReady.awayOk) startBlokkers.push('opstelling uit')

  return (
    <div className="wb-grid">
      <section className="wb-card" style={{ gridColumn: '1 / -1', borderColor: startAkkoord ? '#2a9d6a' : undefined }}>
        <h2>Wedstrijdstart vrijgeven</h2>
        <p className="wb-sub">
          Controleer beide opstellingen en het terrein. Geef daarna akkoord — pas dan kan de
          aantekenaar de wedstrijd openen en starten.
        </p>
        {startBlokkers.length > 0 && (
          <p className="wb-sub" style={{ color: '#e0533d' }}>
            Let op: {startBlokkers.join(' en ')} nog niet volledig (minstens 4 spelers per ploeg).
          </p>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)', marginBottom: 10 }}>
          Naam scheidsrechter
          <input
            className="wb-input"
            placeholder="Voor- en achternaam"
            value={startNaam}
            onChange={(e) => setStartNaam(e.target.value)}
          />
        </label>
        {startAkkoord ? (
          <div className="wb-btn-row" style={{ marginTop: 0 }}>
            <span className="wb-status" style={{ color: '#2a9d6a' }}>✓ Akkoord gegeven</span>
            <button type="button" onClick={() => saveStartAkkoord(false)} disabled={busy} className="wb-btn">
              Akkoord intrekken
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => saveStartAkkoord(true)} disabled={busy} className="wb-btn wb-btn-primary">
            ✓ Akkoord — wedstrijd mag starten
          </button>
        )}
      </section>

      <section className="wb-card">
        <h2>Officials</h2>
        {officialsHint && <p className="wb-sub">{officialsHint}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OFFICIAL_FUNCTIE_KEYS.map((key) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
              {OFFICIAL_LABELS[key]}
              {required.has(key) && <span style={{ color: '#e0533d' }}> *verplicht</span>}
              <input
                className="wb-input"
                placeholder="Volledige naam + voornaam"
                value={officials[key] ?? ''}
                onChange={(e) => setOfficials((o) => ({ ...o, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {!validation.ok && (
          <ul className="wb-sub" style={{ marginTop: 10, color: '#e0533d', paddingLeft: 18 }}>
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <button onClick={saveOfficials} disabled={busy} className="wb-btn wb-btn-primary" style={{ marginTop: 14 }}>
          Officials bewaren
        </button>
      </section>

      <section className="wb-card">
        <h2>Materiële keuring</h2>
        <div>
          {KEURING_ITEMS.map((item) => (
            <div key={item.name} className="wb-check">
              <span>{item.label}</span>
              <select
                className="wb-select"
                aria-label={item.label}
                value={keuring[item.name] ?? 'ok'}
                onChange={(e) => setKeuring((k) => ({ ...k, [item.name]: e.target.value }))}
              >
                {KEURING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <button onClick={saveKeuring} disabled={busy} className="wb-btn wb-btn-primary" style={{ marginTop: 14 }}>
          Keuring bewaren
        </button>
      </section>

      <section className="wb-card">
        <h2>Vergoeding &amp; forfait</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
          Afgelegde km (kwitantie, €0,4327/km)
          <input
            className="wb-input"
            type="number"
            min={0}
            value={verg.refereeKm}
            onChange={(e) => setVerg((v) => ({ ...v, refereeKm: e.target.value === '' ? '' : Number(e.target.value) }))}
          />
        </label>

        <p className="wb-sub" style={{ marginTop: 14, marginBottom: 4 }}>Forfait (FF) — welke ploeg gaf forfait?</p>
        <div className="wb-btn-row" style={{ marginTop: 0, marginBottom: 6 }}>
          {FORFAIT_OPTIES.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`wb-btn ${(verg.uitslag || 'geen') === o.value ? 'wb-btn-primary' : ''}`}
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => setVerg((v) => ({ ...v, uitslag: o.value }))}
            >
              {o.label}
            </button>
          ))}
        </div>

        <p className="wb-sub" style={{ marginTop: 12, marginBottom: 4 }}>Forfait-onkostenblad (enkel bij FF):</p>
        <label className="wb-check"><span>Onkostenblad van toepassing</span>
          <input type="checkbox" checked={verg.vanToepassing} onChange={(e) => setVerg((v) => ({ ...v, vanToepassing: e.target.checked }))} />
        </label>
        <label className="wb-check"><span>Forfait gemeld — thuis</span>
          <input type="checkbox" checked={verg.gemeldThuis} onChange={(e) => setVerg((v) => ({ ...v, gemeldThuis: e.target.checked }))} />
        </label>
        <label className="wb-check"><span>Forfait gemeld — bezoekers</span>
          <input type="checkbox" checked={verg.gemeldUit} onChange={(e) => setVerg((v) => ({ ...v, gemeldUit: e.target.checked }))} />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)', flex: 1 }}>
            Auto&apos;s (max 2)
            <input className="wb-input" type="number" min={0} max={2} value={verg.aantalAutos}
              onChange={(e) => setVerg((v) => ({ ...v, aantalAutos: e.target.value === '' ? '' : Number(e.target.value) }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)', flex: 1 }}>
            Verpl. km (€0,4259/km)
            <input className="wb-input" type="number" min={0} value={verg.km}
              onChange={(e) => setVerg((v) => ({ ...v, km: e.target.value === '' ? '' : Number(e.target.value) }))} />
          </label>
        </div>

        <button onClick={saveVergoeding} disabled={busy} className="wb-btn wb-btn-primary" style={{ marginTop: 14 }}>
          Bewaren
        </button>
        <div className="wb-btn-row" style={{ marginTop: 10 }}>
          <a className="wb-btn" href={`/api/match/${matchId}/forfait`} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
            ⬇ Forfait-onkostenblad (PDF)
          </a>
          {assignedRefereeId != null && (
            <a className="wb-btn" href={`/api/scheidsrechter/${assignedRefereeId}/kwitantie`} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
              ⬇ Kwitantie scheidsrechter (PDF)
            </a>
          )}
          <a className="wb-btn" href="/admin/collections/accidents/create" target="_blank" rel="noreferrer" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
            🚑 Kwetsuur / ongeval registreren
          </a>
        </div>
      </section>

      <section className="wb-card">
        <h2>Status</h2>
        <p className="wb-sub">
          Huidige status: <span className="wb-status">{statusLabel(status)}</span>
        </p>
        {next && (
          <button onClick={() => goTo(next)} disabled={busy} className="wb-btn wb-btn-primary">
            → Naar &quot;{statusLabel(next)}&quot;
          </button>
        )}
        <p className="wb-sub" style={{ marginTop: 16 }}>Manueel overschrijven (override, gelogd):</p>
        <div className="wb-btn-row" style={{ marginTop: 0 }}>
          {MATCHSHEET_STATUS_OPTIONS.filter((o) => o.value !== status && o.value !== 'ingediend').map((o) => (
            <button key={o.value} onClick={() => goTo(o.value)} disabled={busy} className="wb-btn" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
              {o.label}
            </button>
          ))}
        </div>
        {msg && <p className="wb-msg">{msg}</p>}
      </section>
    </div>
  )
}
