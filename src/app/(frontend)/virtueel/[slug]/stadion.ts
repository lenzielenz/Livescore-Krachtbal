import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { StadionThema, Veld } from '@/lib/virtueel'

// Het stadion rond het veld van Virtueel krachtbal, in de kleuren van de club die kijkt: tribunes
// met stoeltjes en publiek, een overdekte hoofdtribune met de clubnaam, ledborden met de reclame
// van de schermen, een groot ledscherm met het clublogo en een wedstrijdscorebord.
//
// Alles is gebouwd om vlot te lopen, ook op een gsm:
//  • het publiek is één InstancedMesh (lijven) + één (hoofden): twee tekenopdrachten voor duizenden
//    mensen. Het juichen en de wave gebeuren in de vertex-shader, niet in JavaScript;
//  • de betonnen treden van een tribune zijn samengevoegd tot één geometrie;
//  • de ledborden schuiven door enkel de textuur te verschuiven; het scorebord wordt hooguit vier
//    keer per seconde hertekend.

export type ScoreInfo = {
  tijd: number
  duur: number
  bezit: [number, number] | null
  ploegen: { naam: string; kleur: string }[]
}

export type Stadion = { update: (seconden: number, info: ScoreInfo) => void }

const RIJ_DIEP = 0.85
const RIJ_HOOG = 0.42
const STOEL_BREED = 0.62

function rnd(zaad: number) {
  let z = zaad
  return () => (z = (z * 16807) % 2147483647) / 2147483647
}

function laadBeeld(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  return new Promise((ok) => {
    const img = new Image()
    // Anders mag een logo van een andere website niet in een WebGL-textuur; zonder toestemming van
    // die site valt het gewoon terug op de initialen.
    img.crossOrigin = 'anonymous'
    img.onload = () => ok(img)
    img.onerror = () => ok(null)
    img.src = url
  })
}

/** Teken een beeld passend (contain) in een kader. */
function passend(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height)
  const bw = img.width * s
  const bh = img.height * s
  g.drawImage(img, x + (w - bw) / 2, y + (h - bh) / 2, bw, bh)
}

