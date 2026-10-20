'use client'

import Link from 'next/link'
import { useState } from 'react'

import { QrScanner } from '@/components/QrScanner'
import { toast } from '@/components/Toaster'
import { KEURING_ITEMS, KEURING_OPTIONS } from '@/lib/keuring'
import {
  MATCHSHEET_STATUS_OPTIONS,
  sheetOpenForScoring,
  type MatchSheetStatus,
} from '@/lib/matchsheet-workflow'
import {
  OFFICIAL_FUNCTIE_KEYS,
  OFFICIAL_LABELS,
  officialFieldStatus,
  requiredOfficials,
  validateOfficials,
} from '@/lib/officials-rules'
import type { Reeks } from '@/lib/reeksen'

const statusLabel = (s: string) =>
  MATCHSHEET_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

export type VergoedingState = {
  refereeKm: number | ''
  vanToepassing: boolean
  gemeldThuis: boolean
  gemeldUit: boolean
  aantalAutos: number | ''
  km: number | ''
}

// Forfait-uitslag: de niet-forfaiterende ploeg wint met 30–0; dubbel forfait = 0–0.
const FORFAIT_OPTIES: { value: string; label: string }[] = [
  { value: 'geen', label: 'Geen forfait' },
  { value: 'thuis', label: 'Thuis FF (0–30)' },
  { value: 'uit', label: 'Bezoekers FF (30–0)' },
  { value: 'dubbel', label: 'Dubbel FF (0–0)' },
]

