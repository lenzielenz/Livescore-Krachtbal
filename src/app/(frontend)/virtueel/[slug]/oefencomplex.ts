import * as THREE from 'three'

import type { Rechthoek, StadionThema } from '@/lib/virtueel'
import { krachtbalGeometrie, krachtbalTextuur } from './krachtbal'
import { rondeDoos } from './rond'

// Het oefencomplex ten noorden van het stadion: waar de ploegen trainen. Een wandelpad met
// lantaarns loopt van het plein door een poort met de clubnaam naar een kunstgrasveld met de
// lijnen van een krachtbalveld (dezelfde maat als in het stadion). Errond:
//  • een groene berm met hagen en bomen, een ballenvanger in clubkleur aan de korte kanten;
//  • vier lichtmasten, twee dug-outs met kuipstoeltjes, een kleine tribune;
//  • een paviljoen (kleedkamers en kantine) met een terras en grote ramen;
//  • trainingsmateriaal: pionnen, een ballenkar met krachtballen, een loopladder.
// Er is geen wedstrijd bezig: je kan vrij over het veld en rond het complex wandelen.

export const OEFEN = { x: 0, z: -92, x0: -50, x1: 50, z0: -124, z1: -58 }

export type Oefencomplex = { obstakels: Rechthoek[]; update: (seconden: number) => void }

const tex = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void, herhaal?: [number, number]) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (herhaal) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(herhaal[0], herhaal[1])
  }
  return t
}