function rondLogo(g: CanvasRenderingContext2D, logo: HTMLImageElement | null, thema: StadionThema, cx: number, cy: number, r: number) {
  g.save()
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fillStyle = '#ffffff'
  g.fill()
  g.clip()
  if (logo) passend(g, logo, cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64)
  else {
    g.fillStyle = thema.primair
    g.font = `900 ${Math.round(r * 0.8)}px Inter, system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(thema.kort, cx, cy + r * 0.04)
  }
  g.restore()
  g.lineWidth = r * 0.08
  g.strokeStyle = thema.secundair
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.stroke()
}

function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function bouwStadion(
  scene: THREE.Scene,
  opt: { veld: Veld; marge: number; thema: StadionThema; licht: boolean },
): Stadion {
  const { veld, marge, thema, licht } = opt
  const hx = veld.length_m / 2 + marge
  const hz = veld.width_m / 2 + marge
  const willekeur = rnd(4242)
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)

  const beton = new THREE.MeshLambertMaterial({ color: '#4b5563' })
  const donker = new THREE.MeshLambertMaterial({ color: '#111827' })
  const metaal = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.6, roughness: 0.4 })
  const clubMat = new THREE.MeshLambertMaterial({ color: primair })

  // ---------- reclameborden rond het veld ----------
  const rc = document.createElement('canvas')
  rc.width = 2048
  rc.height = 128
  const reclameTex = canvasTex(rc)
  reclameTex.wrapS = THREE.RepeatWrapping
  const reclameTexKort = reclameTex.clone()
  const tekenReclame = (logo: HTMLImageElement | null, ads: (HTMLImageElement | null)[]) => {
    const g = rc.getContext('2d')!
    type Vak = { soort: 'club' } | { soort: 'kl' } | { soort: 'ad'; img: HTMLImageElement; naam: string }
    const echt = ads.map((img, i) => (img ? { soort: 'ad' as const, img, naam: thema.reclames[i]?.naam ?? '' } : null)).filter((x): x is Extract<Vak, { soort: 'ad' }> => x != null)
    const vakken: Vak[] = []
    if (echt.length === 0) vakken.push({ soort: 'club' }, { soort: 'kl' }, { soort: 'club' }, { soort: 'kl' })
    else for (let i = 0; i < Math.max(3, echt.length); i++) vakken.push({ soort: 'club' }, echt[i % echt.length])
    const w = rc.width / vakken.length
    vakken.forEach((v, i) => {
      const x = i * w
      if (v.soort === 'ad') {
        g.fillStyle = '#ffffff'
        g.fillRect(x, 0, w, 128)
        passend(g, v.img, x + 12, 10, w - 24, 108)
      } else if (v.soort === 'club') {
        g.fillStyle = thema.primair
        g.fillRect(x, 0, w, 128)
        rondLogo(g, logo, thema, x + 64, 64, 46)
        g.fillStyle = thema.tekstOpPrimair
        g.font = '900 46px Inter, system-ui, sans-serif'
        g.textBaseline = 'middle'
        g.textAlign = 'left'
        g.fillText(thema.naam.toUpperCase(), x + 124, 66, w - 140)
      } else {
        g.fillStyle = '#0b1220'
        g.fillRect(x, 0, w, 128)
        g.fillStyle = '#e2f0ff'
        g.font = '900 44px Inter, system-ui, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('KRACHTBAL LIVE', x + w / 2, 66, w - 30)
      }
      g.fillStyle = 'rgba(0,0,0,.5)'
      g.fillRect(x + w - 3, 0, 3, 128)
    })
    reclameTex.needsUpdate = true
    reclameTexKort.needsUpdate = true
  }
  tekenReclame(null, [])
  reclameTex.repeat.set(1.6, 1)
  reclameTexKort.repeat.set(0.6, 1)
  const bordMat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, toneMapped: false })
  const bordLang = bordMat(reclameTex)
  const bordKort = bordMat(reclameTexKort)
  const bord = (lengte: number, mat: THREE.Material, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lengte, 0.95, 0.14), [donker, donker, donker, donker, mat, donker])
    m.position.set(x, 0.48, z)
    m.rotation.y = ry
    scene.add(m)
  }
  bord(2 * hx, bordLang, 0, -hz - 0.4, 0)
  bord(2 * hx, bordLang, 0, hz + 0.4, Math.PI)
  bord(2 * hz, bordKort, -hx - 0.4, 0, Math.PI / 2)
  bord(2 * hz, bordKort, hx + 0.4, 0, -Math.PI / 2)

  // ---------- tribunes, stoeltjes en publiek ----------
  // Een tribune in lokale coördinaten: de lengte langs x, de rijen lopen naar achter (-z) en omhoog.
  const stoelen: THREE.Matrix4[] = []
  const stoelKleur: THREE.Color[] = []
  const mensen: THREE.Matrix4[] = []
  const shirt: THREE.Color[] = []
  const huid: THREE.Color[] = []
  const neutraal = ['#1f2937', '#e5e7eb', '#374151', '#0f172a', '#7c2d12', '#334155'].map((c) => new THREE.Color(c))
  const huidtinten = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'].map((c) => new THREE.Color(c))
  const bezetting = licht ? 0.45 : 0.78

  const tribune = (lengte: number, rijen: number, pos: THREE.Vector3, ry: number, dak: boolean) => {
    const groep = new THREE.Group()
    groep.position.copy(pos)
    groep.rotation.y = ry
    const voet = 1.1
    const treden: THREE.BufferGeometry[] = []
    const voorMuur = new THREE.BoxGeometry(lengte, voet, 0.3)
    voorMuur.translate(0, voet / 2, 0.15)
    treden.push(voorMuur)
    for (let r = 0; r < rijen; r++) {
      const h = voet + r * RIJ_HOOG
      const b = new THREE.BoxGeometry(lengte, h, RIJ_DIEP)
      b.translate(0, h / 2, -r * RIJ_DIEP - RIJ_DIEP / 2)
      treden.push(b)
    }
    const achterH = voet + rijen * RIJ_HOOG + (dak ? 5.2 : 1.6)
    const muur = new THREE.BoxGeometry(lengte, achterH, 0.4)
    muur.translate(0, achterH / 2, -rijen * RIJ_DIEP - 0.2)
    treden.push(muur)
    const trap = new THREE.Mesh(mergeGeometries(treden), beton)
    trap.receiveShadow = !licht
    groep.add(trap)

    // Achterwand in clubkleur met de clubnaam, zichtbaar boven de laatste rij.
    const wc = document.createElement('canvas')
    wc.width = 2048
    wc.height = 160
    const wg = wc.getContext('2d')!
    wg.fillStyle = thema.primair
    wg.fillRect(0, 0, 2048, 160)
    wg.fillStyle = thema.tekstOpPrimair
    wg.font = '900 96px Inter, system-ui, sans-serif'
    wg.textAlign = 'center'
    wg.textBaseline = 'middle'
    wg.fillText(thema.naam.toUpperCase(), 1024, 86, 1900)
    const wandH = dak ? 2.4 : 1.2
    const wand = new THREE.Mesh(new THREE.PlaneGeometry(lengte * 0.96, wandH), new THREE.MeshBasicMaterial({ map: canvasTex(wc), toneMapped: false }))
    wand.position.set(0, voet + rijen * RIJ_HOOG + wandH / 2 + 0.3, -rijen * RIJ_DIEP + 0.01)
    groep.add(wand)

    if (dak) {
      const diep = rijen * RIJ_DIEP + 3
      const dakH = achterH + 0.2
      const plaat = new THREE.Mesh(new THREE.BoxGeometry(lengte + 2, 0.3, diep), new THREE.MeshLambertMaterial({ color: '#1f2937' }))
      plaat.position.set(0, dakH, -diep / 2 + 2.6)
      plaat.rotation.x = -0.06
      const rand = new THREE.Mesh(new THREE.BoxGeometry(lengte + 2, 0.9, 0.35), clubMat)
      rand.position.set(0, dakH - 0.05, 2.7)
      const lichtlijn = new THREE.Mesh(new THREE.BoxGeometry(lengte, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: '#fff7e0', toneMapped: false }))
      lichtlijn.position.set(0, dakH - 0.55, 2.55)
      groep.add(plaat, rand, lichtlijn)
      for (let x = -lengte / 2 + 4; x <= lengte / 2 - 4; x += 12) {
        const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, dakH, 8), metaal)
        paal.position.set(x, dakH / 2, -rijen * RIJ_DIEP - 0.5)
        groep.add(paal)
      }
    }
    scene.add(groep)
    groep.updateMatrixWorld(true)

    // Stoeltjes en mensen: posities in wereldcoördinaten verzamelen voor de InstancedMeshes.
    const perRij = Math.floor((lengte - 1.4) / STOEL_BREED)
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))
    const een = new THREE.Vector3(1, 1, 1)
    for (let r = 0; r < rijen; r++) {
      for (let i = 0; i < perRij; i++) {
        const lx = -lengte / 2 + 0.7 + i * STOEL_BREED + STOEL_BREED / 2
        p.set(lx, voet + r * RIJ_HOOG, -r * RIJ_DIEP - RIJ_DIEP * 0.45).applyMatrix4(groep.matrixWorld)
        stoelen.push(new THREE.Matrix4().compose(p.clone(), q, een))
        // Stoeltjes in clubkleur, met brede banen in de tweede kleur.
        stoelKleur.push(Math.floor(i / 6) % 4 === 1 ? secundair : primair)
        if (willekeur() < bezetting) {
          const m = new THREE.Matrix4().compose(
            p.clone().add(new THREE.Vector3((willekeur() - 0.5) * 0.08, 0.05, 0)),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry + (willekeur() - 0.5) * 0.5, 0)),
            new THREE.Vector3(1, 0.9 + willekeur() * 0.2, 1),
          )
          mensen.push(m)
          const k = willekeur()
          shirt.push(k < 0.55 ? primair : k < 0.75 ? secundair : neutraal[Math.floor(willekeur() * neutraal.length)])
          huid.push(huidtinten[Math.floor(willekeur() * huidtinten.length)])
        }
      }
    }
  }

  const voor = 1.4
  tribune(2 * hx + 4, licht ? 12 : 16, new THREE.Vector3(0, 0, -hz - voor), 0, true)
  tribune(2 * hx + 4, licht ? 8 : 11, new THREE.Vector3(0, 0, hz + voor), Math.PI, false)
  tribune(2 * hz, licht ? 6 : 8, new THREE.Vector3(hx + voor, 0, 0), -Math.PI / 2, false)
  // Achter de westkant staat het grote ledscherm: daar een lagere tribune.
  tribune(2 * hz, licht ? 4 : 5, new THREE.Vector3(-hx - voor, 0, 0), Math.PI / 2, false)

  const stoelGeo = mergeGeometries([
    new THREE.BoxGeometry(0.46, 0.08, 0.42).translate(0, 0.38, 0),
    new THREE.BoxGeometry(0.46, 0.42, 0.06).translate(0, 0.6, -0.2),
  ])
  const stoelMesh = new THREE.InstancedMesh(stoelGeo, new THREE.MeshLambertMaterial(), stoelen.length)
  stoelen.forEach((m, i) => {
    stoelMesh.setMatrixAt(i, m)
    stoelMesh.setColorAt(i, stoelKleur[i])
  })
  scene.add(stoelMesh)

  // Publiek: juichen + een wave die rond het stadion trekt, helemaal in de shader.
  const tijd = { value: 0 }
  const juich = (mat: THREE.Material) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTijd = tijd
      sh.vertexShader = 'uniform float uTijd;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 plek = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float fase = fract(sin(dot(plek.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        float hoek = atan(plek.z, plek.x);
        float golf = smoothstep(0.7, 1.0, sin(uTijd * 0.8 - hoek * 3.0));
        float sprong = (0.03 + 0.42 * golf) * max(0.0, sin(uTijd * (4.0 + fase * 0.4) + fase));
        transformed.y += sprong + golf * 0.25;`,
      )
    }
    return mat
  }
  const lijfGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 7).translate(0, 0.72, 0)
  const hoofdGeo = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 1.16, 0)
  const lijven = new THREE.InstancedMesh(lijfGeo, juich(new THREE.MeshLambertMaterial()), mensen.length)
  const hoofden = new THREE.InstancedMesh(hoofdGeo, juich(new THREE.MeshLambertMaterial()), mensen.length)
  mensen.forEach((m, i) => {
    lijven.setMatrixAt(i, m)
    hoofden.setMatrixAt(i, m)
    lijven.setColorAt(i, shirt[i])
    hoofden.setColorAt(i, huid[i])
  })
  // De wiebel in de shader verschuift ze een beetje: de grenzen niet laten afknippen.
  lijven.frustumCulled = false
  hoofden.frustumCulled = false
  scene.add(lijven, hoofden)

  // ---------- lichtmasten op de hoeken ----------
  const gloedC = document.createElement('canvas')
  gloedC.width = gloedC.height = 64
  const gg = gloedC.getContext('2d')!
  const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,248,220,1)')
  gr.addColorStop(1, 'rgba(255,248,220,0)')
  gg.fillStyle = gr
  gg.fillRect(0, 0, 64, 64)
  const gloed = new THREE.CanvasTexture(gloedC)
  for (const [mx, mz] of [[-hx - 9, -hz - 14], [hx + 9, -hz - 14], [-hx - 9, hz + 12], [hx + 9, hz + 12]] as const) {
    const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 26, 8), metaal)
    paal.position.set(mx, 13, mz)
    // Donkere behuizing; enkel de kant naar het veld (+z na lookAt) licht op.
    const lamp = new THREE.MeshBasicMaterial({ color: '#fff7e0', toneMapped: false })
    const kop = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.5), [donker, donker, donker, donker, lamp, donker])
    kop.position.set(mx, 26.5, mz)
    kop.lookAt(0, 0, 0)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gloed, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    halo.scale.set(14, 14, 1)
    halo.position.copy(kop.position)
    const spot = new THREE.SpotLight('#fff2d6', 420, 120, 0.6, 0.6, 1.4)
    spot.position.copy(kop.position)
    scene.add(paal, kop, halo, spot, spot.target)
  }

  // ---------- groot ledscherm met het clublogo (west) ----------
  const sc = document.createElement('canvas')
  sc.width = 1024
  sc.height = 576
  const schermTex = canvasTex(sc)
  const tekenScherm = (logo: HTMLImageElement | null) => {
    const g = sc.getContext('2d')!
    const bg = g.createRadialGradient(512, 260, 40, 512, 288, 620)
    bg.addColorStop(0, thema.primair)
    bg.addColorStop(1, '#05070c')
    g.fillStyle = bg
    g.fillRect(0, 0, 1024, 576)
    // stralen
    g.save()
    g.translate(512, 250)
    g.globalAlpha = 0.12
    g.fillStyle = thema.secundair
    for (let i = 0; i < 16; i++) {
      g.rotate((Math.PI * 2) / 16)
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(700, -60)
      g.lineTo(700, 60)
      g.fill()
    }
    g.restore()
    g.shadowColor = thema.secundair
    g.shadowBlur = 40
    rondLogo(g, logo, thema, 512, 240, 170)
    g.shadowBlur = 0
    g.fillStyle = '#ffffff'
    g.font = '900 64px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(thema.naam.toUpperCase(), 512, 485, 960)
    g.font = '700 26px Inter, system-ui, sans-serif'
    g.fillStyle = 'rgba(255,255,255,.75)'
    g.fillText('WELKOM IN HET STADION', 512, 538)
    schermTex.needsUpdate = true
  }
  tekenScherm(null)
  const schermMat = new THREE.MeshBasicMaterial({ map: schermTex, toneMapped: false })
  const schermX = -hx - voor - (licht ? 4 : 5) * RIJ_DIEP - 3
  const scherm = new THREE.Mesh(new THREE.PlaneGeometry(19.2, 10.8), schermMat)
  scherm.position.set(schermX + 0.2, 11, 0)
  scherm.rotation.y = Math.PI / 2
  const schermKader = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11.6, 20), donker)
  schermKader.position.set(schermX - 0.1, 11, 0)
  scene.add(scherm, schermKader)
  for (const z of [-6, 6]) {
    const poot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), metaal)
    poot.position.set(schermX - 0.2, 3, z)
    scene.add(poot)
  }

  // ---------- wedstrijdscorebord (oost) ----------
  const bc = document.createElement('canvas')
  bc.width = 1024
  bc.height = 400
  const bordTex = canvasTex(bc)
  let logoBeeld: HTMLImageElement | null = null
  const tekenScorebord = (info: ScoreInfo) => {
    const g = bc.getContext('2d')!
    g.fillStyle = '#05070c'
    g.fillRect(0, 0, 1024, 400)
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 1024, 84)
    rondLogo(g, logoBeeld, thema, 46, 42, 32)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 40px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    g.fillText(thema.naam.toUpperCase(), 92, 44, 640)
    g.textAlign = 'right'
    g.font = '800 26px Inter, system-ui, sans-serif'
    g.fillText('VIRTUEEL KRACHTBAL', 1000, 44)
    // Ploegen en klok.
    const [a, b] = info.ploegen
    g.textAlign = 'center'
    for (const [p, x] of [[a, 190], [b, 834]] as const) {
      if (!p) continue
      g.fillStyle = p.kleur
      g.fillRect(x - 150, 112, 300, 10)
      g.fillStyle = '#ffffff'
      g.font = '800 36px Inter, system-ui, sans-serif'
      g.fillText(p.naam.toUpperCase(), x, 160, 330)
    }
    const s = Math.floor(info.tijd)
    g.fillStyle = '#fde047'
    g.font = '900 96px "Courier New", monospace'
    g.fillText(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, 512, 170)
    // Balbezit.
    g.fillStyle = 'rgba(255,255,255,.7)'
    g.font = '800 28px Inter, system-ui, sans-serif'
    g.fillText('BALBEZIT', 512, 270)
    const bz = info.bezit
    if (bz && a && b) {
      const breed = 760
      const x0 = 132
      g.fillStyle = a.kleur
      g.fillRect(x0, 300, breed * bz[0], 40)
      g.fillStyle = b.kleur
      g.fillRect(x0 + breed * bz[0], 300, breed * bz[1], 40)
      g.fillStyle = '#ffffff'
      g.font = '900 36px Inter, system-ui, sans-serif'
      g.textAlign = 'right'
      g.fillText(`${Math.round(bz[0] * 100)}%`, x0 - 12, 322)
      g.textAlign = 'left'
      g.fillText(`${Math.round(bz[1] * 100)}%`, x0 + breed + 12, 322)
    }
    bordTex.needsUpdate = true
  }
  const bordX = hx + voor + (licht ? 6 : 8) * RIJ_DIEP + 2.5
  const scorebord = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.47), new THREE.MeshBasicMaterial({ map: bordTex, toneMapped: false }))
  scorebord.position.set(bordX - 0.2, 9.5, 0)
  scorebord.rotation.y = -Math.PI / 2
  const bordKader = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.1, 14.6), clubMat)
  bordKader.position.set(bordX + 0.1, 9.5, 0)
  scene.add(scorebord, bordKader)
  for (const z of [-4.5, 4.5]) {
    const poot = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7, 0.45), metaal)
    poot.position.set(bordX + 0.1, 3.5, z)
    scene.add(poot)
  }

  // Logo en reclames laden; daarna de borden opnieuw tekenen.
  void Promise.all([laadBeeld(thema.logoUrl), Promise.all(thema.reclames.slice(0, 8).map((r) => laadBeeld(r.url)))]).then(([logo, ads]) => {
    logoBeeld = logo
    tekenReclame(logo, ads)
    tekenScherm(logo)
  })

  let laatsteBord = -1
  return {
    update(seconden, info) {
      tijd.value = seconden
      const off = (seconden * 0.025) % 1
      reclameTex.offset.x = off
      reclameTexKort.offset.x = off
      // Het ledscherm "ademt" zacht.
      schermMat.color.setScalar(0.88 + 0.12 * Math.sin(seconden * 1.6))
      if (seconden - laatsteBord > 0.25) {
        laatsteBord = seconden
        tekenScorebord(info)
      }
    },
  }
}
