import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, inPoort, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { canvasTex, rnd, rondLogo } from './stadion'

// De aankleding rond het stadion: wat een wedstrijddag speciaal maakt nog vóór je binnen bent.
// Een welkomstboog en een loper in clubkleur naar de hoofdingang, lichtslingers, een frituur, een
// bar en een fanshop met wachtende supporters, een zingende groep met sjaals omhoog, lange
// banieren aan de gevel, lichtbundels die door de lucht zwaaien en af en toe vuurwerk in de
// clubkleuren.
//
// Zelfde regels als stadion.ts en omgeving.ts: herhaling = InstancedMesh, beweging in de shader;
// enkel het vuurwerk wordt in JavaScript bijgewerkt (een paar honderd punten).

export type Sfeer = { update: (seconden: number, dt: number) => void; obstakels: Rechthoek[] }

function canvas(w: number, h: number, teken: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  return c
}

function metTijd(mat: THREE.Material, tijd: { value: number }, code: string): THREE.Material {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTijd = tijd
    sh.vertexShader = 'uniform float uTijd;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`)
  }
  return mat
}

export function bouwSfeer(scene: THREE.Scene, opt: { thema: StadionThema; licht: boolean; logo: Promise<HTMLImageElement | null> }): Sfeer {
  const { thema, licht } = opt
  const { A, B } = GEVEL
  const toeval = rnd(5150)
  const tijd = { value: 0 }
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)
  const goud = new THREE.Color('#fcd34d')
  const obstakels: Rechthoek[] = []
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const metaal = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.6, roughness: 0.4 })
  const clubMat = new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.15 })

  // ---------- loper en welkomstboog ----------
  const loper = new THREE.Mesh(new THREE.PlaneGeometry(5, 27), new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.12 }))
  loper.rotation.x = -Math.PI / 2
  loper.position.set(0, 0.02, B + 14.5)
  const loperRand = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 27), new THREE.MeshLambertMaterial({ color: secundair }))
  loperRand.rotation.x = -Math.PI / 2
  loperRand.position.set(0, 0.015, B + 14.5)
  scene.add(loperRand, loper)

  const boogZ = B + 24
  for (const x of [-8, 8]) {
    const pijler = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 1.2), clubMat)
    pijler.position.set(x, 4, boogZ)
    const voet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), metaal)
    voet.position.set(x, 0.3, boogZ)
    scene.add(pijler, voet)
    obstakels.push({ x0: x - 0.8, x1: x + 0.8, z0: boogZ - 0.8, z1: boogZ + 0.8 })
  }
  const boogC = document.createElement('canvas')
  boogC.width = 1024
  boogC.height = 160
  const boogTex = canvasTex(boogC)
  const tekenBoog = (logo: HTMLImageElement | null) => {
    const g = boogC.getContext('2d')!
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 1024, 160)
    g.strokeStyle = thema.primair
    g.lineWidth = 10
    g.strokeRect(5, 5, 1014, 150)
    rondLogo(g, logo, thema, 86, 80, 60)
    g.fillStyle = 'rgba(255,255,255,.75)'
    g.font = '800 30px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('WELKOM IN STADION', 168, 52)
    g.fillStyle = '#ffffff'
    g.font = '900 62px Inter, system-ui, sans-serif'
    g.fillText(thema.naam.toUpperCase(), 168, 108, 820)
    boogTex.needsUpdate = true
  }
  tekenBoog(null)
  const boogBord = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 2.7), new THREE.MeshBasicMaterial({ map: boogTex, toneMapped: false, side: THREE.DoubleSide }))
  boogBord.position.set(0, 8.6, boogZ)
  const boogBalk = new THREE.Mesh(new THREE.BoxGeometry(17.6, 3, 0.4), clubMat)
  boogBalk.position.set(0, 8.6, boogZ - 0.25)
  scene.add(boogBalk, boogBord)
  // Achterkant van de boog (wie het stadion verlaat) toont het bord ook.
  const boogTerug = boogBord.clone()
  boogTerug.position.z = boogZ - 0.47
  boogTerug.rotation.y = Math.PI
  scene.add(boogTerug)

  // ---------- lichtslingers boven de toegang ----------
  const lampjes: number[] = []
  const lampKleur: number[] = []
  const kabel: number[] = []
  const slinger = (a: THREE.Vector3, b: THREE.Vector3, doorhang: number, n: number) => {
    let vorig: THREE.Vector3 | null = null
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p = a.clone().lerp(b, t)
      p.y -= Math.sin(Math.PI * t) * doorhang
      if (vorig) kabel.push(vorig.x, vorig.y, vorig.z, p.x, p.y, p.z)
      vorig = p
      if (i > 0 && i < n) {
        lampjes.push(p.x, p.y - 0.12, p.z)
        const k = i % 3 === 0 ? primair : i % 3 === 1 ? goud : secundair
        lampKleur.push(k.r, k.g, k.b)
      }
    }
  }
  for (let z = B + 7; z < boogZ; z += 4.2) slinger(new THREE.Vector3(-11, 7.4, z), new THREE.Vector3(11, 7.4, z + 2.1), 1.3, 22)
  slinger(new THREE.Vector3(-11, 7.4, B + 7), new THREE.Vector3(-11, 7.4, boogZ - 1), 0.9, 24)
  slinger(new THREE.Vector3(11, 7.4, B + 7), new THREE.Vector3(11, 7.4, boogZ - 1), 0.9, 24)
  const kabelGeo = new THREE.BufferGeometry()
  kabelGeo.setAttribute('position', new THREE.Float32BufferAttribute(kabel, 3))
  scene.add(new THREE.LineSegments(kabelGeo, new THREE.LineBasicMaterial({ color: '#1f2937' })))
  const bolC = canvas(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.25, 'rgba(255,255,255,.7)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  })
  const bolTex = new THREE.CanvasTexture(bolC)
  const lampGeo = new THREE.BufferGeometry()
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampjes, 3))
  lampGeo.setAttribute('color', new THREE.Float32BufferAttribute(lampKleur, 3))
  scene.add(new THREE.Points(lampGeo, new THREE.PointsMaterial({ map: bolTex, size: 0.9, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))

  // ---------- frituur, bar en fanshop ----------
  const stand = (x: number, z: number, ry: number, tekst: string, icoon: string) => {
    const groep = new THREE.Group()
    groep.position.set(x, 0, z)
    groep.rotation.y = ry
    const romp = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3, 2.8), new THREE.MeshLambertMaterial({ color: '#e5e7eb' }))
    romp.position.y = 1.7
    const band = new THREE.Mesh(new THREE.BoxGeometry(6.45, 0.7, 2.85), clubMat)
    band.position.y = 0.55
    const wielen = new THREE.Mesh(
      mergeGeometries([-2, 2].map((wx) => new THREE.CylinderGeometry(0.4, 0.4, 2.9, 12).rotateX(Math.PI / 2).translate(wx, 0.4, 0))),
      new THREE.MeshLambertMaterial({ color: '#111827' }),
    )
    const luik = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.3), new THREE.MeshBasicMaterial({ color: '#fde68a', toneMapped: false }))
    luik.position.set(0, 2, 1.41)
    // Gestreepte luifel in de clubkleuren.
    const luifelC = canvas(256, 32, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? thema.secundair : thema.primair
        g.fillRect(i * 32, 0, 32, 32)
      }
    })
    const luifel = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.08, 1.4), new THREE.MeshLambertMaterial({ map: canvasTex(luifelC) }))
    luifel.position.set(0, 2.95, 2)
    luifel.rotation.x = 0.22
    const bordC = canvas(512, 96, (g) => {
      g.fillStyle = thema.primair
      g.fillRect(0, 0, 512, 96)
      g.fillStyle = thema.tekstOpPrimair
      g.font = '900 54px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(`${icoon} ${tekst}`, 256, 52)
    })
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1), new THREE.MeshBasicMaterial({ map: canvasTex(bordC), toneMapped: false }))
    bord.position.set(0, 3.75, 1.2)
    const bordSteun = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.15, 0.2), new THREE.MeshLambertMaterial({ color: '#111827' }))
    bordSteun.position.set(0, 3.75, 1.08)
    groep.add(romp, band, wielen, luik, luifel, bordSteun, bord)
    scene.add(groep)
    // Obstakel: de wagen staat dwars of langs, ruw als een vierkant van 6.4 m.
    obstakels.push({ x0: x - 3.4, x1: x + 3.4, z0: z - 3.4, z1: z + 3.4 })
    // Waar de wachtrij staat (voor het luik).
    const v = new THREE.Vector3(0, 0, 3.4).applyAxisAngle(Y, ry)
    return { x: x + v.x, z: z + v.z, ry }
  }
  const rijen = [
    stand(27, B + 14, -Math.PI / 2 + 0.35, 'FRITUUR', '🍟'),
    stand(28, B + 23, -Math.PI / 2 + 0.2, 'BAR', '🍺'),
    stand(-27, B + 15, Math.PI / 2 - 0.3, 'FANSHOP', '🧣'),
  ]

  // ---------- supporters: wachtrijen en een zingende groep met sjaals ----------
  const huid = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'].map((c) => new THREE.Color(c))
  const neutraal = ['#1f2937', '#e5e7eb', '#374151', '#0f172a'].map((c) => new THREE.Color(c))
  const lijfGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.17, 0.2, 0.75, 7).translate(0, 1.0, 0),
    new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5).translate(0.09, 0.35, 0),
    new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5).translate(-0.09, 0.35, 0),
  ])
  const hoofdGeo = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.52, 0)
  const mensen: { x: number; z: number; ry: number; zingt: boolean }[] = []
  for (const r of rijen) {
    const n = 4 + Math.floor(toeval() * 4)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((toeval() - 0.5) * 0.4, 0, i * 0.85).applyAxisAngle(Y, r.ry)
      mensen.push({ x: r.x + v.x, z: r.z + v.z, ry: r.ry + Math.PI, zingt: false })
    }
  }
  const groepN = licht ? 28 : 60
  for (let i = 0; i < groepN; i++) {
    const a = toeval() * Math.PI * 2
    const r = Math.sqrt(toeval()) * 5
    mensen.push({ x: -14 + Math.cos(a) * r, z: B + 9 + Math.sin(a) * r * 0.7, ry: Math.atan2(-14 - (-14 + Math.cos(a) * r), 0) + Math.PI + (toeval() - 0.5), zingt: true })
  }
  // Springen en zingen: wie zingt huppelt, de rest wiegt zacht.
  const beweeg = `vec3 plekS = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
    float faseS = fract(sin(dot(plekS.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
    transformed.y += max(0.0, sin(uTijd * 6.0 + faseS)) * 0.18 * step(1.04, instanceMatrix[1][1]);
    transformed.x += sin(uTijd * 1.3 + faseS) * 0.03;`
  const lijven = new THREE.InstancedMesh(lijfGeo, metTijd(new THREE.MeshLambertMaterial(), tijd, beweeg), mensen.length)
  const hoofden = new THREE.InstancedMesh(hoofdGeo, metTijd(new THREE.MeshLambertMaterial(), tijd, beweeg), mensen.length)
  const sjaalGeo = new THREE.BoxGeometry(1.1, 0.16, 0.03).translate(0, 2.05, 0.08)
  const zangers = mensen.filter((m) => m.zingt)
  const sjaals = new THREE.InstancedMesh(sjaalGeo, metTijd(new THREE.MeshLambertMaterial(), tijd, beweeg), zangers.length)
  const armGeo = mergeGeometries([new THREE.CylinderGeometry(0.05, 0.05, 0.62, 5).translate(0.42, 1.72, 0.05), new THREE.CylinderGeometry(0.05, 0.05, 0.62, 5).translate(-0.42, 1.72, 0.05)])
  const armen = new THREE.InstancedMesh(armGeo, metTijd(new THREE.MeshLambertMaterial(), tijd, beweeg), zangers.length)
  let zi = 0
  mensen.forEach((m, i) => {
    // Schaal y > 1.04 betekent "zingt" (zie de shader): zo kost het geen extra attribuut.
    const sy = m.zingt ? 1.06 + toeval() * 0.08 : 0.92 + toeval() * 0.1
    m4.compose(new THREE.Vector3(m.x, 0, m.z), q.setFromAxisAngle(Y, m.ry), new THREE.Vector3(1, sy, 1))
    lijven.setMatrixAt(i, m4)
    hoofden.setMatrixAt(i, m4)
    const k = toeval()
    lijven.setColorAt(i, k < 0.65 ? primair : k < 0.85 ? secundair : neutraal[Math.floor(toeval() * neutraal.length)])
    hoofden.setColorAt(i, huid[Math.floor(toeval() * huid.length)])
    if (m.zingt) {
      sjaals.setMatrixAt(zi, m4)
      armen.setMatrixAt(zi, m4)
      sjaals.setColorAt(zi, zi % 3 === 0 ? secundair : primair)
      armen.setColorAt(zi, huid[Math.floor(toeval() * huid.length)])
      zi++
    }
  })
  for (const x of [lijven, hoofden, sjaals, armen]) x.frustumCulled = false
  scene.add(lijven, hoofden, sjaals, armen)

  // ---------- banieren aan de gevel ----------
  // Een gestikte stadionbanier: verloop in clubkleur, biezen in de tweede kleur, het clublogo in een
  // medaillon, een chevronmotief en een zwaluwstaart onderaan. Geen tekst: het logo zegt genoeg.
  const banierC = document.createElement('canvas')
  banierC.width = 256
  banierC.height = 1024
  const banierTex = canvasTex(banierC)
  const tekenBanier = (logo: HTMLImageElement | null) => {
    const g = banierC.getContext('2d')!
    g.clearRect(0, 0, 256, 1024)
    const donker = '#' + primair.clone().multiplyScalar(0.55).getHexString()
    const gr = g.createLinearGradient(0, 0, 0, 1024)
    gr.addColorStop(0, thema.primair)
    gr.addColorStop(1, donker)
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 1024)
    // Zachte stofglans van links naar rechts.
    const glans = g.createLinearGradient(0, 0, 256, 0)
    glans.addColorStop(0, 'rgba(0,0,0,.18)')
    glans.addColorStop(0.45, 'rgba(255,255,255,.10)')
    glans.addColorStop(1, 'rgba(0,0,0,.22)')
    g.fillStyle = glans
    g.fillRect(0, 0, 256, 1024)
    // Biezen en een kopstrook in de tweede kleur.
    g.fillStyle = thema.secundair
    g.fillRect(0, 0, 256, 40)
    g.fillRect(16, 40, 6, 984)
    g.fillRect(234, 40, 6, 984)
    // Stiksel langs de rand.
    g.strokeStyle = 'rgba(255,255,255,.35)'
    g.setLineDash([10, 8])
    g.lineWidth = 2
    g.strokeRect(30, 52, 196, 860)
    g.setLineDash([])
    // Het logo in een medaillon met een ring in de tweede kleur.
    g.fillStyle = thema.secundair
    g.beginPath()
    g.arc(128, 250, 104, 0, Math.PI * 2)
    g.fill()
    rondLogo(g, logo, thema, 128, 250, 94)
    // Chevrons.
    g.strokeStyle = thema.secundair
    g.lineWidth = 14
    g.lineJoin = 'miter'
    for (const y of [470, 540, 610]) {
      g.globalAlpha = y === 540 ? 0.9 : 0.55
      g.beginPath()
      g.moveTo(60, y)
      g.lineTo(128, y + 46)
      g.lineTo(196, y)
      g.stroke()
    }
    g.globalAlpha = 1
    // Zwaluwstaart: een V uit de onderkant knippen.
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    g.moveTo(0, 1024)
    g.lineTo(128, 900)
    g.lineTo(256, 1024)
    g.closePath()
    g.fill()
    g.globalCompositeOperation = 'source-over'
    banierTex.needsUpdate = true
  }
  tekenBanier(null)
  void opt.logo.then((logo) => {
    tekenBoog(logo)
    tekenBanier(logo)
  })
  const banierPlek: THREE.Matrix4[] = []
  const { R } = GEVEL
  const zijden: [number, number, number, number, number][] = [
    // x, z, normaal-x, normaal-z, lengte langs de zijde (rechte stukken)
    [0, B, 0, 1, 2 * (A - R)],
    [0, -B, 0, -1, 2 * (A - R)],
    [A, 0, 1, 0, 2 * (B - R)],
    [-A, 0, -1, 0, 2 * (B - R)],
  ]
  for (const [cx, cz, nx, nz, len] of zijden) {
    for (let s = -len / 2 + 6; s <= len / 2 - 6; s += 11) {
      const x = cx + (nz !== 0 ? s : 0) + nx * 2.2
      const z = cz + (nx !== 0 ? s : 0) + nz * 2.2
      if (inPoort(GEVEL, x - nx * 2.2, z - nz * 2.2) || inPoort(GEVEL, x - nx * 2.2 + (nz !== 0 ? 3 : 0), z - nz * 2.2 + (nx !== 0 ? 3 : 0)) || inPoort(GEVEL, x - nx * 2.2 - (nz !== 0 ? 3 : 0), z - nz * 2.2 - (nx !== 0 ? 3 : 0))) continue
      banierPlek.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 6.4, z), q.setFromAxisAngle(Y, Math.atan2(nx, nz)).clone(), new THREE.Vector3(1, 1, 1)))
    }
  }
  const banieren = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.4, 8.4, 1, 8),
    metTijd(new THREE.MeshLambertMaterial({ map: banierTex, emissive: '#ffffff', emissiveMap: banierTex, emissiveIntensity: 0.35, side: THREE.DoubleSide, alphaTest: 0.5 }), tijd, 'transformed.z += sin(uTijd * 1.4 + position.y * 0.6 + instanceMatrix[3][0]) * 0.08 * (4.2 - position.y) / 8.4;'),
    banierPlek.length,
  )
  banierPlek.forEach((m, i) => banieren.setMatrixAt(i, m))
  banieren.frustumCulled = false
  // Een geborstelde stang bovenaan met twee armpjes naar de gevel.
  const stang = new THREE.InstancedMesh(
    mergeGeometries([
      new THREE.CylinderGeometry(0.05, 0.05, 2.8, 10).rotateZ(Math.PI / 2).translate(0, 4.26, 0),
      new THREE.SphereGeometry(0.08, 10, 8).translate(-1.42, 4.26, 0),
      new THREE.SphereGeometry(0.08, 10, 8).translate(1.42, 4.26, 0),
      new THREE.BoxGeometry(0.05, 0.05, 1.4).translate(-0.9, 4.26, -0.7),
      new THREE.BoxGeometry(0.05, 0.05, 1.4).translate(0.9, 4.26, -0.7),
    ]),
    new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.85, roughness: 0.3, emissive: '#374151', emissiveIntensity: 0.4 }),
    banierPlek.length,
  )
  banierPlek.forEach((m, i) => stang.setMatrixAt(i, m))
  scene.add(banieren, stang)

  // ---------- lichtbundels die door de lucht zwaaien ----------
  const bundelC = canvas(4, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128)
    gr.addColorStop(0, 'rgba(255,255,255,0)')
    gr.addColorStop(1, 'rgba(255,255,255,.55)')
    g.fillStyle = gr
    g.fillRect(0, 0, 4, 128)
  })
  const bundelTex = new THREE.CanvasTexture(bundelC)
  const bundelGeo = new THREE.CylinderGeometry(5, 0.4, 110, 20, 1, true).translate(0, 55, 0)
  const bundels: { obj: THREE.Mesh; fase: number }[] = []
  ;[
    [-A - 6, B + 6, primair],
    [A + 6, B + 6, secundair],
    [-A - 6, -B - 6, secundair],
    [A + 6, -B - 6, primair],
  ].forEach(([x, z, kleur], i) => {
    const obj = new THREE.Mesh(
      bundelGeo,
      new THREE.MeshBasicMaterial({ map: bundelTex, color: kleur as THREE.Color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    obj.position.set(x as number, 0, z as number)
    scene.add(obj)
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1, 12), metaal)
    lamp.position.set(x as number, 0.5, z as number)
    scene.add(lamp)
    bundels.push({ obj, fase: i * 1.7 })
  })

  // ---------- vuurwerk ----------
  const N = licht ? 240 : 520
  const pos = new Float32Array(N * 3)
  const kleur = new Float32Array(N * 3)
  const snel = new Float32Array(N * 3)
  const leeftijd = new Float32Array(N).fill(99)
  const vuurGeo = new THREE.BufferGeometry()
  vuurGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  vuurGeo.setAttribute('color', new THREE.BufferAttribute(kleur, 3))
  const vuurwerk = new THREE.Points(
    vuurGeo,
    new THREE.PointsMaterial({ map: bolTex, size: 1.6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  )
  vuurwerk.frustumCulled = false
  scene.add(vuurwerk)
  let volgende = 2
  let vrij = 0
  const knal = () => {
    const cx = (toeval() - 0.5) * A * 1.6
    const cz = (toeval() - 0.5) * B * 1.4
    const cy = 42 + toeval() * 22
    const kleuren = [primair, secundair, goud]
    const k = kleuren[Math.floor(toeval() * kleuren.length)]
    const n = Math.floor(N / 4)
    for (let j = 0; j < n; j++) {
      const i = (vrij + j) % N
      const th = toeval() * Math.PI * 2
      const ph = Math.acos(2 * toeval() - 1)
      const v = 11 + toeval() * 4
      pos.set([cx, cy, cz], i * 3)
      snel.set([Math.sin(ph) * Math.cos(th) * v, Math.cos(ph) * v, Math.sin(ph) * Math.sin(th) * v], i * 3)
      kleur.set([k.r, k.g, k.b], i * 3)
      leeftijd[i] = 0
    }
    vrij = (vrij + n) % N
  }

  return {
    obstakels,
    update(seconden, dt) {
      tijd.value = seconden
      for (const b of bundels) {
        b.obj.rotation.z = Math.sin(seconden * 0.35 + b.fase) * 0.45
        b.obj.rotation.x = Math.cos(seconden * 0.27 + b.fase) * 0.3
      }
      volgende -= dt
      if (volgende <= 0) {
        knal()
        volgende = 2.2 + toeval() * 3
      }
      for (let i = 0; i < N; i++) {
        if (leeftijd[i] > 3) {
          pos[i * 3 + 1] = -500
          continue
        }
        leeftijd[i] += dt
        snel[i * 3] *= 0.97
        snel[i * 3 + 1] = snel[i * 3 + 1] * 0.97 - 6 * dt
        snel[i * 3 + 2] *= 0.97
        pos[i * 3] += snel[i * 3] * dt
        pos[i * 3 + 1] += snel[i * 3 + 1] * dt
        pos[i * 3 + 2] += snel[i * 3 + 2] * dt
        // Uitdoven: de kleur naar zwart (additief = onzichtbaar).
        const f = Math.max(0, 1 - leeftijd[i] / 3)
        kleur[i * 3] *= 0.985 + 0.015 * f
        kleur[i * 3 + 1] *= 0.985 + 0.015 * f
        kleur[i * 3 + 2] *= 0.985 + 0.015 * f
      }
      vuurGeo.attributes.position.needsUpdate = true
      vuurGeo.attributes.color.needsUpdate = true
    },
  }
}
