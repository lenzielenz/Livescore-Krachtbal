import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'
import { ARTIKELEN, type Artikel, type KledijSoort } from '@/lib/virtueel-fanshop'

// De rekken van de fanshop in de gang: alles wat je kan kopen, hangt er echt. Links een wand met
// alle shirts (op kleerhangers, twee rijen), rechts de broeken en de sjaals, en op de achterwand
// (boven de toog) de petten en hoeden, de schoenen en de extra's op haakjes, elk met een
// prijskaartje. Wat je kiest en koopt, doe je aan de toog (het fanshopscherm).
//
// Coördinaten: in het assenstelsel van de hoek (zie gangleven.ts): de toog op z = 0, de achterwand
// op z = -1.7 (voorkant -1.6), de opening naar de gang aan +z.

const tex = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Vul een vlak met het patroon van een artikel. */
function vul(g: CanvasRenderingContext2D, a: Artikel, kleur: (k: string | undefined, s: string) => string, w: number, h: number) {
  const k1 = kleur(a.stijl.kleur, '#1f2937')
  const k2 = kleur(a.stijl.kleur2, '#f8fafc')
  g.fillStyle = k1
  g.fillRect(0, 0, w, h)
  g.fillStyle = k2
  switch (a.stijl.patroon) {
    case 'strepen':
      for (let x = 0; x < w; x += w / 7) g.fillRect(x, 0, w / 16, h)
      break
    case 'hoops':
      for (let y = h * 0.12; y < h; y += h / 6) g.fillRect(0, y, w, h / 14)
      break
    case 'banen':
      g.fillRect(w * 0.08, 0, w * 0.06, h)
      g.fillRect(w * 0.86, 0, w * 0.06, h)
      break
    case 'retro':
      g.fillRect(0, h * 0.34, w, h * 0.08)
      g.fillRect(0, h * 0.46, w, h * 0.03)
      break
    case 'ster':
      g.font = `900 ${Math.round(w * 0.3)}px sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('★', w / 2, h * 0.42)
      break
    case 'rits':
      g.fillRect(w * 0.49, 0, w * 0.03, h)
      break
    case 'bloemen':
      for (let i = 0; i < 22; i++) {
        g.fillStyle = i % 3 ? k2 : '#f472b6'
        g.beginPath()
        g.arc((i * 53) % w, (i * 37) % h, w * 0.04, 0, Math.PI * 2)
        g.fill()
      }
      break
    case 'kerst':
      for (let x = 0; x < w; x += w / 12) {
        g.fillRect(x, h * 0.3, w / 24, w / 24)
        g.fillRect(x + w / 24, h * 0.62, w / 24, w / 24)
      }
      break
    case 'ruit':
      g.globalAlpha = 0.5
      for (let i = 0; i < w; i += w / 6) g.fillRect(i, 0, w / 22, h)
      for (let i = 0; i < h; i += w / 6) g.fillRect(0, i, w, w / 22)
      g.globalAlpha = 1
      break
    case 'camo':
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? k2 : '#6b5b3a'
        g.beginPath()
        g.ellipse((i * 61) % w, (i * 43) % h, w * 0.12, w * 0.07, i, 0, Math.PI * 2)
        g.fill()
      }
      break
    case 'blokken':
      for (let y = 0; y < h; y += w / 4) for (let x = 0; x < w; x += w / 4) if (((x + y) / (w / 4)) % 2 === 0) g.fillRect(x, y, w / 4, w / 4)
      break
    case 'regenboog': {
      const kl = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6']
      for (let y = 0, i = 0; y < h; y += h / 12, i++) {
        g.fillStyle = kl[i % kl.length]
        g.fillRect(0, y, w, h / 12 + 1)
      }
      break
    }
  }
}

/** Een kledingstuk als uitgeknipt silhouet (shirt, broek, sjaal) of als kaartje met een icoon. */
function tekenArtikel(a: Artikel, thema: StadionThema): THREE.CanvasTexture {
  const kleur = (k: string | undefined, s: string) => (k === 'club' ? thema.primair : k === 'club2' ? thema.secundair : (k ?? s))
  const W = 256
  const H = 320
  return tex(W, H, (g) => {
    const vorm = new Path2D()
    if (a.soort === 'shirt') {
      const jas = a.stijl.vorm === 'jas'
      vorm.moveTo(88, 20)
      vorm.quadraticCurveTo(128, 46, 168, 20)
      vorm.lineTo(236, 52)
      vorm.lineTo(218, 120)
      vorm.lineTo(190, 108)
      vorm.lineTo(192, jas ? 300 : 262)
      vorm.lineTo(64, jas ? 300 : 262)
      vorm.lineTo(66, 108)
      vorm.lineTo(38, 120)
      vorm.lineTo(20, 52)
      vorm.closePath()
    } else if (a.soort === 'broek') {
      const kort = a.stijl.vorm === 'kort'
      const onder = kort ? 170 : 300
      vorm.moveTo(62, 24)
      vorm.lineTo(194, 24)
      vorm.lineTo(206, onder)
      vorm.lineTo(140, onder)
      vorm.lineTo(128, 96)
      vorm.lineTo(116, onder)
      vorm.lineTo(50, onder)
      vorm.closePath()
    } else if (a.soort === 'sjaal' && !['das', 'medaille', 'ketting', 'geen'].includes(a.stijl.vorm ?? '')) {
      vorm.rect(92, 16, 72, 270)
    }
    const silhouet = a.soort === 'shirt' || a.soort === 'broek' || (a.soort === 'sjaal' && !['das', 'medaille', 'ketting', 'geen'].includes(a.stijl.vorm ?? ''))
    if (silhouet) {
      g.save()
      g.clip(vorm)
      vul(g, a, kleur, W, H)
      if (a.soort === 'shirt') {
        // Een kraag en een rugnummer.
        g.fillStyle = kleur(a.stijl.kleur2, '#f8fafc')
        g.fillRect(0, 18, W, 6)
        g.font = '900 54px Inter, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.globalAlpha = 0.9
        g.fillText('12', 128, 170)
        g.globalAlpha = 1
      }
      // Wat schaduw en plooien.
      const sch = g.createLinearGradient(0, 0, W, 0)
      sch.addColorStop(0, 'rgba(0,0,0,.25)')
      sch.addColorStop(0.5, 'rgba(255,255,255,.08)')
      sch.addColorStop(1, 'rgba(0,0,0,.3)')
      g.fillStyle = sch
      g.fillRect(0, 0, W, H)
      g.restore()
      g.strokeStyle = 'rgba(0,0,0,.35)'
      g.lineWidth = 3
      g.stroke(vorm)
      if (a.soort === 'sjaal') {
        g.fillStyle = kleur(a.stijl.kleur2, '#f8fafc')
        for (let i = 0; i < 7; i++) g.fillRect(96 + i * 10, 286, 4, 22)
      }
    } else {
      // Een kaartje op een haakje: het icoon groot, en de naam eronder.
      g.fillStyle = '#f8fafc'
      g.beginPath()
      g.roundRect(14, 30, W - 28, H - 44, 26)
      g.fill()
      g.fillStyle = kleur(a.stijl.kleur, thema.primair)
      g.beginPath()
      g.roundRect(14, 30, W - 28, 36, [26, 26, 0, 0])
      g.fill()
      g.fillStyle = '#0b1220'
      g.beginPath()
      g.arc(128, 48, 9, 0, Math.PI * 2)
      g.fill()
      g.font = '140px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(a.icoon, 128, 160)
      g.fillStyle = '#0b1220'
      g.font = '800 24px Inter, system-ui, sans-serif'
      g.fillText(a.naam, 128, 262, 210)
    }
    // Het prijskaartje.
    g.fillStyle = a.prijs ? '#facc15' : '#4ade80'
    g.beginPath()
    g.roundRect(W - 112, H - 52, 100, 40, 12)
    g.fill()
    g.fillStyle = '#0b1220'
    g.font = '900 24px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(a.prijs ? `🪙${a.prijs >= 100000 ? '∞' : a.prijs}` : 'gratis', W - 62, H - 31)
  })
}

export function bouwShopRek(thema: StadionThema): { groep: THREE.Group; obstakels: { lx: number; lz: number; r: number }[] } {
  const groep = new THREE.Group()
  const staal = new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.9, roughness: 0.25 })
  const paneel = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.7 })
  const lijst = (s: KledijSoort) => ARTIKELEN.filter((a) => a.soort === s && a.stijl.vorm !== 'geen')
  const hangerGeo = new THREE.TorusGeometry(0.035, 0.006, 4, 10, Math.PI * 1.4)
  const hangerBalk = new THREE.CylinderGeometry(0.006, 0.006, 0.36, 4).rotateZ(Math.PI / 2)

  /** Hang een artikel op: een vlak met zijn silhouet, en een kleerhanger of haakje erboven. */
  const hang = (ouder: THREE.Object3D, a: Artikel, x: number, y: number, z: number, maat: number, hanger: boolean) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(maat * 0.8, maat), new THREE.MeshStandardMaterial({ map: tekenArtikel(a, thema), transparent: true, alphaTest: 0.05, roughness: 0.8, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.08 }))
    m.position.set(x, y - maat / 2, z)
    // Een tikje scheef, zoals echte kleren aan een rek.
    m.rotation.z = (Math.sin(x * 13.1 + y * 7.3) * 0.04)
    ouder.add(m)
    const haak = new THREE.Mesh(hangerGeo, staal)
    haak.position.set(x, y + 0.04, z)
    haak.rotation.z = Math.PI * 0.8
    ouder.add(haak)
    if (hanger) {
      const balk = new THREE.Mesh(hangerBalk, staal)
      balk.position.set(x, y - 0.035, z + 0.002)
      ouder.add(balk)
    }
  }

  // ---------- de zijwanden met rekken: links de shirts, rechts broeken en sjaals ----------
  const zijwand = (sx: number, rijen: Artikel[][]) => {
    const w = new THREE.Group()
    w.position.set(sx * 3.75, 0, -1.05)
    w.rotation.y = -sx * 0.55
    groep.add(w)
    const pl = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.0, 0.12), paneel)
    pl.position.y = 1.5
    w.add(pl)
    // Een lichtlijst bovenaan en een bord.
    const led = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: thema.primair, toneMapped: false }))
    led.position.set(0, 2.95, 0.09)
    w.add(led)
    rijen.forEach((rij, r) => {
      const y = 2.72 - r * 1.22
      const stang = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.1, 8).rotateZ(Math.PI / 2), staal)
      stang.position.set(0, y + 0.06, 0.24)
      w.add(stang)
      for (const k of [-1, 1]) {
        const steun = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), staal)
        steun.position.set(k * 1.0, y + 0.06, 0.15)
        w.add(steun)
      }
      const stap = 2.0 / Math.max(1, rij.length)
      rij.forEach((a, i) => hang(w, a, -1.0 + stap * (i + 0.5), y, 0.24 + (i % 2) * 0.03, 0.62, true))
    })
  }
  const shirts = lijst('shirt')
  const half = Math.ceil(shirts.length / 2)
  zijwand(-1, [shirts.slice(0, half), shirts.slice(half)])
  zijwand(1, [lijst('broek'), lijst('sjaal')])

  // ---------- de achterwand boven de toog: petten, schoenen en extra's aan haakjes ----------
  const wandItems = [...lijst('pet'), ...lijst('schoenen'), ...lijst('extra')]
  const kolommen = 12
  const rijen = Math.ceil(wandItems.length / kolommen)
  // Een geperforeerd bord (een gaatjeswand) in plaats van het menubord.
  const gaatjes = tex(512, 256, (g) => {
    g.fillStyle = '#e5e7eb'
    g.fillRect(0, 0, 512, 256)
    g.fillStyle = '#9ca3af'
    for (let y = 8; y < 256; y += 16) for (let x = 8; x < 512; x += 16) {
      g.beginPath()
      g.arc(x, y, 2.4, 0, Math.PI * 2)
      g.fill()
    }
  })
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.05), new THREE.MeshStandardMaterial({ map: gaatjes, roughness: 0.85 }))
  bord.position.set(0, 2.17, -1.585)
  groep.add(bord)
  wandItems.forEach((a, i) => {
    const kol = i % kolommen
    const rij = Math.floor(i / kolommen)
    hang(groep, a, -2.4 + kol * (4.8 / (kolommen - 1)), 3.1 - rij * (1.9 / Math.max(1, rijen)), -1.56, 0.5, false)
  })

  return {
    groep,
    // Botsing: de twee zijwanden (als rechthoeken rond hun midden).
    obstakels: [
      { lx: -3.75, lz: -1.05, r: 0.9 },
      { lx: 3.75, lz: -1.05, r: 0.9 },
    ],
  }
}
