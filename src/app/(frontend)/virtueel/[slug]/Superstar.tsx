'use client'

import { useEffect, useRef, useState } from 'react'

import { BALLEN, BESTE_HOEK, meterTempo, type BalId, type SuperstarStand } from '@/lib/virtueel-superstar'

// Superstar op je scherm (onderaan, zodat je de bal in de hal ziet vliegen):
//  1. kies een bal aan de tafel (hoe zwaarder, hoe lastiger);
//  2. houd de knop ingedrukt: je zwaait aan en de krachtmeter gaat op en neer; laat los op de top;
//  3. tik om je werphoek vast te zetten (de naald zwaait heen en weer, het groene stuk is ideaal);
//  4. de bal vliegt, en de afstand komt (als je ingelogd bent) in het klassement van heel het platform.

type Fase = 'kies' | 'kracht' | 'hoek' | 'vliegt' | 'uitslag'
const fmt = (m: number) => `${m.toFixed(2).replace('.', ',')} m`

export function Superstar({
  open,
  onSluit,
  stand,
  ingelogd,
  onNeem,
  onWerp,
}: {
  open: boolean
  onSluit: () => void
  stand: SuperstarStand | null
  ingelogd: boolean
  onNeem: (bal: BalId | null) => void
  onWerp: (bal: BalId, kracht: number, hoek: number) => Promise<{ afstand: number; bewaard: boolean }>
}) {
  const [fase, setFase] = useState<Fase>('kies')
  const [bal, setBal] = useState<BalId | null>(null)
  const [meter, setMeter] = useState(0)
  const [hoek, setHoek] = useState(40)
  const [kracht, setKracht] = useState(0)
  const [uitslag, setUitslag] = useState<{ afstand: number; bewaard: boolean; record: boolean } | null>(null)
  const [klassement, setKlassement] = useState(false)
  const t0 = useRef(0)
  const houd = useRef(false)

  useEffect(() => {
    if (!open) {
      setFase('kies')
      setBal(null)
      setUitslag(null)
      onNeem(null)
    }
  }, [open])

  // De krachtmeter (zolang je vasthoudt) en de zwaaiende hoeknaald.
  useEffect(() => {
    if (fase !== 'kracht' && fase !== 'hoek') return
    let raf = 0
    const tik = () => {
      const t = (performance.now() - t0.current) / 1000
      if (fase === 'kracht' && houd.current && bal) {
        // Op en neer: 0 → 1 (de top) → 0; hoe zwaarder de bal, hoe sneller.
        const p = meterTempo(bal)
        setMeter(1 - Math.abs(((t / (p / 2)) % 2) - 1))
      }
      if (fase === 'hoek') setHoek(40 + Math.sin(t * 3.4) * 26)
      raf = requestAnimationFrame(tik)
    }
    raf = requestAnimationFrame(tik)
    return () => cancelAnimationFrame(raf)
  }, [fase, bal])

  if (!open) return null
  const kies = (b: BalId) => {
    setBal(b)
    onNeem(b)
    setMeter(0)
    setFase('kracht')
  }
  const begin = () => {
    if (fase !== 'kracht') return
    houd.current = true
    t0.current = performance.now()
  }
  const los = () => {
    if (fase !== 'kracht' || !houd.current) return
    houd.current = false
    setKracht(meter)
    t0.current = performance.now()
    setFase('hoek')
  }
  const zetHoek = async () => {
    // (De klik die op het loslaten volgt, telt niet: de LOS-knop verschijnt op dezelfde plek.)
    if (fase !== 'hoek' || !bal || performance.now() - t0.current < 350) return
    const h = Math.round(hoek * 10) / 10
    setFase('vliegt')
    const vorig = stand?.mijn[bal] ?? 0
    const r = await onWerp(bal, kracht, h)
    setUitslag({ ...r, record: r.bewaard && r.afstand > vorig })
    setFase('uitslag')
  }
  const b = bal ? BALLEN.find((x) => x.id === bal)! : null
  return (
    <div className="vk-ster" role="dialog" aria-label="Superstar: afstandwerpen">
      <div className="vk-ster-kop">
        <b>★ Superstar</b>
        <span>{b ? `${b.label} · record ${b.record} m` : 'Kies je bal aan de tafel'}</span>
        <button className="vk-ster-knopje" onClick={() => setKlassement((k) => !k)}>
          🏆
        </button>
        <button className="vk-ster-knopje" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      {klassement ? (
        <div className="vk-ster-klassement">
          {BALLEN.map((x) => (
            <div key={x.id}>
              <h4>
                <i style={{ background: x.kleur }} /> {x.label}
              </h4>
              <ol>
                {(stand?.per[x.id] ?? []).slice(0, 5).map((r, i) => (
                  <li key={i}>
                    <span>{r.naam}</span>
                    <b>{fmt(r.afstand)}</b>
                  </li>
                ))}
                {!(stand?.per[x.id] ?? []).length && <li className="leeg">nog niemand</li>}
              </ol>
              {stand?.mijn[x.id] != null && <small>jij: {fmt(stand.mijn[x.id]!)}</small>}
            </div>
          ))}
        </div>
      ) : fase === 'kies' ? (
        <div className="vk-ster-ballen">
          {BALLEN.map((x) => (
            <button key={x.id} onClick={() => kies(x.id)} style={{ ['--bal' as string]: x.kleur }}>
              <i />
              <b>{x.label}</b>
              <small>record {x.record} m</small>
              {stand?.mijn[x.id] != null && <small className="mijn">jij {fmt(stand.mijn[x.id]!)}</small>}
            </button>
          ))}
        </div>
      ) : fase === 'kracht' ? (
        <div className="vk-ster-actie">
          <div className="vk-ster-meter" aria-label="Krachtmeter">
            <div className="top" />
            <div className="vul" style={{ height: `${meter * 100}%`, background: meter > 0.92 ? '#facc15' : meter > 0.7 ? '#4ade80' : '#60a5fa' }} />
          </div>
          <button
            className="vk-ster-houd"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              begin()
            }}
            onPointerUp={los}
            onPointerCancel={los}
            onContextMenu={(e) => e.preventDefault()}
          >
            <b>Houd vast</b>
            <span>en laat los op de top</span>
          </button>
          <button className="vk-ster-terug" onClick={() => { onNeem(null); setFase('kies') }}>
            andere bal
          </button>
        </div>
      ) : fase === 'hoek' ? (
        <div className="vk-ster-actie">
          <svg className="vk-ster-boog" viewBox="-10 -100 120 110" aria-label="Werphoek">
            <path d="M 0 0 A 100 100 0 0 1 100 -100" className="boog" />
            {/* Het groene stuk: rond de ideale hoek. */}
            <path
              d={`M ${Math.cos(((BESTE_HOEK - 5) * Math.PI) / 180) * 100} ${-Math.sin(((BESTE_HOEK - 5) * Math.PI) / 180) * 100} A 100 100 0 0 0 ${Math.cos(((BESTE_HOEK + 5) * Math.PI) / 180) * 100} ${-Math.sin(((BESTE_HOEK + 5) * Math.PI) / 180) * 100}`}
              className="goed"
            />
            <line x1={0} y1={0} x2={Math.cos((hoek * Math.PI) / 180) * 96} y2={-Math.sin((hoek * Math.PI) / 180) * 96} className="naald" />
            <circle r={5} className="as" />
          </svg>
          <button className="vk-ster-houd los" onClick={() => void zetHoek()}>
            <b>LOS!</b>
            <span>{Math.round(hoek)}°</span>
          </button>
        </div>
      ) : fase === 'vliegt' ? (
        <p className="vk-ster-vliegt">💨 Hij vliegt…</p>
      ) : (
        uitslag && (
          <div className="vk-ster-uitslag">
            <b className={uitslag.afstand >= (b?.record ?? 99) - 0.5 ? 'top' : ''}>{fmt(uitslag.afstand)}</b>
            <span>
              {uitslag.afstand >= (b?.record ?? 99) - 0.05
                ? '🤯 Op het record!'
                : uitslag.record
                  ? '🎉 Persoonlijk record!'
                  : `kracht ${Math.round(kracht * 100)}% · hoek ${Math.round(hoek)}°`}
            </span>
            {!uitslag.bewaard && <small>{ingelogd ? 'Niet bewaard, probeer zo opnieuw.' : 'Log in om in het klassement te komen.'}</small>}
            <div>
              <button className="vk-graf-plaats" onClick={() => bal && kies(bal)}>
                Nog eens
              </button>
              <button className="vk-ster-terug" onClick={() => { onNeem(null); setFase('kies') }}>
                andere bal
              </button>
            </div>
          </div>
        )
      )}
    </div>
  )
}
