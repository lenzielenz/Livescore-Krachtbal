'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MERKEN, PAGINA, QR } from '@/lib/medische-kaart-layout'

// Het medisch attest bezorgen — met of zonder login (de algemene link /attest, de QR-link /k/<code>, Mijn
// profiel). Twee manieren:
//   1. de camera met een kader in de vorm van het attest: de vier hoekjes vallen op de zwarte hoekmerken. De
//      camera zoekt intussen de QR-code; staat die goed in beeld, dan kleurt het kader groen en neemt het
//      toestel zelf de foto (of druk op de knop);
//   2. een bestand opladen: een scan, een foto, iets wat via WhatsApp doorgestuurd werd.
// Het systeem leest daarna de QR en de vakjes (lib/medische-kaart-scan.ts) en zegt meteen hoe het zit:
// goedgekeurd, ontvangen (de federatie kijkt het na), of niet gelukt — met wat je kan doen.

type Uitkomst =
  | { ok: true; status: 'goedgekeurd' | 'nakijken' | 'afgekeurd'; naam: string; reden: string | null; seizoen: string | null; meldingen: string[] }
  | { ok: false; fout: string }
  | { ok: false; nodig: 'gegevens'; blanco: boolean }

type Fase = 'kiezen' | 'camera' | 'bezig' | 'gegevens' | 'klaar'

/** Het kader: blad-mm → procent van het A4-kader (de overlay schaalt mee met het scherm). */
const pct = (mm: number, van: number) => `${(mm / van) * 100}%`

