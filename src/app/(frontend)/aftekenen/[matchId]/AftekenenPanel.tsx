'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { formatDateTimeBE } from '@/lib/datetime'

type Who = 'kapiteinThuis' | 'kapiteinUit' | 'scheidsrechter'
type Side = 'home' | 'away' | null

export type SignatureData = {
  naam?: string | null
  handtekening?: string | null
  akkoord?: boolean | null
  tijdstip?: string | null
}

const ORDER: Who[] = ['kapiteinThuis', 'kapiteinUit', 'scheidsrechter']
const LABEL: Record<Who, string> = { kapiteinThuis: 'Kapitein thuis', kapiteinUit: 'Kapitein uit', scheidsrechter: 'Scheidsrechter' }

function formatTijdstip(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return formatDateTimeBE(d, { dateStyle: 'short', timeStyle: 'short' })
}

function SignaturePad({
  matchId,
  who,
  nr,
  side,
  teamName,
  uitslag,
  initial,
  defaultNaam,
  aanDeBeurt,
  onSigned,
}: {
  matchId: string
  who: Who
  nr: number
  side: Side
  teamName?: string
  /** De uitslag waarvoor getekend wordt, bv. "Zandberg Heren 4 – 4 Baasrode Heren". */
  uitslag: string
  initial?: SignatureData
  /** Vooraf gekende naam (kapitein/scheidsrechter uit de wedstrijd) — niemand hoeft te typen. */
  defaultNaam?: string
  aanDeBeurt: boolean
  onSigned?: (s: SignatureData) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  // Naam wordt NIET getypt: ze komt uit de wedstrijd (kapitein/SR), of valt server-side terug op
  // het ingelogde account. Aftekenen = gewoon tekenen + bevestigen.
  const vooraf = (initial?.naam || defaultNaam || '').trim()
  // Geen kapitein aangeduid in de opstelling? Dan vul je hier de naam in.
  const [getypt, setGetypt] = useState('')
  const naam = vooraf || getypt.trim()
  const [msg, setMsg] = useState<string | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const [bezig, setBezig] = useState(false)

  // Een afgetekende handtekening is definitief: ze kan niet meer gewist of overschreven
  // worden (reglement Item 37). We tonen dan een vergrendelde weergave i.p.v. het canvas.
  const alreadySigned = Boolean(initial?.akkoord && initial?.handtekening)
  const [locked, setLocked] = useState(alreadySigned)
  const [signedImg, setSignedImg] = useState<string | null>(alreadySigned ? (initial?.handtekening ?? null) : null)
  const [signedAt, setSignedAt] = useState<string | null>(initial?.tijdstip ?? null)

  // Het tekenvak volgt de echte breedte en de pixeldichtheid van het scherm: scherpe lijnen, en de
  // lijn ligt exact onder de vinger (anders verschuift ze als het vak breder getoond wordt).
  useEffect(() => {
    if (locked) return
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const r = c.getBoundingClientRect()
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#14213d'
  }, [locked])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasInk(true)
  }
  const up = () => {
    drawing.current = false
  }
  const clear = () => {
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }

  const save = async () => {
    if (!hasInk) return setMsg('Teken eerst je handtekening in het vak.')
    if (!naam && who !== 'scheidsrechter') return setMsg('Vul de naam van de kapitein in.')
    setBezig(true)
    const dataUrl = canvasRef.current!.toDataURL('image/png')
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who, naam, handtekening: dataUrl, akkoord: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        // Direct vergrendelen: na opslaan kan deze handtekening niet meer gewist worden.
        const nu = new Date().toISOString()
        setSignedImg(dataUrl)
        setSignedAt(nu)
        setLocked(true)
        setMsg(null)
        onSigned?.({ naam, handtekening: dataUrl, akkoord: true, tijdstip: nu })
      } else {
        setMsg(json.error || 'Aftekenen mislukt.')
      }
    } catch {
      setMsg('Geen verbinding — probeer opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className={`aft-kaart${locked ? ' getekend' : ''}${aanDeBeurt && !locked ? ' beurt' : ''}`}>
      <header className="aft-kaart-kop">
        <span className="aft-nr" aria-hidden>{locked ? '✓' : nr}</span>
        <div className="aft-kaart-titel">
          <h3>{LABEL[who]}</h3>
          {teamName && <span className="aft-ploeg">{teamName}</span>}
        </div>
        {side && <span className={`aft-kant ${side}`}>{side === 'home' ? 'THUIS' : 'UIT'}</span>}
      </header>

      {locked ? (
        <div className="aft-getekend">
          <div className="aft-vak aft-vak-vast">{signedImg && <img src={signedImg} alt={`Handtekening ${LABEL[who]}`} />}</div>
          <p className="aft-wie">
            <strong>{naam || '—'}</strong>
            <span>✅ Akkoord{signedAt && ` · ${formatTijdstip(signedAt)}`}</span>
          </p>
        </div>
      ) : (
        <>
          {vooraf ? (
            <p className="aft-tekent">
              Tekent: <strong>{vooraf}</strong>
            </p>
          ) : who !== 'scheidsrechter' ? (
            <label className="aft-naam">
              Naam van de kapitein
              <input className="wb-input" value={getypt} onChange={(e) => setGetypt(e.target.value)} placeholder="Voornaam en naam" autoComplete="off" />
            </label>
          ) : null}
          <p className="aft-verklaring">
            Ik verklaar dat de uitslag <strong>{uitslag}</strong> en dit wedstrijdblad juist zijn.
          </p>
          <div className="aft-vak-wrap">
            <canvas
              ref={canvasRef}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              className="aft-vak"
              aria-label={`Tekenvak handtekening ${LABEL[who]}`}
            />
            {!hasInk && <span className="aft-vak-hint" aria-hidden>✍️ Teken hier met je vinger</span>}
          </div>
          <div className="aft-knoppen">
            <button type="button" onClick={clear} className="wb-btn" disabled={!hasInk || bezig}>
              Wissen
            </button>
            <button type="button" onClick={save} className="wb-btn wb-btn-primary aft-teken" disabled={!hasInk || bezig}>
              {bezig ? 'Bezig…' : naam ? `Aftekenen als ${naam}` : 'Aftekenen'}
            </button>
          </div>
          {msg && <p className="wb-msg">{msg}</p>}
        </>
      )}
    </section>
  )
}

