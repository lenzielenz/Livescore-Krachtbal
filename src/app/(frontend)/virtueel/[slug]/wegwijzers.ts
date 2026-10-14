import * as THREE from 'three'

import { GEVEL, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { wegwijzer, type Doel, type Wijzer } from '@/lib/virtueel-wegwijzers'
import { gevelOmtrek } from './omgeving'
import { canvasTex, rondLogo } from './stadion'

// Bewegwijzering in de gangen, zoals in een echt stadion of op een luchthaven: donkere,
// van binnenuit verlichte panelen met pictogram, naam, pijl en afstand.
//  • Een welkomstzuil aan de hoofdingang met het stadionplan ("U bent hier") en alle bestemmingen.
//  • Wegwijzers aan een arm op de achterwanden van de lange tribunes, aan beide uiteinden: daar
//    waar de gang de hoek om gaat. Tweezijdig: elke kant toont wat er vóór je ligt.
//  • Kleinere zuilen bij de zij-ingangen.
// De pijlen en afstanden volgen de ring van de gangen (virtueel-wegwijzers.ts).

export type Bestemming = { naam: string; icoon: string; x: number; z: number; kleur: string }

type Ring = { s: (x: number, z: number) => { s: number; raak: { x: number; z: number } }; omtrek: number }

/** De gangen als ring: positie s (meter) en raaklijn voor elk punt, via de gevelomtrek. */
function maakRing(): Ring {
  const pts = gevelOmtrek(1)
  const laatste = pts[pts.length - 1]
  const omtrek = laatste.s + Math.hypot(pts[0].x - laatste.x, pts[0].z - laatste.z)
  return {
    omtrek,
    s(x, z) {
      let beste = 0
      let d = Infinity
      pts.forEach((p, i) => {
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2
        if (dd < d) {
          d = dd
          beste = i
        }
      })
      const a = pts[beste]
      const b = pts[(beste + 1) % pts.length]
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
      return { s: a.s, raak: { x: (b.x - a.x) / l, z: (b.z - a.z) / l } }
    },
  }
}

const PIJL: Record<string, string> = { '↑': '↑', '←': '←', '→': '→', '↓': '●' }

/** Eén rij op een paneel: pijl in een vakje, pictogram, naam, afstand. */
function rij(g: CanvasRenderingContext2D, w: Wijzer, x: number, y: number, breed: number, h: number, kleur: string): void {
  // Pijlvak in de kleur van de bestemming.
  g.fillStyle = kleur
  g.beginPath()
  g.roundRect(x, y + h * 0.1, h * 0.8, h * 0.8, h * 0.12)
  g.fill()
  g.fillStyle = '#0b1220'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `900 ${Math.round(h * 0.62)}px Inter, system-ui, sans-serif`
  g.fillText(PIJL[w.pijl] ?? '', x + h * 0.4, y + h * 0.53)
  g.font = `${Math.round(h * 0.5)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  g.fillText(w.icoon, x + h * 1.28, y + h * 0.54)
  g.textAlign = 'left'
  g.fillStyle = '#ffffff'
  g.font = `700 ${Math.round(h * 0.44)}px Inter, system-ui, sans-serif`
  g.fillText(w.naam, x + h * 1.82, y + h * 0.54, breed - h * 3.6)
  g.textAlign = 'right'
  g.fillStyle = 'rgba(203,213,225,.85)'
  g.font = `600 ${Math.round(h * 0.34)}px Inter, system-ui, sans-serif`
  g.fillText(w.pijl === '↓' ? 'hier' : `${w.meter} m`, x + breed, y + h * 0.54)
}

export function bouwWegwijzers(
  scene: THREE.Scene,
  opt: {
    thema: StadionThema
    logo: Promise<HTMLImageElement | null>
    bestemmingen: Bestemming[]
    tribunes: { zuid?: Rechthoek; noord?: Rechthoek; oost?: Rechthoek; west?: Rechthoek }
  },
): { obstakels: Rechthoek[] } {
  const { thema, bestemmingen, tribunes } = opt
  const { A, B } = GEVEL
  const obstakels: Rechthoek[] = []
  if (bestemmingen.length === 0) return { obstakels }
  const ring = maakRing()
  const kleurVan = new Map(bestemmingen.map((b) => [b.naam, b.kleur]))
  const doelen: Doel[] = bestemmingen.map((b) => ({ naam: b.naam, icoon: b.icoon, s: ring.s(b.x, b.z).s }))
  const wijzers = (x: number, z: number, kijk: { x: number; z: number }) => {
    const { s, raak } = ring.s(x, z)
    return wegwijzer({ s, omtrek: ring.omtrek, kijk, raak }, doelen).filter((w) => w.pijl !== 'terug')
  }
  const paneelMat = new THREE.MeshLambertMaterial({ color: '#0b1220' })
  const metaal = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.8, roughness: 0.35, emissive: '#1f2937', emissiveIntensity: 0.5 })

  // ---------- paneeltekening, gedeeld ----------
  const tekenPaneel = (c: HTMLCanvasElement, lijst: Wijzer[], kop: string | null) => {
    const g = c.getContext('2d')!
    const W = c.width
    const H = c.height
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, W, H)
    g.fillStyle = thema.primair
    g.fillRect(0, 0, W, 12)
    let y = 26
    if (kop) {
      g.fillStyle = 'rgba(148,163,184,.95)'
      g.font = '800 30px Inter, system-ui, sans-serif'
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      g.fillText(kop, 36, 50)
      y = 84
    }
    const h = Math.min(96, (H - y - 16) / Math.max(1, lijst.length))
    lijst.forEach((w, i) => {
      if (i > 0) {
        g.fillStyle = 'rgba(148,163,184,.18)'
        g.fillRect(36, y + i * h, W - 72, 2)
      }
      rij(g, w, 36, y + i * h + 4, W - 72, h - 8, kleurVan.get(w.naam) ?? '#e2e8f0')
    })
  }

  // ---------- wegwijzers aan een arm, op de uiteinden van de lange tribunes ----------
  const armBord = (wandX: number, wandZ: number, n: 1 | -1) => {
    // n = de richting van de muur de gang in (+z voor de zuidtribune, -z voor de noordtribune).
    const lang = 2.6
    const midZ = wandZ + n * (0.5 + lang / 2)
    const y = 3.55
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, lang + 0.5), metaal)
    arm.position.set(wandX, y + 0.62, wandZ + n * ((lang + 0.5) / 2))
    const staven = [-0.9, 0.9].map((dz) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6), metaal)
      st.position.set(wandX, y + 0.48, midZ + dz)
      return st
    })
    const kast = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, lang), paneelMat)
    kast.position.set(wandX, y, midZ)
    scene.add(arm, kast, ...staven)
    for (const kant of [1, -1]) {
      // Deze kant kijkt naar +x (kant 1) of -x; de lezer kijkt er dus in de andere richting naar.
      const kijk = { x: -kant, z: 0 }
      const lijst = wijzers(wandX, midZ, kijk).slice(0, 3)
      const c = document.createElement('canvas')
      c.width = 1024
      c.height = 310
      tekenPaneel(c, lijst, null)
      const vlak = new THREE.Mesh(new THREE.PlaneGeometry(lang - 0.06, 0.74), new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false }))
      vlak.position.set(wandX + kant * 0.072, y, midZ)
      vlak.rotation.y = (kant * Math.PI) / 2
      scene.add(vlak)
    }
  }
  for (const t of [tribunes.zuid, tribunes.noord]) {
    if (!t) continue
    const zuid = t === tribunes.zuid
    const wandZ = zuid ? t.z1 - 0.45 : t.z0 + 0.45
    for (const x of [t.x0 + 1.4, t.x1 - 1.4]) armBord(x, wandZ, zuid ? 1 : -1)
  }

  // ---------- zuilen: welkom aan de hoofdingang, kleiner bij de zij-ingangen ----------
  const zuil = (x: number, z: number, ry: number, groot: boolean) => {
    const b = groot ? 1.5 : 1.0
    const h = groot ? 2.7 : 2.1
    const voet = new THREE.Mesh(new THREE.BoxGeometry(b + 0.2, 0.12, 0.6), metaal)
    voet.position.set(x, 0.06, z)
    voet.rotation.y = ry
    const kast = new THREE.Mesh(new THREE.BoxGeometry(b, h, 0.26), paneelMat)
    kast.position.set(x, 0.12 + h / 2, z)
    kast.rotation.y = ry
    scene.add(voet, kast)
    const voor = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry))
    const kijk = { x: -voor.x, z: -voor.z }
    const c = document.createElement('canvas')
    c.width = 600
    c.height = Math.round((600 * h) / b)
    const tex = canvasTex(c)
    const lijst = wijzers(x, z, kijk)
    const teken = (logo: HTMLImageElement | null) => {
      const g = c.getContext('2d')!
      const W = c.width
      const H = c.height
      g.fillStyle = '#0b1220'
      g.fillRect(0, 0, W, H)
      // Kop in clubkleur.
      const kopH = groot ? 230 : 120
      g.fillStyle = thema.primair
      g.fillRect(0, 0, W, kopH)
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      g.fillStyle = thema.tekstOpPrimair
      if (groot) {
        rondLogo(g, logo, thema, 100, 115, 66)
        g.font = '700 30px Inter, system-ui, sans-serif'
        g.fillText('WELKOM IN HET STADION VAN', 186, 78, W - 210)
        g.font = '900 52px Inter, system-ui, sans-serif'
        g.fillText(thema.naam.toUpperCase(), 186, 140, W - 210)
      } else {
        g.font = '900 44px Inter, system-ui, sans-serif'
        g.fillText('ⓘ  WEGWIJZER', 36, kopH / 2, W - 72)
      }
      let y = kopH + 20
      if (groot) {
        // Het stadionplan, zoals je het ziet (noord boven), met "U bent hier".
        const mapB = W - 72
        const mapH = mapB * ((B + 4) / (A + 4))
        const sx = (wx: number) => 36 + ((wx + A + 4) / (2 * (A + 4))) * mapB
        const sz = (wz: number) => y + 46 + ((wz + B + 4) / (2 * (B + 4))) * mapH
        g.fillStyle = 'rgba(148,163,184,.95)'
        g.font = '800 26px Inter, system-ui, sans-serif'
        g.fillText('STADIONPLAN', 36, y + 18)
        g.fillStyle = '#131c2e'
        g.strokeStyle = '#475569'
        g.lineWidth = 4
        g.beginPath()
        g.roundRect(sx(-A), sz(-B), sx(A) - sx(-A), sz(B) - sz(-B), ((GEVEL.R / (2 * (A + 4))) * mapB))
        g.fill()
        g.stroke()
        // Veld en tribunes.
        const t = tribunes
        if (t.west && t.oost && t.noord && t.zuid) {
          g.fillStyle = '#15803d'
          g.fillRect(sx(t.west.x1), sz(t.noord.z1), sx(t.oost.x0) - sx(t.west.x1), sz(t.zuid.z0) - sz(t.noord.z1))
          g.strokeStyle = 'rgba(255,255,255,.7)'
          g.lineWidth = 2
          g.strokeRect(sx(t.west.x1) + 6, sz(t.noord.z1) + 6, sx(t.oost.x0) - sx(t.west.x1) - 12, sz(t.zuid.z0) - sz(t.noord.z1) - 12)
        }
        g.fillStyle = '#334155'
        for (const r of Object.values(t)) if (r) g.fillRect(sx(r.x0), sz(r.z0), sx(r.x1) - sx(r.x0), sz(r.z1) - sz(r.z0))
        // De bestemmingen als gekleurde stippen met hun pictogram.
        for (const b of bestemmingen) {
          g.fillStyle = b.kleur
          g.beginPath()
          g.arc(sx(b.x), sz(b.z), 16, 0, Math.PI * 2)
          g.fill()
          g.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
          g.textAlign = 'center'
          g.fillText(b.icoon, sx(b.x), sz(b.z) + 1)
        }
        // U bent hier.
        g.fillStyle = '#ef4444'
        g.beginPath()
        g.arc(sx(x), sz(z), 13, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = 'rgba(239,68,68,.5)'
        g.lineWidth = 5
        g.beginPath()
        g.arc(sx(x), sz(z), 24, 0, Math.PI * 2)
        g.stroke()
        g.fillStyle = '#ffffff'
        g.font = '800 22px Inter, system-ui, sans-serif'
        g.textAlign = 'left'
        g.fillText('U BENT HIER', sx(x) + 30, sz(z) - 18)
        y += 46 + mapH + 30
      }
      const rijH = Math.min(groot ? 92 : 104, (H - y - 70) / Math.max(1, lijst.length))
      lijst.forEach((w, i) => {
        if (i > 0) {
          g.fillStyle = 'rgba(148,163,184,.18)'
          g.fillRect(36, y + i * rijH, W - 72, 2)
        }
        rij(g, w, 36, y + i * rijH + 4, W - 72, rijH - 8, kleurVan.get(w.naam) ?? '#e2e8f0')
      })
      g.fillStyle = 'rgba(148,163,184,.6)'
      g.font = '600 22px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText('Krachtbal Live · virtueel stadion', W / 2, H - 34)
      tex.needsUpdate = true
    }
    teken(null)
    if (groot) void opt.logo.then(teken)
    const vlak = new THREE.Mesh(new THREE.PlaneGeometry(b - 0.08, h - 0.08), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    vlak.position.set(x, 0.12 + h / 2, z).add(voor.clone().multiplyScalar(0.135))
    vlak.rotation.y = ry
    scene.add(vlak)
    obstakels.push({ x0: x - b / 2 - 0.2, x1: x + b / 2 + 0.2, z0: z - b / 2 - 0.2, z1: z + b / 2 + 0.2 })
  }

  // De welkomstzuil: net binnen de hoofdingang, naast de looplijn, naar de bezoeker gekeerd.
  const zuidWand = tribunes.zuid ? tribunes.zuid.z1 - 0.45 : B - 8
  zuil(-8.6, (zuidWand + B - 0.6) / 2 + 0.6, 0, true)
  // Bij de zij-ingangen: midden in de gang, naast de opening, naar wie binnenkomt.
  if (tribunes.oost) zuil((tribunes.oost.x1 - 0.45 + A - 0.6) / 2, 4.6, Math.PI / 2, false)
  if (tribunes.west) zuil((tribunes.west.x0 + 0.45 - A + 0.6) / 2, -4.6, -Math.PI / 2, false)
  // In de smalle noordgang: tegen de tribune en naast het weekendbord, uit de looplijn.
  if (tribunes.noord) zuil(6.4, tribunes.noord.z0 + 0.45 - 0.75, Math.PI, false)
  return { obstakels }
}