export function AttestBezorgen({ code, naam }: { code?: string; naam?: string }) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('kiezen')
  const [bestand, setBestand] = useState<File | null>(null)
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null)
  const [uitkomst, setUitkomst] = useState<Uitkomst | null>(null)
  const [blanco, setBlanco] = useState(false)
  const [gegevens, setGegevens] = useState({ naam: '', geboortedatum: '', club: '', email: '' })
  const kiezer = useRef<HTMLInputElement>(null)

  useEffect(() => () => void (voorbeeld && URL.revokeObjectURL(voorbeeld)), [voorbeeld])

  const versturen = useCallback(
    async (f: File, extra?: typeof gegevens) => {
      setFase('bezig')
      setBestand(f)
      setVoorbeeld((oud) => {
        if (oud) URL.revokeObjectURL(oud)
        return f.type.startsWith('image/') ? URL.createObjectURL(f) : null
      })
      const fd = new FormData()
      fd.set('bestand', f)
      if (code) fd.set('code', code)
      if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v)
      let u: Uitkomst
      try {
        const res = await fetch('/api/attest', { method: 'POST', body: fd, credentials: 'include' })
        u = (await res.json().catch(() => ({ ok: false, fout: 'Het antwoord van de server was onleesbaar. Probeer opnieuw.' }))) as Uitkomst
      } catch {
        u = { ok: false, fout: 'Geen verbinding. Kijk of je internet hebt en probeer opnieuw.' }
      }
      if (!u.ok && 'nodig' in u) {
        setBlanco(u.blanco)
        setFase('gegevens')
        return
      }
      setUitkomst(u)
      setFase('klaar')
      if (u.ok) router.refresh()
    },
    [code, router],
  )

  const opnieuw = () => {
    setUitkomst(null)
    setBestand(null)
    setFase('kiezen')
  }

  return (
    <div className="ab">
      {fase === 'kiezen' && (
        <div className="ab-keuze">
          <button type="button" className="ab-tegel ab-tegel-hoofd" onClick={() => setFase('camera')}>
            <span className="ab-icoon" aria-hidden>
              📷
            </span>
            <strong>Foto nemen met kader</strong>
            <span>De camera opent met een kader in de vorm van het attest. Het toestel neemt de foto zodra alles goed staat.</span>
          </button>
          <button type="button" className="ab-tegel" onClick={() => kiezer.current?.click()}>
            <span className="ab-icoon" aria-hidden>
              📁
            </span>
            <strong>Bestand opladen</strong>
            <span>Een scan, een foto of een beeld dat je via WhatsApp kreeg (PDF, JPG, PNG).</span>
          </button>
          <input
            ref={kiezer}
            type="file"
            hidden
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void versturen(f)
            }}
          />
        </div>
      )}

      {fase === 'camera' && (
        <Camera
          code={code}
          naam={naam}
          onFoto={(f) => void versturen(f)}
          onStop={() => setFase('kiezen')}
          onBestand={() => {
            setFase('kiezen')
            setTimeout(() => kiezer.current?.click(), 50)
          }}
        />
      )}

      {fase === 'bezig' && (
        <div className="ab-bezig" role="status">
          {/* eslint-disable-next-line @next/next/no-img-element -- een lokale blob-URL, niets te optimaliseren */}
          {voorbeeld && <img src={voorbeeld} alt="" className="ab-voorbeeld" />}
          <div className="ab-spinner" aria-hidden />
          <p>
            <strong>Het attest wordt gelezen…</strong>
            <br />
            QR-code zoeken, het blad rechtzetten, de vakjes van de arts lezen.
          </p>
        </div>
      )}

      {fase === 'gegevens' && bestand && (
        <form
          className="ab-gegevens"
          onSubmit={(e) => {
            e.preventDefault()
            void versturen(bestand, gegevens)
          }}
        >
          <div className="ab-kop ab-kop-info">
            <span aria-hidden>📝</span>
            <div>
              <strong>{blanco ? 'Dit is een blanco attest' : 'We vonden geen QR-code van een lid'}</strong>
              <p>Van wie is dit attest? De federatie zoekt het lid op en kijkt het attest na.</p>
            </div>
          </div>
          <label>
            Naam en voornaam van het lid *
            <input required minLength={3} value={gegevens.naam} onChange={(e) => setGegevens({ ...gegevens, naam: e.target.value })} autoComplete="off" />
          </label>
          <label>
            Geboortedatum *
            <input required type="date" value={gegevens.geboortedatum} onChange={(e) => setGegevens({ ...gegevens, geboortedatum: e.target.value })} />
          </label>
          <label>
            Club
            <input value={gegevens.club} onChange={(e) => setGegevens({ ...gegevens, club: e.target.value })} autoComplete="off" />
          </label>
          <label>
            Je e-mailadres <small>(optioneel: dan hoor je of het attest goedgekeurd is)</small>
            <input type="email" value={gegevens.email} onChange={(e) => setGegevens({ ...gegevens, email: e.target.value })} autoComplete="email" />
          </label>
          <div className="ab-knoppen">
            <button type="submit" className="wb-btn wb-btn-primary">
              Attest versturen
            </button>
            <button type="button" className="wb-btn" onClick={opnieuw}>
              Andere foto
            </button>
          </div>
        </form>
      )}

      {fase === 'klaar' && uitkomst && <Resultaat u={uitkomst} voorbeeld={voorbeeld} onOpnieuw={opnieuw} />}
    </div>
  )
}

