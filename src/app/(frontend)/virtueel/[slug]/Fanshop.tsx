'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'
import { ARTIKELEN, KLEDIJ_SOORTEN, MUNTEN_PER_BAL, type Kast, type KledijSoort, type Outfit } from '@/lib/virtueel-fanshop'
import { bouwAvatar } from './avatar'

// De fanshop: je muntjes (elke gevonden gouden bal is er MUNTEN_PER_BAL waard), de rekken met
// kledij per soort, en een paskamer waar je figuur ronddraait met wat je aan het passen bent. Kopen
// en aantrekken gaan langs de sporen (aankoop/outfit); de server controleert je saldo en bezit.

const SOORT_NAAM: Record<KledijSoort, string> = { shirt: 'Shirts', broek: 'Broeken', pet: 'Hoofd', sjaal: 'Sjaals', schoenen: 'Schoenen', extra: "Extra's" }

function Paskamer({ thema, outfit }: { thema: StadionThema; outfit: Outfit }) {
  const doek = useRef<HTMLCanvasElement>(null)
  const aan = useRef<(o: Outfit) => void>(() => {})
  useEffect(() => {
    const c = doek.current
    if (!c) return
    const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
    camera.position.set(0, 1.15, 3.6)
    camera.lookAt(0, 0.95, 0)
    scene.add(new THREE.HemisphereLight('#ffffff', '#3b2a1e', 1.6))
    const spot = new THREE.DirectionalLight('#ffffff', 2.2)
    spot.position.set(1.5, 3, 2.5)
    scene.add(spot)
    const vloer = new THREE.Mesh(new THREE.CircleGeometry(0.7, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.6 }))
    scene.add(vloer)
    const fig = bouwAvatar(scene, thema, { laag: 0, zwaaien: false })
    fig.zichtbaar(true)
    aan.current = (o) => fig.kleedAan(o)
    let raf = 0
    const maat = () => {
      const r = c.getBoundingClientRect()
      renderer.setSize(r.width, r.height, false)
      camera.aspect = r.width / Math.max(1, r.height)
      camera.updateProjectionMatrix()
    }
    maat()
    const ro = new ResizeObserver(maat)
    ro.observe(c)
    const tik = (nu: number) => {
      fig.update(0, 0, 0, nu / 1600, 0, 0, nu / 1000)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tik)
    }
    raf = requestAnimationFrame(tik)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      fig.dispose()
      renderer.dispose()
    }
  }, [thema])
  useEffect(() => aan.current(outfit), [outfit])
  return <canvas ref={doek} className="vk-shop-pas" aria-label="Paskamer: je figuur met de gekozen kledij" />
}

export function Fanshop({
  open,
  onSluit,
  thema,
  kast,
  ingelogd,
  ballen,
  onKoop,
  onDraag,
}: {
  open: boolean
  onSluit: () => void
  thema: StadionThema
  kast: Kast
  ingelogd: boolean
  ballen: number
  onKoop: (id: string) => Promise<boolean>
  onDraag: (o: Outfit) => Promise<boolean>
}) {
  const [soort, setSoort] = useState<KledijSoort>('shirt')
  const [pas, setPas] = useState<Outfit>(kast.outfit)
  const [bezig, setBezig] = useState<string | null>(null)
  useEffect(() => {
    if (open) setPas(kast.outfit)
  }, [open, kast.outfit])
  if (!open) return null
  const gewijzigd = KLEDIJ_SOORTEN.some((s) => pas[s] !== kast.outfit[s])
  const alles = KLEDIJ_SOORTEN.every((s) => kast.gekocht.includes(pas[s]))
  return (
    <div className="vk-spel vk-shop" role="dialog" aria-label="Fanshop">
      <div className="vk-graf-kop">
        <div>
          <b>🛍️ Fanshop</b>
          <span>Elke gouden bal die je vindt = {MUNTEN_PER_BAL} muntjes</span>
        </div>
        <span className="vk-shop-saldo" title={`${ballen} gouden ballen gevonden`}>
          🪙 {kast.munten}
        </span>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="vk-shop-inhoud">
        <div className="vk-shop-links">
          <Paskamer thema={thema} outfit={pas} />
          {ingelogd ? (
            <button
              className="vk-graf-plaats vk-shop-draag"
              disabled={!gewijzigd || !alles || bezig != null}
              onClick={async () => {
                setBezig('draag')
                await onDraag(pas)
                setBezig(null)
              }}
            >
              {!gewijzigd ? '✓ Dit draag je' : !alles ? 'Koop eerst wat je past' : bezig === 'draag' ? 'Aantrekken…' : '👕 Trek dit aan'}
            </button>
          ) : (
            <Link className="vk-graf-plaats vk-shop-draag" href="/inloggen">
              Log in om te shoppen
            </Link>
          )}
        </div>
        <div className="vk-shop-rechts">
          <div className="vk-shop-tabs" role="tablist">
            {KLEDIJ_SOORTEN.map((s) => (
              <button key={s} role="tab" aria-selected={soort === s} className={soort === s ? 'aan' : ''} onClick={() => setSoort(s)}>
                {SOORT_NAAM[s]}
              </button>
            ))}
          </div>
          <ul className="vk-shop-rek">
            {ARTIKELEN.filter((a) => a.soort === soort).map((a) => {
              const heb = kast.gekocht.includes(a.id)
              const draag = kast.outfit[a.soort] === a.id
              const past = pas[a.soort] === a.id
              return (
                <li key={a.id} className={`${past ? 'past' : ''}${draag ? ' draag' : ''}`}>
                  <button className="vk-shop-item" onClick={() => setPas((p) => ({ ...p, [a.soort]: a.id }))}>
                    <i>{a.icoon}</i>
                    <b>{a.naam}</b>
                    <small>{draag ? '✓ je draagt dit' : heb ? 'in je kast' : `🪙 ${a.prijs}`}</small>
                  </button>
                  {!heb && ingelogd && (
                    <button
                      className="vk-shop-koop"
                      disabled={a.prijs > kast.munten || bezig != null}
                      onClick={async () => {
                        setBezig(a.id)
                        const ok = await onKoop(a.id)
                        setBezig(null)
                        if (ok) setPas((p) => ({ ...p, [a.soort]: a.id }))
                      }}
                    >
                      {bezig === a.id ? '…' : a.prijs > kast.munten ? `nog ${a.prijs - kast.munten} 🪙` : 'Koop'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="vk-graf-tip">Tik een stuk aan om het te passen. Te weinig muntjes? Er liggen gouden krachtballen verstopt in heel het stadion.</p>
        </div>
      </div>
    </div>
  )
}