export function bouwOefencomplex(
  scene: THREE.Scene,
  opt: { thema: StadionThema; licht: boolean; veldTex: THREE.Texture; lengte: number; breedte: number; pleinRand: number },
): Oefencomplex {
  const { thema, licht } = opt
  const groep = new THREE.Group()
  scene.add(groep)
  const obstakels: Rechthoek[] = []
  const { x: cx, z: cz } = OEFEN
  const L = opt.lengte + 6 // veld met uitloop
  const W = opt.breedte + 6
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    groep.add(m)
    if (!licht) m.castShadow = true
    return m
  }
  const blok = (x0: number, x1: number, z0: number, z1: number) => obstakels.push({ x0, x1, z0, z1 })
  const primair = new THREE.Color(thema.primair)
  const clubMat = new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.5 })
  const club2Mat = new THREE.MeshStandardMaterial({ color: thema.secundair, roughness: 0.5 })
  const staal = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.7, roughness: 0.35 })
  const donker = new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.4, roughness: 0.5 })
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff7df', toneMapped: false })
  const plasMat = (kleur: string, sterk: number) => new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: sterk, depthWrite: false, blending: THREE.AdditiveBlending })

  // ---------- de grond: een gazon met zachte randen, het wandelpad en het terrein ----------
  const gras = tex(256, 256, (g) => {
    g.fillStyle = '#24502f'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,60,30' : '70,120,60'},${0.15 + Math.random() * 0.2})`
      g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2)
    }
  }, [24, 18])
  // Een afgeronde gazonplaat (geen harde rechthoek), net boven de grond.
  const gazonVorm = new THREE.Shape()
  {
    const r = 10
    const [a, b, c, d] = [OEFEN.x0, OEFEN.x1, -OEFEN.z1, -OEFEN.z0]
    gazonVorm.moveTo(a + r, c)
    gazonVorm.lineTo(b - r, c)
    gazonVorm.quadraticCurveTo(b, c, b, c + r)
    gazonVorm.lineTo(b, d - r)
    gazonVorm.quadraticCurveTo(b, d, b - r, d)
    gazonVorm.lineTo(a + r, d)
    gazonVorm.quadraticCurveTo(a, d, a, d - r)
    gazonVorm.lineTo(a, c + r)
    gazonVorm.quadraticCurveTo(a, c, a + r, c)
  }
  const gazonGeo = new THREE.ShapeGeometry(gazonVorm, 12).rotateX(-Math.PI / 2)
  const uv = gazonGeo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 100, uv.getY(i) / 66)
  const gazon = new THREE.Mesh(gazonGeo, new THREE.MeshLambertMaterial({ map: gras }))
  gazon.position.y = 0.004
  gazon.receiveShadow = !licht
  groep.add(gazon)
  // Het wandelpad: van de rand van het plein tot aan de poort, in klinkers met een witte boord.
  const klinker = tex(128, 128, (g) => {
    g.fillStyle = '#6b6259'
    g.fillRect(0, 0, 128, 128)
    for (let y = 0; y < 128; y += 16)
      for (let x = (y / 16) % 2 ? -16 : 0; x < 128; x += 32) {
        const v = 110 + Math.floor(Math.random() * 30)
        g.fillStyle = `rgb(${v},${v - 8},${v - 18})`
        g.fillRect(x + 1, y + 1, 30, 14)
      }
  })
  klinker.wrapS = klinker.wrapT = THREE.RepeatWrapping
  const padZ0 = OEFEN.z1 + 2 // poort
  const padZ1 = -opt.pleinRand + 0.5
  const padL = padZ1 - padZ0
  const padTex = klinker.clone()
  padTex.repeat.set(1, padL / 4)
  padTex.needsUpdate = true
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(4, padL).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: padTex }))
  pad.position.set(cx, 0.012, (padZ0 + padZ1) / 2)
  pad.receiveShadow = !licht
  groep.add(pad)
  for (const sx of [-1, 1]) deel(rondeDoos(0.18, 0.08, padL, 0.03), new THREE.MeshLambertMaterial({ color: '#d6d3d1' }), cx + sx * 2.1, 0.04, (padZ0 + padZ1) / 2)
  // Het terrein rond het veld: rood tartan, zodat het veld als een geheel oogt.
  const tartan = tex(128, 128, (g) => {
    g.fillStyle = '#8f3a2a'
    g.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,190,160'},${0.06 + Math.random() * 0.06})`
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2)
    }
  }, [(L + 8) / 3, (W + 8) / 3])
  const terrein = new THREE.Mesh(rondeDoos(L + 8, 0.06, W + 8, 0.03), new THREE.MeshLambertMaterial({ map: tartan }))
  terrein.position.set(cx, 0.03, cz)
  terrein.receiveShadow = !licht
  groep.add(terrein)
  // Het kunstgrasveld met de lijnen van een krachtbalveld.
  const veld = new THREE.Mesh(new THREE.PlaneGeometry(L, W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: opt.veldTex, roughness: 0.92 }))
  veld.position.set(cx, 0.065, cz)
  veld.receiveShadow = !licht
  groep.add(veld)

  // ---------- de poort met de clubnaam ----------
  const poortZ = OEFEN.z1 + 2
  for (const sx of [-1, 1]) deel(rondeDoos(0.6, 4.2, 0.6, 0.12), donker, cx + sx * 2.9, 2.1, poortZ)
  deel(rondeDoos(6.6, 0.9, 0.5, 0.16), donker, cx, 4.55, poortZ)
  const poortTekst = tex(1024, 140, (g) => {
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 1024, 140)
    g.fillStyle = thema.primair
    g.fillRect(0, 128, 1024, 12)
    g.fillStyle = '#fff'
    g.font = '900 64px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(`OEFENCOMPLEX ${thema.naam.toUpperCase()}`, 512, 66, 980)
  })
  for (const sz of [1, -1]) {
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.86), new THREE.MeshBasicMaterial({ map: poortTekst, toneMapped: false }))
    bord.position.set(cx, 4.55, poortZ + sz * 0.26)
    if (sz < 0) bord.rotation.y = Math.PI
    groep.add(bord)
  }
  for (const sx of [-1, 1]) blok(cx + sx * 2.9 - 0.4, cx + sx * 2.9 + 0.4, poortZ - 0.4, poortZ + 0.4)

  // ---------- lantaarns langs het pad ----------
  const lantaarns: THREE.Vector3[] = []
  for (let z = padZ0 + 4; z < padZ1 - 1; z += 7) for (const sx of [-1, 1]) lantaarns.push(new THREE.Vector3(cx + sx * 2.8, 0, z))
  for (const p of lantaarns) {
    deel(new THREE.CylinderGeometry(0.06, 0.09, 3.6, 10), donker, p.x, 1.8, p.z)
    deel(new THREE.SphereGeometry(0.2, 14, 10), lampMat, p.x, 3.7, p.z)
    const plas = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), plasMat('#ffe2a8', 0.16))
    plas.position.set(p.x, 0.02, p.z)
    plas.renderOrder = 1
    groep.add(plas)
    blok(p.x - 0.15, p.x + 0.15, p.z - 0.15, p.z + 0.15)
  }

  // ---------- ballenvangers aan de korte kanten ----------
  const net = new THREE.MeshBasicMaterial({
    map: tex(64, 64, (g) => {
      g.strokeStyle = 'rgba(255,255,255,.55)'
      g.lineWidth = 2
      for (let i = 0; i <= 64; i += 8) {
        g.beginPath()
        g.moveTo(i, 0)
        g.lineTo(i, 64)
        g.moveTo(0, i)
        g.lineTo(64, i)
        g.stroke()
      }
    }, [W + 6, 3]),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  for (const sx of [-1, 1]) {
    const x = cx + sx * (L / 2 + 3.5)
    const n = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, 4.5), net)
    n.position.set(x, 2.25, cz)
    n.rotation.y = Math.PI / 2
    groep.add(n)
    for (let k = 0; k <= 4; k++) deel(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 8), clubMat, x, 2.3, cz - (W + 6) / 2 + (k * (W + 6)) / 4)
    deel(new THREE.CylinderGeometry(0.04, 0.04, W + 6, 8).rotateX(Math.PI / 2), clubMat, x, 4.55, cz)
    blok(x - 0.15, x + 0.15, cz - (W + 6) / 2, cz + (W + 6) / 2)
  }

  // ---------- lichtmasten in de hoeken ----------
  const masten: THREE.Vector3[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) masten.push(new THREE.Vector3(cx + sx * (L / 2 + 2), 0, cz + sz * (W / 2 + 4.6)))
  for (const m of masten) {
    deel(new THREE.CylinderGeometry(0.16, 0.28, 14, 12), staal, m.x, 7, m.z)
    const kop = new THREE.Group()
    kop.position.set(m.x, 14, m.z)
    kop.lookAt(cx, 0, cz)
    groep.add(kop)
    const plaat = new THREE.Mesh(rondeDoos(2.2, 1.2, 0.18, 0.06), donker)
    kop.add(plaat)
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), lampMat)
      l.position.set(-0.7 + (i % 3) * 0.7, i < 3 ? 0.28 : -0.28, 0.1)
      kop.add(l)
    }
    blok(m.x - 0.35, m.x + 0.35, m.z - 0.35, m.z + 0.35)
  }
  // Het licht op het veld: zachte plassen.
  const veldLicht = new THREE.Mesh(new THREE.PlaneGeometry(L + 4, W + 4).rotateX(-Math.PI / 2), plasMat('#eef6ff', 0.07))
  veldLicht.position.set(cx, 0.08, cz)
  veldLicht.renderOrder = 1
  groep.add(veldLicht)

  // ---------- dug-outs langs de zuidkant (aan weerszijden van het pad) ----------
  const dugZ = cz + W / 2 + 2.6
  const kuip = rondeDoos(0.46, 0.5, 0.42, 0.12)
  for (const sx of [-1, 1]) {
    const x = cx + sx * 7
    const kap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 24, 1, true, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }))
    kap.rotation.z = Math.PI / 2
    kap.rotation.x = Math.PI
    kap.position.set(x, 1.05, dugZ)
    groep.add(kap)
    deel(rondeDoos(5.1, 0.12, 1.3, 0.05), donker, x, 0.06, dugZ + 0.05)
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(kuip, sx < 0 ? clubMat : club2Mat)
      s.position.set(x - 2.1 + k * 0.84, 0.4, dugZ + 0.35)
      groep.add(s)
    }
    blok(x - 2.6, x + 2.6, dugZ - 0.4, dugZ + 1.2)
  }

  // ---------- een kleine tribune langs de noordkant (tegenover de poort) ----------
  const tribZ = cz - W / 2 - 4
  const tribMat = new THREE.MeshLambertMaterial({ color: '#94a3b8' })
  for (let t = 0; t < 3; t++) {
    deel(rondeDoos(20, 0.45 * (t + 1), 0.9, 0.04), tribMat, cx, 0.225 * (t + 1), tribZ - t * 0.9)
    const zitjes = new THREE.InstancedMesh(kuip, t % 2 ? club2Mat : clubMat, 24)
    const m4 = new THREE.Matrix4()
    for (let k = 0; k < 24; k++) {
      m4.makeTranslation(cx - 9.2 + k * 0.8, 0.7 + t * 0.45, tribZ - t * 0.9 - 0.05)
      zitjes.setMatrixAt(k, m4)
    }
    groep.add(zitjes)
  }
  // Een licht hellend dakje erboven, met een rand in clubkleur.
  const tribDak = deel(rondeDoos(21, 0.14, 3.8, 0.06), new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 }), cx, 4.1, tribZ - 1.0)
  tribDak.rotation.x = -0.12
  const dakRand = deel(rondeDoos(21.05, 0.22, 0.12, 0.05), clubMat, cx, 4.32, tribZ + 0.85)
  dakRand.rotation.x = -0.12
  for (const sx of [-1, 1]) deel(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 8), staal, cx + sx * 10.2, 2.2, tribZ - 2.4)
  blok(cx - 10.4, cx + 10.4, tribZ - 2.7, tribZ + 0.5)

  // ---------- het paviljoen: kleedkamers en kantine, met een terras ----------
  const pvX = cx + L / 2 + 16
  const pvZ = cz + 4
  const muur = new THREE.MeshLambertMaterial({ color: '#e7e2d9' })
  const hout = new THREE.MeshLambertMaterial({
    map: tex(128, 128, (g) => {
      for (let y = 0; y < 128; y += 12) {
        const v = 120 + Math.floor(Math.random() * 30)
        g.fillStyle = `rgb(${v},${Math.floor(v * 0.7)},${Math.floor(v * 0.45)})`
        g.fillRect(0, y, 128, 12)
        g.fillStyle = 'rgba(0,0,0,.25)'
        g.fillRect(0, y, 128, 1)
      }
    }, [3, 2]),
  })
  deel(rondeDoos(9, 3.6, 16, 0.25), muur, pvX, 1.8, pvZ)
  deel(rondeDoos(9.8, 0.3, 17, 0.12), donker, pvX, 3.75, pvZ)
  // Houten gevelbekleding en grote ramen naar het veld (westkant), warm verlicht.
  deel(rondeDoos(0.1, 3.0, 15.4, 0.04), hout, pvX - 4.52, 1.6, pvZ)
  const raamMat = new THREE.MeshBasicMaterial({
    map: tex(256, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 128)
      gr.addColorStop(0, '#ffe7b0')
      gr.addColorStop(1, '#d58a2a')
      g.fillStyle = gr
      g.fillRect(0, 0, 256, 128)
      g.fillStyle = 'rgba(40,30,20,.55)'
      for (let i = 0; i < 6; i++) g.fillRect(20 + i * 40, 70, 18, 58)
      g.fillStyle = '#1b2230'
      g.fillRect(0, 0, 256, 6)
      g.fillRect(124, 0, 8, 128)
    }),
    toneMapped: false,
  })
  for (const dz of [-4.5, 0.5]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), raamMat)
    r.position.set(pvX - 4.58, 1.8, pvZ + dz)
    r.rotation.y = -Math.PI / 2
    groep.add(r)
  }
  const naamPv = tex(768, 128, (g) => {
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 768, 128)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 60px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('KANTINE · KLEEDKAMERS', 384, 66, 740)
  })
  const pvBord = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.33), new THREE.MeshBasicMaterial({ map: naamPv, toneMapped: false }))
  pvBord.position.set(pvX - 4.95, 3.3, pvZ)
  pvBord.rotation.y = -Math.PI / 2
  groep.add(pvBord)
  blok(pvX - 4.6, pvX + 4.6, pvZ - 8.1, pvZ + 8.1)
  // Het terras: een houten vlonder met parasols en tafeltjes.
  const terrasX = pvX - 7.2
  const vlonder = new THREE.Mesh(rondeDoos(4.4, 0.16, 14, 0.04), hout)
  vlonder.position.set(terrasX, 0.08, pvZ)
  groep.add(vlonder)
  for (const dz of [-4.5, 0, 4.5]) {
    const z = pvZ + dz
    deel(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20), donker, terrasX, 0.9, z)
    deel(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), donker, terrasX, 0.5, z)
    deel(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8), staal, terrasX, 1.4, z)
    const parasol = deel(new THREE.ConeGeometry(1.5, 0.6, 12, 1, true), dz === 0 ? club2Mat : clubMat, terrasX, 2.6, z)
    ;(parasol.material as THREE.Material).side = THREE.DoubleSide
    for (const sx of [-1, 1]) deel(rondeDoos(0.42, 0.45, 0.42, 0.08), donker, terrasX + sx * 0.75, 0.38, z)
    blok(terrasX - 1.0, terrasX + 1.0, z - 0.6, z + 0.6)
  }

  // ---------- trainingsmateriaal op het veld ----------
  // Pionnen in een slalom, een loopladder en een ballenkar met krachtballen.
  const pion = new THREE.ConeGeometry(0.14, 0.32, 14)
  const pionMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.5 })
  const pionnen = new THREE.InstancedMesh(pion, pionMat, 16)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < 16; i++) {
    m4.makeTranslation(cx - 12 + i * 1.6, 0.23, cz + (i % 2 ? 2.2 : -2.2) * 0.6 + 3)
    pionnen.setMatrixAt(i, m4)
  }
  groep.add(pionnen)
  for (let i = 0; i < 10; i++) deel(new THREE.BoxGeometry(0.03, 0.03, 0.7), new THREE.MeshBasicMaterial({ color: '#facc15', toneMapped: false }), cx + 6 + i * 0.5, 0.08, cz - 4)
  for (const sz of [-0.35, 0.35]) deel(new THREE.BoxGeometry(5, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: '#facc15', toneMapped: false }), cx + 8.25, 0.08, cz - 4 + sz)
  const kar = new THREE.Group()
  kar.position.set(cx - L / 2 + 4, 0, cz - W / 2 + 2)
  groep.add(kar)
  const bak = new THREE.Mesh(rondeDoos(1.2, 0.5, 0.8, 0.06), donker)
  bak.position.y = 0.6
  kar.add(bak)
  for (const [dx, dz] of [
    [-0.5, -0.32],
    [0.5, -0.32],
    [-0.5, 0.32],
    [0.5, 0.32],
  ]) {
    const wiel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 8, 16), donker)
    wiel.position.set(dx, 0.17, dz)
    kar.add(wiel)
  }
  const balGeo = krachtbalGeometrie(0.12, 0.4)
  const kleuren = ['#f97316', '#facc15', '#dc2626', '#2563eb', '#f8fafc']
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(balGeo, new THREE.MeshStandardMaterial({ map: krachtbalTextuur(kleuren[i % 5]), vertexColors: true, roughness: 0.55 }))
    b.position.set(-0.35 + (i % 3) * 0.35, 0.92 + Math.floor(i / 3) * 0.06, -0.2 + Math.floor(i / 3) * 0.2)
    b.rotation.set(i, i * 2, 0)
    kar.add(b)
  }
  // Een paar losse ballen op het veld.
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(balGeo, new THREE.MeshStandardMaterial({ map: krachtbalTextuur(kleuren[(i * 2) % 5]), vertexColors: true, roughness: 0.55 }))
    b.position.set(cx - 6 + i * 4.5, 0.19, cz - 5 + (i % 2) * 7)
    b.rotation.set(i * 1.3, i, 0)
    groep.add(b)
  }
  blok(kar.position.x - 0.7, kar.position.x + 0.7, kar.position.z - 0.5, kar.position.z + 0.5)

  // ---------- groen: hagen langs de rand, bomen, bankjes ----------
  const haag = new THREE.MeshLambertMaterial({ color: '#1f5130' })
  const haagStuk = (x0: number, x1: number, z0: number, z1: number) => {
    const m = new THREE.Mesh(rondeDoos(Math.max(0.9, x1 - x0), 1.2, Math.max(0.9, z1 - z0), 0.4), haag)
    m.position.set((x0 + x1) / 2, 0.6, (z0 + z1) / 2)
    groep.add(m)
    blok(Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1)
  }
  const H0 = OEFEN.x0 + 2
  const H1 = OEFEN.x1 - 2
  const Z0 = OEFEN.z0 + 2
  const Z1 = OEFEN.z1 + 1.5
  haagStuk(H0, H1, Z0 - 0.45, Z0 + 0.45)
  haagStuk(H0 - 0.45, H0 + 0.45, Z0, Z1)
  haagStuk(H1 - 0.45, H1 + 0.45, Z0, Z1)
  // Aan de pleinkant: twee stukken haag, met de poort ertussen.
  haagStuk(H0, cx - 3.4, Z1 - 0.45, Z1 + 0.45)
  haagStuk(cx + 3.4, H1, Z1 - 0.45, Z1 + 0.45)
  // Bomen in de hoeken en langs de rand (zachte, ronde kruinen).
  const stam = new THREE.MeshLambertMaterial({ color: '#4b3621' })
  const kruin = new THREE.MeshLambertMaterial({ color: '#2f6b3a' })
  for (const [x, z] of [
    [H0 + 3, Z0 + 3],
    [H1 - 3, Z0 + 3],
    [H0 + 3, Z1 - 4],
    [H0 + 3, cz],
    [H1 - 3, Z1 - 3],
    [cx - 20, Z0 + 3],
    [cx + 20, Z0 + 3],
  ]) {
    deel(new THREE.CylinderGeometry(0.2, 0.3, 3, 8), stam, x, 1.5, z)
    const k = deel(new THREE.SphereGeometry(2.1, 14, 10), kruin, x, 4.3, z)
    k.scale.set(1, 1.15, 1)
    blok(x - 0.4, x + 0.4, z - 0.4, z + 0.4)
  }
  const bank = rondeDoos(1.8, 0.1, 0.5, 0.04)
  for (const [x, z, ry] of [
    [cx - 16, cz + W / 2 + 2.6, 0],
    [cx + 16, cz + W / 2 + 2.6, 0],
    [cx - 4, padZ0 + 8, Math.PI / 2],
  ]) {
    const b = deel(bank, hout, x, 0.45, z)
    b.rotation.y = ry
    for (const sx of [-0.7, 0.7]) deel(new THREE.BoxGeometry(0.06, 0.45, 0.45), donker, x + (ry ? 0 : sx), 0.22, z + (ry ? sx : 0))
    blok(x - (ry ? 0.3 : 0.95), x + (ry ? 0.3 : 0.95), z - (ry ? 0.95 : 0.3), z + (ry ? 0.95 : 0.3))
  }
  // Een vlaggenmast met de clubvlag naast de poort.
  deel(new THREE.CylinderGeometry(0.05, 0.07, 8, 10), staal, cx + 5, 4, poortZ - 1.2)
  const vlag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4, 10, 4),
    new THREE.MeshStandardMaterial({
      map: tex(256, 160, (g) => {
        g.fillStyle = thema.primair
        g.fillRect(0, 0, 256, 160)
        g.fillStyle = thema.secundair
        g.fillRect(0, 60, 256, 40)
        g.fillStyle = thema.tekstOpPrimair
        g.font = '900 44px Inter, sans-serif'
        g.textAlign = 'center'
        g.fillText(thema.kort, 128, 52)
      }),
      side: THREE.DoubleSide,
    }),
  )
  vlag.position.set(cx + 6.15, 7.2, poortZ - 1.2)
  groep.add(vlag)
  blok(cx + 4.85, cx + 5.15, poortZ - 1.35, poortZ - 1.05)
  const vlagPos = (vlag.geometry.attributes.position as THREE.BufferAttribute).clone()

  void primair
  return {
    obstakels,
    update(s) {
      // De vlag wappert.
      const p = vlag.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const x = vlagPos.getX(i)
        const f = (x + 1.1) / 2.2
        p.setZ(i, Math.sin(s * 4 + x * 3) * 0.18 * f)
      }
      p.needsUpdate = true
      vlag.geometry.computeVertexNormals()
    },
  }
}