export function RefereePanel({
  matchId,
  reeks,
  assignedRefereeId,
  initialStatus,
  initialKeuring,
  initialKeuringBevestigd,
  initialOfficials,
  initialVergoeding,
  initialForfaitUitslag,
  initialStartAkkoord,
  initialStartNaam,
  initialEindeAkkoord,
  initialEindeNaam,
  matchFinished,
  homeScore,
  awayScore,
  homeTeam,
  awayTeam,
  lineupReady,
  spelersNietInOrde = 0,
  officialsHint,
  isFederation,
  vrijgaveCode,
  backupRefereeName,
  andereTafel = null,
}: {
  matchId: string
  reeks: Reeks | null
  assignedRefereeId: number | null
  initialStatus: string
  initialKeuring: Record<string, string>
  initialKeuringBevestigd: boolean
  initialOfficials: Record<string, string>
  initialVergoeding: VergoedingState
  initialForfaitUitslag: string
  initialStartAkkoord: boolean
  initialStartNaam: string
  initialEindeAkkoord: boolean
  initialEindeNaam: string
  matchFinished: boolean
  homeScore: number
  awayScore: number
  homeTeam: string
  awayTeam: string
  lineupReady: { homeOk: boolean; awayOk: boolean }
  /** Spelers op de lijsten die nog niet gecontroleerd zijn, of volgens het reglement niet in orde. */
  spelersNietInOrde?: number
  officialsHint: string | null
  isFederation: boolean
  vrijgaveCode: string | null
  backupRefereeName: string | null
  /** Naam van wie deze lopende wedstrijd al aantekent (een andere tafel), of null. */
  andereTafel?: string | null
}) {
  const [status, setStatus] = useState<MatchSheetStatus>(initialStatus as MatchSheetStatus)
  const [keuring, setKeuring] = useState<Record<string, string>>(initialKeuring)
  const [keuringBevestigd, setKeuringBevestigd] = useState<boolean>(initialKeuringBevestigd)
  const [officials, setOfficials] = useState<Record<string, string>>(initialOfficials)
  const [verg, setVerg] = useState<VergoedingState>(initialVergoeding)
  const [ffUitslag, setFfUitslag] = useState<string>(initialForfaitUitslag || 'geen')
  const [ffSaved, setFfSaved] = useState<string>(initialForfaitUitslag || 'geen')
  const [startAkkoord, setStartAkkoord] = useState<boolean>(initialStartAkkoord)
  const [startNaam, setStartNaam] = useState<string>(initialStartNaam)
  const [eindeAkkoord, setEindeAkkoord] = useState<boolean>(initialEindeAkkoord)
  const [eindeNaam, setEindeNaam] = useState<string>(initialEindeNaam)
  const [eindeCode, setEindeCode] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Zet de melding én toon een toast (succes/fout).
  const notify = (ok: boolean, m: string) => {
    setMsg(m)
    toast(ok ? 'success' : 'error', m)
  }

  const saveStartAkkoord = async (akkoord: boolean, extra?: { qr?: string }) => {
    const { ok, json } = await post({ action: 'wedstrijdstart', akkoord, naam: startNaam, code, qr: extra?.qr })
    if (ok) {
      setStartAkkoord(akkoord)
      if (json.naam) setStartNaam(json.naam)
      if (json.status) setStatus(json.status)
      notify(
        true,
        akkoord
          ? `Akkoord gegeven${json.naam ? ` (${json.naam})` : ''} — de aantekenaar kan de wedstrijd openen.`
          : 'Akkoord ingetrokken.',
      )
    } else {
      notify(false, json.error || 'Mislukt.')
    }
  }

  const saveEindeAkkoord = async (akkoord: boolean, extra?: { qr?: string }) => {
    const { ok, json } = await post({ action: 'wedstrijdeinde', akkoord, naam: eindeNaam, code: eindeCode, qr: extra?.qr })
    if (ok) {
      setEindeAkkoord(akkoord)
      if (json.naam) setEindeNaam(json.naam)
      notify(true, akkoord ? `Eindstand bevestigd${json.naam ? ` (${json.naam})` : ''}.` : 'Bevestiging ingetrokken.')
    } else {
      notify(false, json.error || 'Mislukt.')
    }
  }

  const saveVergoeding = async () => {
    const { ok, json } = await post({
      action: 'vergoeding',
      refereeKm: verg.refereeKm === '' ? 0 : Number(verg.refereeKm),
      forfait: {
        vanToepassing: verg.vanToepassing,
        gemeldThuis: verg.gemeldThuis,
        gemeldUit: verg.gemeldUit,
        aantalAutos: verg.aantalAutos === '' ? 0 : Number(verg.aantalAutos),
        km: verg.km === '' ? 0 : Number(verg.km),
      },
    })
    notify(ok, ok ? 'Vergoeding bewaard.' : json.error || 'Mislukt.')
  }

  // Forfait-uitslag toepassen: zet meteen de score (0–30 / 30–0 / 0–0) en sluit de wedstrijd af;
  // terug naar "geen forfait" zet de wedstrijd weer op gepland.
  const saveForfait = async () => {
    const { ok, json } = await post({ action: 'forfait', uitslag: ffUitslag })
    if (!ok) {
      notify(false, json.error || 'Mislukt.')
      return
    }
    setFfSaved(json.uitslag)
    notify(
      true,
      json.score
        ? `Forfait toegepast — uitslag ${json.score.home}–${json.score.away}.`
        : 'Forfait verwijderd — de wedstrijd staat terug op gepland.',
    )
  }

  const required = new Set(reeks ? requiredOfficials(reeks) : [])
  const validation = reeks ? validateOfficials(reeks, officials) : { ok: true, errors: [] as string[] }
  const keuringNietOk = KEURING_ITEMS.filter((i) => (keuring[i.name] ?? 'ok') === 'niet_ok').length
  const keuringAllesOk = keuringNietOk === 0

  // Alles wat in orde moet zijn vóór de wedstrijd kan starten — geen losse statuskeuzes meer.
  const klaarChecks = [
    { ok: lineupReady.homeOk && lineupReady.awayOk, label: 'Opstellingen (min. 4 per ploeg)' },
    { ok: validation.ok, label: 'Officials volledig en geldig' },
    { ok: keuringBevestigd, label: 'Keuring bevestigd' },
    { ok: spelersNietInOrde === 0, label: 'Spelers gecontroleerd' },
    { ok: startAkkoord, label: 'Akkoord scheidsrechter' },
  ]
  const allesKlaar = klaarChecks.every((c) => c.ok)

  const saveOfficials = async () => {
    const { ok, json } = await post({ action: 'officials', officials })
    if (!ok) {
      notify(false, json.error || 'Mislukt.')
      return
    }
    notify(
      true,
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

  // `confirm`: undefined laat de bevestiging ongemoeid; true vergrendelt, false ontgrendelt.
  const saveKeuring = async (confirm?: boolean) => {
    const { ok, json } = await post({
      action: 'keuring',
      keuring,
      ...(typeof confirm === 'boolean' ? { bevestigd: confirm } : {}),
    })
    if (ok && typeof confirm === 'boolean') setKeuringBevestigd(confirm)
    notify(
      ok,
      ok
        ? confirm === true
          ? 'Keuring bevestigd en vergrendeld.'
          : confirm === false
            ? 'Keuring ontgrendeld — je kan ze weer aanpassen.'
            : 'Keuring bewaard.'
        : json.error || 'Mislukt.',
    )
  }

  const goTo = async (to: MatchSheetStatus) => {
    const { ok, json } = await post({ action: 'status', to })
    if (ok) {
      setStatus(json.status)
      notify(true, `Status → ${statusLabel(json.status)}.`)
    } else {
      notify(false, json.error || 'Statuswijziging mislukt.')
    }
  }

  const startBlokkers: string[] = []
  if (!lineupReady.homeOk) startBlokkers.push('opstelling thuis')
  if (!lineupReady.awayOk) startBlokkers.push('opstelling uit')
  if (!keuringBevestigd) startBlokkers.push('de materiële keuring (bevestigen)')
  if (spelersNietInOrde > 0) startBlokkers.push(`${spelersNietInOrde} speler${spelersNietInOrde === 1 ? '' : 's'} te controleren of niet in orde`)

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
            Nog in orde te brengen vóór je vrijgeeft: {startBlokkers.join(', ')}. Een opstelling telt minstens 4 spelers.
          </p>
        )}
        {backupRefereeName && (
          <p className="wb-sub">Backup-scheidsrechter: <strong style={{ color: 'var(--txt)' }}>{backupRefereeName}</strong> (mag óók vrijgeven met dezelfde code).</p>
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

        {/* Federatie ziet de per-wedstrijdcode (om door te geven als backup). */}
        {isFederation && (
          <p className="wb-sub" style={{ marginBottom: 10 }}>
            Vrijgavecode (backup, geef door aan de SR):{' '}
            <strong style={{ color: 'var(--accent)', fontSize: '1.05rem', letterSpacing: '0.12em' }}>{vrijgaveCode ?? '—'}</strong>
          </p>
        )}

        {startAkkoord ? (
          <div className="wb-btn-row" style={{ marginTop: 0 }}>
            <span className="wb-status" style={{ color: '#2a9d6a' }}>✓ Akkoord gegeven{startNaam ? ` — ${startNaam}` : ''}</span>
            <button type="button" onClick={() => saveStartAkkoord(false)} disabled={busy} className="wb-btn">
              Akkoord intrekken
            </button>
          </div>
        ) : isFederation ? (
          <button type="button" onClick={() => saveStartAkkoord(true)} disabled={busy} className="wb-btn wb-btn-primary">
            ✓ Akkoord — wedstrijd mag starten
          </button>
        ) : (
          <>
            {/* De scheidsrechter toont zijn persoonlijke QR; scan ze hier om vrij te geven. */}
            <QrScanner onResult={(qr) => saveStartAkkoord(true, { qr })} />
            <p className="wb-sub" style={{ margin: '12px 0 4px' }}>
              Geen QR? Voer een code in (persoonlijke code of vrijgavecode) als backup:
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <input
                className="wb-input"
                placeholder="Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => saveStartAkkoord(true)}
                disabled={busy || !code.trim()}
                className="wb-btn wb-btn-primary"
              >
                ✓ Akkoord
              </button>
            </div>
          </>
        )}
      </section>

      <section className="wb-card" style={{ gridColumn: '1 / -1', borderColor: eindeAkkoord ? '#2a9d6a' : undefined }}>
        <h2>Eindstand bevestigen</h2>
        <p className="wb-sub">
          De scheidsrechter bekrachtigt de officiële eindstand. Pas hiermee is de uitslag
          scheidsrechterlijk goedgekeurd.
        </p>
        <p style={{ fontSize: '1.25rem', fontWeight: 800, margin: '2px 0 12px', color: 'var(--txt)' }}>
          {homeTeam} <span style={{ color: 'var(--accent)' }}>{homeScore} – {awayScore}</span> {awayTeam}
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)', marginBottom: 10 }}>
          Naam scheidsrechter
          <input
            className="wb-input"
            placeholder="Voor- en achternaam"
            value={eindeNaam}
            onChange={(e) => setEindeNaam(e.target.value)}
          />
        </label>

        {eindeAkkoord ? (
          <div className="wb-btn-row" style={{ marginTop: 0 }}>
            <span className="wb-status" style={{ color: '#2a9d6a' }}>✓ Eindstand bevestigd{eindeNaam ? ` — ${eindeNaam}` : ''}</span>
            <button type="button" onClick={() => saveEindeAkkoord(false)} disabled={busy} className="wb-btn">
              Bevestiging intrekken
            </button>
          </div>
        ) : !matchFinished ? (
          <p className="wb-sub" style={{ color: '#e0a23d' }}>
            De eindstand kan pas bevestigd worden zodra de wedstrijd is afgelopen.
          </p>
        ) : isFederation ? (
          <button type="button" onClick={() => saveEindeAkkoord(true)} disabled={busy} className="wb-btn wb-btn-primary">
            ✓ Eindstand bevestigen
          </button>
        ) : (
          <>
            {/* De scheidsrechter toont zijn persoonlijke QR; scan ze hier om de eindstand te bekrachtigen. */}
            <QrScanner onResult={(qr) => saveEindeAkkoord(true, { qr })} />
            <p className="wb-sub" style={{ margin: '12px 0 4px' }}>
              Geen QR? Voer een code in (persoonlijke code of vrijgavecode) als backup:
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <input
                className="wb-input"
                placeholder="Code"
                value={eindeCode}
                onChange={(e) => setEindeCode(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => saveEindeAkkoord(true)}
                disabled={busy || !eindeCode.trim()}
                className="wb-btn wb-btn-primary"
              >
                ✓ Bevestigen
              </button>
            </div>
          </>
        )}
      </section>

      <section className="wb-card" style={ffSaved !== 'geen' ? { borderColor: '#e0533d' } : undefined}>
        <h2>Forfait</h2>
        <p className="wb-sub">
          Ploeg niet opgedaagd? Duid aan wie forfait gaf — de uitslag (30–0 of 0–30) wordt meteen
          op de wedstrijd gezet.
        </p>
        <div className="wb-btn-row" style={{ marginTop: 0 }}>
          {FORFAIT_OPTIES.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`wb-btn ${ffUitslag === o.value ? 'wb-btn-primary' : ''}`}
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => setFfUitslag(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {ffSaved !== 'geen' && (
          <p className="wb-sub" style={{ color: '#e0533d', marginTop: 8 }}>
            Forfait toegepast ({FORFAIT_OPTIES.find((o) => o.value === ffSaved)?.label}). De wedstrijd staat
            als afgelopen met de forfait-uitslag.
          </p>
        )}
        <button
          onClick={saveForfait}
          disabled={busy || ffUitslag === ffSaved}
          className="wb-btn wb-btn-primary"
          style={{ marginTop: 10 }}
        >
          {ffUitslag === 'geen' && ffSaved !== 'geen' ? 'Forfait verwijderen' : 'Forfait toepassen'}
        </button>
      </section>

      <section className="wb-card">
        <h2>Officials</h2>
        {officialsHint && <p className="wb-sub">{officialsHint}</p>}
        {/* Eén oogopslag: alles geldig → groen. Wat schort, staat bij het veld zelf. */}
        {validation.ok && <div className="ops-ready ok">✓ Officials volledig en geldig</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OFFICIAL_FUNCTIE_KEYS.map((key) => {
            const st = officialFieldStatus(key, officials)
            return (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
                <span className="off-lbl">
                  {OFFICIAL_LABELS[key]}
                  {st === 'ok' ? (
                    <span className="off-st ok">✓ OK</span>
                  ) : st === 'onvolledig' ? (
                    <span className="off-st bad">naam én voornaam nodig</span>
                  ) : st === 'conflict' ? (
                    <span className="off-st bad">mag geen grensrechter zijn (Art. 25)</span>
                  ) : required.has(key) ? (
                    <span className="off-st bad">*verplicht</span>
                  ) : null}
                </span>
                <input
                  className={`wb-input${st === 'ok' ? ' field-ok' : st === 'onvolledig' || st === 'conflict' ? ' field-bad' : ''}`}
                  placeholder="Voornaam + naam"
                  value={officials[key] ?? ''}
                  onChange={(e) => setOfficials((o) => ({ ...o, [key]: e.target.value }))}
                />
              </label>
            )
          })}
        </div>
        <button onClick={saveOfficials} disabled={busy} className="wb-btn wb-btn-primary" style={{ marginTop: 14 }}>
          Officials bewaren
        </button>
      </section>

      <section className={`wb-card${keuringBevestigd ? ' ops-locked' : ''}`}>
        <h2>Materiële keuring</h2>
        {/* Bevestigd = vergrendeld slot, voor iedereen duidelijk dat de keuring in orde is. */}
        {keuringBevestigd ? (
          <div className="ops-ready locked">
            🔒 Keuring bevestigd en vergrendeld{keuringAllesOk ? ' · alles OK' : ` · ${keuringNietOk} × NIET OK`}
          </div>
        ) : keuringAllesOk ? (
          <div className="ops-ready ok">✓ Alles OK — bevestig om te vergrendelen.</div>
        ) : (
          <div className="ops-ready todo">{keuringNietOk} {keuringNietOk === 1 ? 'punt' : 'punten'} NIET OK.</div>
        )}
        <div>
          {KEURING_ITEMS.map((item) => (
            <div key={item.name} className="wb-check">
              <span>{item.label}</span>
              <select
                className="wb-select"
                aria-label={item.label}
                value={keuring[item.name] ?? 'ok'}
                disabled={keuringBevestigd}
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
        {keuringBevestigd ? (
          <button onClick={() => saveKeuring(false)} disabled={busy} className="wb-btn" style={{ marginTop: 14 }}>
            🔓 Keuring ontgrendelen
          </button>
        ) : (
          <div className="wb-btn-row" style={{ marginTop: 14 }}>
            <button onClick={() => saveKeuring()} disabled={busy} className="wb-btn wb-btn-primary">
              Keuring bewaren
            </button>
            <button onClick={() => saveKeuring(true)} disabled={busy} className="wb-btn wb-btn-confirm">
              🔒 Bevestigen &amp; vergrendelen
            </button>
          </div>
        )}
      </section>

      <section className="wb-card">
        <h2>Vergoeding</h2>
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
        </div>
      </section>

      <section className="wb-card">
        <h2>Wedstrijd starten</h2>
        <p className="wb-sub">
          Huidige status: <span className="wb-status">{statusLabel(status)}</span>
        </p>
        {/* Geen losse statuskeuzes: alles juist ingevuld → één knop door naar de wedstrijd. */}
        <ul className="sr-checks">
          {klaarChecks.map((c) => (
            <li key={c.label} className={c.ok ? 'ok' : ''}>
              {c.ok ? '✓' : '·'} {c.label}
            </li>
          ))}
        </ul>
        {sheetOpenForScoring(status) ? (
          <div className="wb-btn-row" style={{ marginTop: 6 }}>
            {andereTafel ? (
              <Link href={`/match/${matchId}`} className="wb-btn">
                🔒 {andereTafel} tekent aan — bekijk de wedstrijd
              </Link>
            ) : (
              <Link href={`/scorekeeper/${matchId}`} className="wb-btn wb-btn-primary">
                → Naar stap 3 — Aantekenen
              </Link>
            )}
            {status === 'af_te_tekenen' && (
              <Link href={`/aftekenen/${matchId}`} className="wb-btn">
                → Naar stap 4 — Aftekenen
              </Link>
            )}
          </div>
        ) : (
          // De status volgt de vrijgave vanzelf (lib/blad-status.ts): geen aparte knop meer.
          <p className="wb-sub">
            {allesKlaar ? 'Alles in orde.' : 'Breng alles hierboven in orde en geef de wedstrijd vrij'} — dan kan de
            aantekentafel starten.
          </p>
        )}
        {isFederation && (
          <>
            <p className="wb-sub" style={{ marginTop: 16 }}>Manueel overschrijven (federatie, gelogd):</p>
            <div className="wb-btn-row" style={{ marginTop: 0 }}>
              {MATCHSHEET_STATUS_OPTIONS.filter((o) => o.value !== status && o.value !== 'ingediend').map((o) => (
                <button key={o.value} onClick={() => goTo(o.value)} disabled={busy} className="wb-btn" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
        {msg && <p className="wb-msg">{msg}</p>}
      </section>
    </div>
  )
}