export function AftekenenPanel({
  matchId,
  initialStatus,
  afgelopen = true,
  signatures,
  homeTeam,
  awayTeam,
  uitslag,
  defaultNames,
  nietNodig = [],
  voorwaarden = [],
}: {
  matchId: string
  initialStatus: string
  /** Pas na het eindsignaal (of een forfait) kan er afgetekend worden. */
  afgelopen?: boolean
  signatures?: Partial<Record<Who, SignatureData>>
  homeTeam?: string
  awayTeam?: string
  uitslag: string
  /** Vooraf gekende namen per ondertekenaar (kapiteins/SR uit de wedstrijd). */
  defaultNames?: Partial<Record<Who, string | undefined>>
  /** Wie niet hoeft te tekenen (afwezige ploeg bij forfait). */
  nietNodig?: Who[]
  /** Wat er vóór het indienen nog moet gebeuren (wie speelde, officials), met een link ernaartoe. */
  voorwaarden?: { tekst: string; href: string }[]
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const nodig = ORDER.filter((w) => !nietNodig.includes(w))
  const isSigned = (s?: SignatureData) => Boolean(s?.akkoord && s?.handtekening)
  const [getekend, setGetekend] = useState<Partial<Record<Who, SignatureData>>>(() =>
    Object.fromEntries(ORDER.filter((w) => isSigned(signatures?.[w])).map((w) => [w, signatures?.[w]])),
  )
  const wrapRefs = useRef<Partial<Record<Who, HTMLDivElement | null>>>({})
  const submitRef = useRef<HTMLDivElement>(null)
  const volgende = nodig.find((w) => !getekend[w]) ?? null
  const klaar = volgende == null

  const naGetekend = (w: Who, s: SignatureData) => {
    const nieuw = { ...getekend, [w]: s }
    setGetekend(nieuw)
    const next = nodig.find((x) => !nieuw[x])
    // Even wachten tot de zojuist vergrendelde kaart opnieuw gerenderd is.
    setTimeout(() => {
      if (next) {
        const el = wrapRefs.current[next]
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.querySelector('input')?.focus({ preventScroll: true })
      } else {
        submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 80)
  }

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/submit`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setStatus(json.status)
        // Mail en doorsturen hangen af van de instellingen (mailserver, federatie-koppeling): meld
        // enkel wat effectief gebeurde. Het blad zelf staat sowieso op het platform, ook als PDF.
        const extra = [json.mail?.sent ? 'gemaild naar beide clubs' : null, json.federation?.uploaded ? 'doorgestuurd naar de federatie' : null].filter(Boolean)
        router.refresh()
        setMsg({ ok: true, tekst: `Ingediend — het blad is definitief${extra.length ? ` en ${extra.join(' en ')}` : ''}. De PDF staat klaar.` })
      } else {
        setMsg({ ok: false, tekst: json.error || 'Indienen mislukt.' })
      }
    } catch {
      setMsg({ ok: false, tekst: 'Geen verbinding — probeer opnieuw.' })
    } finally {
      setBusy(false)
    }
  }

  const ingediend = status === 'ingediend'
  const stappen = [
    ...nodig.map((w) => ({ sleutel: w, label: LABEL[w], klaar: Boolean(getekend[w]) })),
    { sleutel: 'ingediend', label: 'Ingediend', klaar: ingediend },
  ]

  return (
    <>
      <ol className="aft-stappen" aria-label="Voortgang">
        {stappen.map((s, i) => (
          <li key={s.sleutel} className={s.klaar ? 'klaar' : s.sleutel === (ingediend ? '' : (volgende ?? 'ingediend')) ? 'nu' : ''}>
            <span className="aft-stap-bol" aria-hidden>{s.klaar ? '✓' : i + 1}</span>
            <span className="aft-stap-label">{s.label}</span>
          </li>
        ))}
      </ol>

      {ingediend ? (
        <section className="aft-klaar-kaart">
          <h2>✅ Ingediend</h2>
          <p>Dit wedstrijdblad is definitief en kan niet meer gewijzigd worden (Item 37). Beide clubs en de federatie hebben het.</p>
          <div className="aft-handtekeningen-vast">
            {nodig.map((w) => {
              const s = getekend[w] ?? signatures?.[w]
              return (
                <figure key={w}>
                  <div className="aft-vak aft-vak-vast">{s?.handtekening && <img src={s.handtekening} alt={`Handtekening ${LABEL[w]}`} />}</div>
                  <figcaption>
                    <span>{LABEL[w]}</span>
                    <strong>{s?.naam || '—'}</strong>
                    {s?.tijdstip && <small>{formatTijdstip(s.tijdstip)}</small>}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </section>
      ) : afgelopen ? (
        <>
          <div className="aft-kaarten">
            {nodig.map((w, i) => (
              <div key={w} ref={(el) => { wrapRefs.current[w] = el }}>
                <SignaturePad
                  matchId={matchId}
                  who={w}
                  nr={i + 1}
                  side={w === 'kapiteinThuis' ? 'home' : w === 'kapiteinUit' ? 'away' : null}
                  teamName={w === 'kapiteinThuis' ? homeTeam : w === 'kapiteinUit' ? awayTeam : undefined}
                  uitslag={uitslag}
                  initial={signatures?.[w]}
                  defaultNaam={defaultNames?.[w]}
                  aanDeBeurt={volgende === w}
                  onSigned={(s) => naGetekend(w, s)}
                />
              </div>
            ))}
          </div>
          <div ref={submitRef} className={`aft-indienen${klaar ? ' klaar' : ''}`}>
            <div>
              <h3>Indienen</h3>
              {voorwaarden.map((v) => (
                <p key={v.href + v.tekst} className="aft-voorwaarde">
                  ⚠️ {v.tekst} <a href={v.href}>Naar de scheidsrechterspagina →</a>
                </p>
              ))}
              <p>
                {klaar
                  ? 'Alle handtekeningen staan erop. De scheidsrechter dient in: het blad gaat als PDF naar beide clubs en naar de federatie, en is daarna definitief.'
                  : `Nog ${nodig.filter((w) => !getekend[w]).length} van de ${nodig.length} handtekeningen. Daarna dient de scheidsrechter in.`}
              </p>
            </div>
            <button type="button" onClick={submit} disabled={busy || !klaar || voorwaarden.length > 0} className="wb-btn wb-btn-primary">
              {busy ? 'Indienen…' : '📤 Wedstrijdblad indienen'}
            </button>
          </div>
        </>
      ) : null}
      {msg && <p className={`aft-melding ${msg.ok ? 'ok' : 'fout'}`} role="status">{msg.tekst}</p>}
    </>
  )
}