function Resultaat({ u, voorbeeld, onOpnieuw }: { u: Uitkomst; voorbeeld: string | null; onOpnieuw: () => void }) {
  if (u.ok && u.status === 'goedgekeurd') {
    return (
      <div className="ab-uitkomst ab-goed" role="status">
        <div className="ab-groot" aria-hidden>
          ✓
        </div>
        <h3>Goedgekeurd</h3>
        <p>
          Het medisch attest van <strong>{u.naam}</strong> is in orde{u.seizoen ? ` voor het seizoen ${u.seizoen}` : ''}. Alles stond juist: de QR-code, de
          hoeken en het vakje &quot;geschikt&quot;.
        </p>
        {u.meldingen.map((m) => (
          <p key={m} className="ab-let">
            {m}
          </p>
        ))}
        <p className="ab-klein">De club en het lid (of de ouders) zien het meteen. Bewaar het papieren attest.</p>
        <button type="button" className="wb-btn" onClick={onOpnieuw}>
          Nog een attest bezorgen
        </button>
      </div>
    )
  }
  if (u.ok) {
    return (
      <div className="ab-uitkomst ab-wacht" role="status">
        <div className="ab-groot" aria-hidden>
          ✉
        </div>
        <h3>Goed ontvangen</h3>
        <p>
          Het attest {u.naam ? (
            <>
              van <strong>{u.naam}</strong>{' '}
            </>
          ) : null}
          is bij de federatie. Het kon niet vanzelf goedgekeurd worden, dus een mens kijkt het na.
        </p>
        {u.reden && <p className="ab-reden">{u.reden}</p>}
        {u.meldingen.map((m) => (
          <p key={m} className="ab-let">
            {m}
          </p>
        ))}
        <p className="ab-klein">Je hoeft niets meer te doen. Wie een login heeft, ziet de beslissing op &quot;Mijn profiel&quot;.</p>
        <button type="button" className="wb-btn" onClick={onOpnieuw}>
          Nog een attest bezorgen
        </button>
      </div>
    )
  }
  return (
    <div className="ab-uitkomst ab-fout" role="alert">
      <div className="ab-groot" aria-hidden>
        ✕
      </div>
      <h3>Niet gelukt</h3>
      <p>{'fout' in u ? u.fout : 'Er liep iets mis.'}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- een lokale blob-URL */}
      {voorbeeld && <img src={voorbeeld} alt="Je foto" className="ab-voorbeeld ab-voorbeeld-klein" />}
      <ul className="ab-tips">
        <li>Het héle blad in beeld: de vier zwarte hoeken en de QR-code.</li>
        <li>Leg het blad plat, op een donkere ondergrond, en houd de gsm er recht boven.</li>
        <li>Genoeg licht, geen felle schittering op de QR-code.</li>
        <li>Lukt het niet met de camera? Een scan (PDF) leest het best.</li>
      </ul>
      <button type="button" className="wb-btn wb-btn-primary" onClick={onOpnieuw}>
        Opnieuw proberen
      </button>
    </div>
  )
}

// ── De camera met kader ─────────────────────────────────────────────────────────────────────────────

type Zicht = { toon: 'zoek' | 'goed' | 'fout'; tekst: string }

/** Verwachte QR-breedte in het kader (fractie van de kaderbreedte). */
const QR_FRACTIE = QR.b / PAGINA.b

