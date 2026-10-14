import * as THREE from 'three'

import type { FotoKader, Rechthoek, StadionThema } from '@/lib/virtueel'
import { toeval } from '@/lib/virtueel-fotos'
import { bouwBordlicht, type BordPlek } from './bordlicht'
import { canvasTex, laadBeeld } from './stadion'

// De fotogalerij: supportersfoto's van live wedstrijden van je club, als collages op de
// achterwanden van de tribunes aan de kopse kanten (oost en west), recht tegenover de hall of fame
// aan de gevel. Per kader 1 tot 4 polaroids, schuin en met plakband, door elkaar; met een
// onderschrift (wedstrijd, datum, fotografen) en een eigen lamp. De foto's laden pas wanneer ze
// binnen zijn, het kader wordt dan opnieuw getekend.

const KADER = { b: 3.2, h: 2.4, y: 2.2, px: 1024, py: 768 }
const PER_WAND = 4
const STAP = 4.4

/** Een foto "cover" in een rechthoek (bijsnijden, niet vervormen). */
function tekenCover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

/** Een polaroid: wit kader, de foto (of een plaatshouder), plakband en de naam van de fotograaf. */
function polaroid(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, hoek: number, img: HTMLImageElement | null, auteur: string): void {
  const rand = w * 0.05
  const onder = h * 0.12
  g.save()
  g.translate(cx, cy)
  g.rotate(hoek)
  g.shadowColor = 'rgba(0,0,0,.55)'
  g.shadowBlur = 18
  g.shadowOffsetY = 6
  g.fillStyle = '#fbfaf6'
  g.fillRect(-w / 2, -h / 2, w, h)
  g.shadowColor = 'transparent'
  const fx = -w / 2 + rand
  const fy = -h / 2 + rand
  const fw = w - 2 * rand
  const fh = h - rand - onder
  if (img) tekenCover(g, img, fx, fy, fw, fh)
  else {
    g.fillStyle = '#cbd5e1'
    g.fillRect(fx, fy, fw, fh)
    g.fillStyle = '#64748b'
    g.font = `${Math.round(fh * 0.3)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('📷', 0, fy + fh / 2)
  }
  g.fillStyle = '#334155'
  g.font = `italic 600 ${Math.round(onder * 0.42)}px Inter, system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(`📸 ${auteur}`, 0, h / 2 - onder / 2, w - 2 * rand)
  // Plakband over de bovenhoek.
  g.fillStyle = 'rgba(245,232,190,.78)'
  g.save()
  g.translate(0, -h / 2)
  g.rotate(-0.06)
  g.fillRect(-w * 0.14, -h * 0.035, w * 0.28, h * 0.07)
  g.restore()
  g.restore()
}

/** Waar de polaroids van een kader liggen (midden, maat, kanteling), per aantal foto's. */
function schikking(n: number, r: () => number): { x: number; y: number; w: number; h: number; hoek: number }[] {
  const k = () => (r() - 0.5) * 0.14
  const { px: W } = KADER
  const H = 640 // ruimte boven het onderschrift
  if (n === 1) return [{ x: W / 2, y: H / 2 + 20, w: 520, h: 560, hoek: k() }]
  if (n === 2)
    return [
      { x: W * 0.3, y: H / 2 + 24, w: 400, h: 450, hoek: -0.06 + k() },
      { x: W * 0.7, y: H / 2 + 14, w: 400, h: 450, hoek: 0.05 + k() },
    ]
  if (n === 3)
    return [
      { x: W * 0.33, y: H / 2 + 22, w: 470, h: 520, hoek: -0.04 + k() },
      { x: W * 0.74, y: H * 0.3 + 6, w: 320, h: 290, hoek: 0.07 + k() },
      { x: W * 0.72, y: H * 0.74 + 8, w: 320, h: 290, hoek: -0.05 + k() },
    ]
  return [
    { x: W * 0.27, y: H * 0.3 + 10, w: 380, h: 300, hoek: -0.05 + k() },
    { x: W * 0.72, y: H * 0.29 + 12, w: 380, h: 300, hoek: 0.06 + k() },
    { x: W * 0.3, y: H * 0.75 + 4, w: 380, h: 300, hoek: 0.04 + k() },
    { x: W * 0.71, y: H * 0.74 + 8, w: 380, h: 300, hoek: -0.06 + k() },
  ]
}

function tekenKader(g: CanvasRenderingContext2D, k: FotoKader, beelden: (HTMLImageElement | null)[], thema: StadionThema): void {
  const { px: W, py: H } = KADER
  // Passe-partout: donker antraciet met een fijne korrel, een dunne lijn in clubkleur.
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#1f2533')
  bg.addColorStop(1, '#111520')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  const r = toeval(k.zaad)
  g.fillStyle = 'rgba(255,255,255,.025)'
  for (let i = 0; i < 1400; i++) g.fillRect(r() * W, r() * H, 2, 2)
  g.strokeStyle = thema.primair
  g.lineWidth = 6
  g.strokeRect(22, 22, W - 44, H - 44)

  const plekken = schikking(k.fotos.length, r)
  k.fotos.forEach((f, i) => {
    const p = plekken[i]
    if (p) polaroid(g, p.x, p.y, p.w, p.h, p.hoek, beelden[i], f.auteur.split(/\s+/)[0])
  })

  // Onderschrift: een strook onderaan.
  g.fillStyle = 'rgba(8,11,18,.88)'
  g.fillRect(22, H - 118, W - 44, 96)
  g.fillStyle = thema.primair
  g.fillRect(22, H - 118, 10, 96)
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillStyle = '#ffffff'
  g.font = '800 36px Inter, system-ui, sans-serif'
  g.fillText(k.titel, 56, H - 88, W - 120)
  g.fillStyle = 'rgba(226,232,240,.8)'
  g.font = '600 26px Inter, system-ui, sans-serif'
  g.fillText(`LIVE VANUIT DE TRIBUNE · ${k.sub}`, 56, H - 48, W - 120)
}

export function bouwFotogalerij(
  scene: THREE.Scene,
  opt: { thema: StadionThema; kaders: FotoKader[]; oost: Rechthoek | undefined; west: Rechthoek | undefined },
): { update: (seconden: number) => void } {
  const { thema } = opt
  // Plaatsen op de achterwanden: oost kijkt naar +x, west naar -x; afwisselend, zodat beide kanten
  // gevuld raken.
  const wanden = [
    opt.oost && { x: opt.oost.x1 - 0.45, kant: 1, z0: opt.oost.z0, z1: opt.oost.z1 },
    opt.west && { x: opt.west.x0 + 0.45, kant: -1, z0: opt.west.z0, z1: opt.west.z1 },
  ].filter((w): w is { x: number; kant: number; z0: number; z1: number } => !!w)
  const plekken: { pos: THREE.Vector3; rot: THREE.Quaternion }[] = []
  for (let i = 0; i < PER_WAND; i++) {
    for (const w of wanden) {
      const z = (w.z0 + w.z1) / 2 + (i % 2 === 0 ? 1 : -1) * (STAP / 2 + Math.floor(i / 2) * STAP)
      if (Math.abs(z - (w.z0 + w.z1) / 2) + KADER.b / 2 > (w.z1 - w.z0) / 2 - 0.6) continue
      plekken.push({
        pos: new THREE.Vector3(w.x, KADER.y, z),
        rot: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (w.kant * Math.PI) / 2),
      })
    }
  }
  const kaders = opt.kaders.slice(0, plekken.length)
  if (kaders.length === 0) return { update() {} }

  const lijst = new THREE.MeshLambertMaterial({ color: '#0f1115' })
  kaders.forEach((k, i) => {
    const { pos, rot } = plekken[i]
    const c = document.createElement('canvas')
    c.width = KADER.px
    c.height = KADER.py
    const tex = canvasTex(c)
    const beelden: (HTMLImageElement | null)[] = k.fotos.map(() => null)
    const teken = () => {
      tekenKader(c.getContext('2d')!, k, beelden, thema)
      tex.needsUpdate = true
    }
    teken()
    k.fotos.forEach((f, j) => {
      void laadBeeld(f.url).then((img) => {
        if (!img) return
        beelden[j] = img
        teken()
      })
    })
    const vlak = new THREE.Mesh(new THREE.PlaneGeometry(KADER.b, KADER.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    vlak.position.copy(pos).add(new THREE.Vector3(0, 0, 0.07).applyQuaternion(rot))
    vlak.quaternion.copy(rot)
    const rand = new THREE.Mesh(new THREE.BoxGeometry(KADER.b + 0.18, KADER.h + 0.18, 0.1), lijst)
    rand.position.copy(pos)
    rand.quaternion.copy(rot)
    scene.add(rand, vlak)
  })

  const licht = bouwBordlicht(
    scene,
    kaders.map((_, i): BordPlek => ({ pos: plekken[i].pos, rot: plekken[i].rot, b: KADER.b, h: KADER.h, kleur: thema.primair, vloer: true })),
  )
  return { update: (s) => licht.update(s) }
}