function Camera({ code, naam, onFoto, onStop, onBestand }: { code?: string; naam?: string; onFoto: (f: File) => void; onStop: () => void; onBestand: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const kader = useRef<HTMLDivElement>(null)
  const stroom = useRef<MediaStream | null>(null)
  const [zicht, setZicht] = useState<Zicht>({ toon: 'zoek', tekst: 'Leg het attest plat en vul het kader. Zoek de QR-code…' })
  const [fout, setFout] = useState<string | null>(null)
  const [lamp, setLamp] = useState<boolean | null>(null)
  const [aftellen, setAftellen] = useState<number | null>(null)
  const goedReeks = useRef(0)
  const genomen = useRef(false)

  const stop = useCallback(() => {
    stroom.current?.getTracks().forEach((t) => t.stop())
    stroom.current = null
  }, [])

  const neem = useCallback(() => {
    const v = video.current
    if (!v || !v.videoWidth || genomen.current) return
    genomen.current = true
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob(
      (blob) => {
        stop()
        if (blob) onFoto(new File([blob], `attest-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }, [onFoto, stop])

  // Camera starten (achtercamera, zo scherp als het toestel toelaat).
  useEffect(() => {
    let weg = false
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFout('Deze browser geeft geen toegang tot de camera. Kies "Bestand opladen" en neem daar een foto.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        })
        if (weg) return s.getTracks().forEach((t) => t.stop())
        stroom.current = s
        if (video.current) {
          video.current.srcObject = s
          await video.current.play().catch(() => null)
        }
        const spoor = s.getVideoTracks()[0]
        const kan = (spoor?.getCapabilities?.() ?? {}) as { torch?: boolean }
        if (kan.torch) setLamp(false)
      } catch (e) {
        const n = (e as { name?: string }).name
        setFout(
          n === 'NotAllowedError'
            ? 'Je gaf geen toegang tot de camera. Sta het toe in je browser, of kies "Bestand opladen".'
            : 'De camera kon niet starten. Kies "Bestand opladen" en neem daar een foto.',
        )
      }
    })()
    return () => {
      weg = true
      stop()
    }
  }, [stop])

  // Elke ~0,35 s: staat de QR-code goed in beeld? Drie keer na elkaar goed → aftellen → foto.
  useEffect(() => {
    let jsQR: typeof import('jsqr').default | null = null
    let actief = true
    const doek = document.createElement('canvas')
    const tik = async () => {
      if (!actief) return
      const v = video.current
      if (v && v.videoWidth && !genomen.current) {
        jsQR ??= (await import('jsqr')).default
        const b = 960
        const h = Math.round((v.videoHeight / v.videoWidth) * b)
        doek.width = b
        doek.height = h
        const ctx = doek.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(v, 0, 0, b, h)
        const beeld = ctx.getImageData(0, 0, b, h)
        const qr = jsQR(beeld.data, b, h, { inversionAttempts: 'dontInvert' })
        setZicht(beoordeelZicht(qr, b, h, v, kader.current, code, naam))
      }
      setTimeout(tik, 350)
    }
    void tik()
    return () => {
      actief = false
    }
  }, [code, naam])

  useEffect(() => {
    if (zicht.toon === 'goed') goedReeks.current += 1
    else {
      goedReeks.current = 0
      setAftellen(null)
    }
    if (goedReeks.current === 3) setAftellen(2)
  }, [zicht])

  useEffect(() => {
    if (aftellen == null) return
    if (aftellen === 0) return neem()
    const t = setTimeout(() => setAftellen((a) => (a == null ? null : a - 1)), 500)
    return () => clearTimeout(t)
  }, [aftellen, neem])

  const wisselLamp = async () => {
    const spoor = stroom.current?.getVideoTracks()[0]
    if (!spoor || lamp == null) return
    try {
      await spoor.applyConstraints({ advanced: [{ torch: !lamp } as MediaTrackConstraintSet] })
      setLamp(!lamp)
    } catch {
      setLamp(null)
    }
  }

  return (
    <div className="ab-camera" role="dialog" aria-label="Foto van het attest nemen">
      <video ref={video} playsInline muted className="ab-video" />
      <div className="ab-masker">
        <div ref={kader} className={`ab-kader ab-kader-${zicht.toon}`}>
          {MERKEN.map((m, i) => (
            <span
              key={i}
              className="ab-merk"
              style={{ left: pct(m.x, PAGINA.b), top: pct(m.y, PAGINA.h), width: pct(m.b, PAGINA.b), height: pct(m.h, PAGINA.h) }}
            />
          ))}
          <span className="ab-qrvak" style={{ left: pct(QR.x, PAGINA.b), top: pct(QR.y, PAGINA.h), width: pct(QR.b, PAGINA.b), height: pct(QR.h, PAGINA.h) }}>
            QR
          </span>
          {aftellen != null && <span className="ab-aftel">{aftellen || '📸'}</span>}
        </div>
      </div>
      <div className={`ab-camtekst ab-camtekst-${fout ? 'fout' : zicht.toon}`} role="status">
        {fout ?? (aftellen != null ? 'Houd stil… de foto wordt genomen.' : zicht.tekst)}
      </div>
      <div className="ab-cambalk">
        <button type="button" className="ab-cam-knop" onClick={() => (stop(), onStop())}>
          Annuleren
        </button>
        <button type="button" className="ab-sluiter" aria-label="Foto nemen" onClick={neem} disabled={!!fout} />
        {lamp != null ? (
          <button type="button" className="ab-cam-knop" onClick={wisselLamp} aria-pressed={lamp}>
            💡 {lamp ? 'Lamp uit' : 'Lamp'}
          </button>
        ) : (
          <button type="button" className="ab-cam-knop" onClick={() => (stop(), onBestand())}>
            📁 Bestand
          </button>
        )}
      </div>
    </div>
  )
}

/** Wat de camera ziet, in mensentaal: QR gevonden? van dit lid? groot genoeg en ongeveer op zijn plaats? */
function beoordeelZicht(
  qr: { data: string; location: { topLeftCorner: { x: number; y: number }; topRightCorner: { x: number; y: number }; bottomLeftCorner: { x: number; y: number } } } | null,
  b: number,
  h: number,
  v: HTMLVideoElement,
  kader: HTMLDivElement | null,
  code: string | undefined,
  naam: string | undefined,
): Zicht {
  if (!qr) return { toon: 'zoek', tekst: 'Leg het attest plat en vul het kader. Zoek de QR-code…' }
  const persoonlijk = /\/k\/(K[0-9A-Z]+-[0-9A-Z]{8})/i.exec(qr.data)?.[1]?.toUpperCase() ?? null
  const blanco = !persoonlijk && /\/attest(?:[/?#]|$)/i.test(qr.data)
  if (!persoonlijk && !blanco) return { toon: 'fout', tekst: 'Dit is geen QR-code van een medisch attest.' }
  if (code && persoonlijk && persoonlijk !== code.toUpperCase()) return { toon: 'fout', tekst: 'Dit is het attest van een ander lid. Gebruik de QR-code op dit attest zelf.' }

  // Hoe groot staat de QR in beeld, tegenover wat het kader verwacht? (De video vult het scherm met
  // object-fit: cover; het kader is een stuk van dat scherm.)
  const qrB = Math.hypot(qr.location.topRightCorner.x - qr.location.topLeftCorner.x, qr.location.topRightCorner.y - qr.location.topLeftCorner.y) / b
  if (kader && v.clientWidth && v.videoWidth) {
    const schaal = Math.max(v.clientWidth / v.videoWidth, v.clientHeight / v.videoHeight)
    const zichtbaarB = (v.clientWidth / schaal / v.videoWidth) // fractie van de videobreedte die op het scherm staat
    const kaderFractie = kader.clientWidth / v.clientWidth // fractie van de schermbreedte
    // QR (zonder stille rand ~ 85 %) als fractie van de videobreedte, zoals het kader het verwacht.
    const verwacht = QR_FRACTIE * 0.85 * kaderFractie * zichtbaarB
    if (qrB < verwacht * 0.65) return { toon: 'zoek', tekst: 'QR-code gevonden. Kom wat dichter: het blad moet het kader vullen.' }
    if (qrB > verwacht * 1.5) return { toon: 'zoek', tekst: 'Iets verder: het héle blad moet in het kader, met de vier zwarte hoeken.' }
  }
  // Ligt de QR rechtsboven in beeld (zoals op het blad)? Anders ligt het blad gedraaid of half buiten beeld.
  const cx = (qr.location.topLeftCorner.x + qr.location.topRightCorner.x) / 2 / b
  const cy = (qr.location.topLeftCorner.y + qr.location.bottomLeftCorner.y) / 2 / h
  if (cx < 0.45 || cy > 0.55) return { toon: 'zoek', tekst: 'Draai het blad: de QR-code hoort rechtsboven in het kader.' }
  return { toon: 'goed', tekst: blanco ? '✓ Blanco attest herkend — houd stil.' : `✓ QR-code van ${naam ?? 'het lid'} gelezen — houd stil.` }
}
