import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { eigenHerkomst, lichtshow, type StadionThema, type Veld } from '@/lib/virtueel'

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

/** Een rechthoek op de grond (wereldcoördinaten) waar je niet door kan lopen. */
export type Obstakel = { x0: number; x1: number; z0: number; z1: number }

export type Stadion = {
  update: (seconden: number, info: ScoreInfo) => void
  obstakels: Obstakel[]
  /** Het clublogo (of null), één keer geladen en gedeeld met de buitenkant. */
  logo: Promise<HTMLImageElement | null>
  /** Het grote ledscherm achter de westtribune (midden, breedte, hoogte), voor de video erop. */
  scherm: { x: number; y: number; z: number; b: number; h: number }
}

const RIJ_DIEP = 0.85
const RIJ_HOOG = 0.42
const STOEL_BREED = 0.62

export function rnd(zaad: number) {
  let z = zaad
  return () => (z = (z * 16807) % 2147483647) / 2147483647
}

export function laadBeeld(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  return new Promise((ok) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => ok(img)
    // Lukt het (ook via de proxy) niet, dan valt het gewoon terug op de initialen.
    img.onerror = () => ok(null)
    // Een beeld van een andere website gaat via onze eigen logo-proxy (zie eigenHerkomst).
    img.src = eigenHerkomst(url, window.location.href)
  })
}

/** Teken een beeld passend (contain) in een kader. */
export function passend(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height)
  const bw = img.width * s
  const bh = img.height * s
  g.drawImage(img, x + (w - bw) / 2, y + (h - bh) / 2, bw, bh)
}

/**
 * De achtergrondkleur van een logo: de gemiddelde kleur van de vier hoeken, als die ondoorzichtig
 * zijn (een vierkant logo met een eigen vlak), anders null (een vrijstaand logo).
 */
const logoAchtergrond = new WeakMap<HTMLImageElement, string | null>()
function achtergrondVan(img: HTMLImageElement): string | null {
  if (logoAchtergrond.has(img)) return logoAchtergrond.get(img)!
  let kleur: string | null = null
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, 32, 32)
    const d = g.getImageData(0, 0, 32, 32).data
    let r = 0
    let gr = 0
    let b = 0
    let dicht = 0
    for (const [x, y] of [
      [1, 1],
      [30, 1],
      [1, 30],
      [30, 30],
    ]) {
      const i = (y * 32 + x) * 4
      r += d[i]
      gr += d[i + 1]
      b += d[i + 2]
      if (d[i + 3] > 200) dicht++
    }
    if (dicht === 4) kleur = `rgb(${Math.round(r / 4)},${Math.round(gr / 4)},${Math.round(b / 4)})`
  } catch {
    // Een logo van een andere herkomst kunnen we niet uitlezen: dan het vrijstaande geval.
  }
  logoAchtergrond.set(img, kleur)
  return kleur
}

export function rondLogo(g: CanvasRenderingContext2D, logo: HTMLImageElement | null, thema: StadionThema, cx: number, cy: number, r: number) {
  // Een vierkant logo met een eigen achtergrond vult de hele cirkel (de hoeken vallen weg), zodat
  // je geen vierkant in een rondje ziet; een vrijstaand logo staat op wit, met wat marge.
  const vlak = logo ? achtergrondVan(logo) : null
  g.save()
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fillStyle = vlak ?? '#ffffff'
  g.fill()
  g.clip()
  if (logo && vlak) {
    // Net genoeg vergroot dat het vierkant de cirkel bedekt, zonder het logo zelf te veel af te snijden.
    const z = r * 2.04
    passend(g, logo, cx - z / 2, cy - z / 2, z, z)
  } else if (logo) passend(g, logo, cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64)
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

export function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
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

  const obstakels: Obstakel[] = []
  const tijd = { value: 0 }
  /** Materiaal dat in de wind beweegt: `code` krijgt uTijd en de lokale positie. */
  const golfMat = (mat: THREE.Material, code: string) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTijd = tijd
      sh.vertexShader = 'uniform float uTijd;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`)
    }
    return mat
  }

  // Supportersspullen: wie een vlag of sjaal heeft (indexen in `mensen`), de tifo en spandoeken.
  const vlagDragers: number[] = []
  const sjaalDragers: number[] = []
  const doekTeken: ((logo: HTMLImageElement | null) => void)[] = []
  const kansVlag = licht ? 0.04 : 0.07
  const kansSjaal = licht ? 0.1 : 0.16

  // Afwerking van de tribunes: gedeelde materialen.
  const neusMat = new THREE.MeshLambertMaterial({ color: '#9ca3af' })
  const trapMat = new THREE.MeshLambertMaterial({ color: '#6b7280' })
  const geelMat = new THREE.MeshBasicMaterial({ color: '#facc15' })
  const glasMat = new THREE.MeshStandardMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.16, metalness: 0.3, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
  /** Gangpaden met trappen: om de ~10 m, niet te dicht bij de uiteinden. */
  const gangpaden = (lengte: number) => {
    const uit: number[] = []
    const n = Math.max(1, Math.round(lengte / 10))
    for (let k = 1; k < n; k++) uit.push(-lengte / 2 + (k * lengte) / n)
    return uit
  }
  // De ledband in de voormuur: een donkere band in clubkleur met lichtpulsen.
  const ledC = document.createElement('canvas')
  ledC.width = 256
  ledC.height = 8
  {
    const g = ledC.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 256, 0)
    const dim = '#' + primair.clone().multiplyScalar(0.35).getHexString()
    gr.addColorStop(0, dim)
    gr.addColorStop(0.42, dim)
    gr.addColorStop(0.5, '#ffffff')
    gr.addColorStop(0.58, thema.primair)
    gr.addColorStop(1, dim)
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 8)
  }
  const ledTex = canvasTex(ledC)
  ledTex.wrapS = THREE.RepeatWrapping
  const ledTexen: THREE.Texture[] = []
  const ledMats: THREE.MeshBasicMaterial[] = []

  const tribune = (lengte: number, rijen: number, pos: THREE.Vector3, ry: number, dak: boolean, extra: { tifo?: boolean; spandoeken?: string[] } = {}) => {
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

    // ---- afwerking ----
    // Lichte neuzen op elke trede, zodat de rijen als echte treden lezen.
    const neuzen: THREE.BufferGeometry[] = []
    for (let r = 0; r < rijen; r++) neuzen.push(new THREE.BoxGeometry(lengte, 0.04, 0.06).translate(0, voet + r * RIJ_HOOG - 0.02, -r * RIJ_DIEP + 0.02))
    groep.add(new THREE.Mesh(mergeGeometries(neuzen), neusMat))
    // Trappen in de gangpaden: een tussentrede per rij, met gele neuzen.
    const gangen = extra.tifo ? [] : gangpaden(lengte)
    if (gangen.length) {
      const treeGeo: THREE.BufferGeometry[] = []
      const geelGeo: THREE.BufferGeometry[] = []
      for (const gx of gangen) {
        for (let r = 0; r < rijen; r++) {
          const h = voet + r * RIJ_HOOG
          treeGeo.push(new THREE.BoxGeometry(1.1, RIJ_HOOG / 2, RIJ_DIEP / 2).translate(gx, h + RIJ_HOOG / 4, -r * RIJ_DIEP - RIJ_DIEP * 0.75))
          geelGeo.push(new THREE.BoxGeometry(1.1, 0.03, 0.05).translate(gx, h + RIJ_HOOG / 2 - 0.01, -r * RIJ_DIEP - RIJ_DIEP / 2 + 0.02))
          geelGeo.push(new THREE.BoxGeometry(1.1, 0.03, 0.05).translate(gx, h - 0.01, -r * RIJ_DIEP + 0.025))
        }
      }
      groep.add(new THREE.Mesh(mergeGeometries(treeGeo), trapMat), new THREE.Mesh(mergeGeometries(geelGeo), geelMat))
    }
    // Vooraan: een glazen balustrade met een geborstelde leuning, en een ledband in de voormuur
    // waarover een lichtpuls loopt (zie update).
    const glas = new THREE.Mesh(new THREE.PlaneGeometry(lengte, 0.95), glasMat)
    glas.position.set(0, voet + 0.5, 0.26)
    const leuning = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, lengte, 8).rotateZ(Math.PI / 2), metaal)
    leuning.position.set(0, voet + 1.0, 0.26)
    const staanders: THREE.BufferGeometry[] = []
    for (let x = -lengte / 2 + 0.5; x <= lengte / 2 - 0.5; x += 2.4) staanders.push(new THREE.BoxGeometry(0.05, 1.0, 0.05).translate(x, voet + 0.5, 0.26))
    const ledTexT = ledTex.clone()
    ledTexT.repeat.set(lengte / 6, 1)
    ledTexen.push(ledTexT)
    const led = new THREE.Mesh(new THREE.PlaneGeometry(lengte, 0.14), new THREE.MeshBasicMaterial({ map: ledTexT, toneMapped: false }))
    ledMats.push(led.material as THREE.MeshBasicMaterial)
    led.position.set(0, voet - 0.28, 0.305)
    groep.add(glas, leuning, new THREE.Mesh(mergeGeometries(staanders), metaal), led)

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
    if (extra.tifo) {
      // Reuzentifo over de hele tribune, langs de helling van de treden, met het logo en een tekst.
      const diepte = rijen * RIJ_DIEP
      const stijging = rijen * RIJ_HOOG
      const helling = Math.atan2(stijging, diepte)
      const hoogte = Math.hypot(diepte, stijging)
      const c = document.createElement('canvas')
      c.width = 2048
      c.height = Math.round((2048 * hoogte) / lengte)
      const tex = canvasTex(c)
      doekTeken.push((logo) => {
        const g = c.getContext('2d')!
        const W = c.width
        const H = c.height
        g.fillStyle = thema.primair
        g.fillRect(0, 0, W, H)
        // Stralen vanuit het logo.
        g.save()
        g.translate(W * 0.24, H * 0.5)
        g.fillStyle = thema.secundair
        g.globalAlpha = 0.18
        for (let i = 0; i < 24; i++) {
          g.rotate((Math.PI * 2) / 24)
          g.beginPath()
          g.moveTo(0, 0)
          g.lineTo(W, -H * 0.12)
          g.lineTo(W, H * 0.12)
          g.fill()
        }
        g.restore()
        g.fillStyle = thema.secundair
        g.fillRect(0, 0, W, H * 0.05)
        g.fillRect(0, H * 0.95, W, H * 0.05)
        rondLogo(g, logo, thema, W * 0.24, H * 0.5, H * 0.36)
        g.fillStyle = thema.tekstOpPrimair
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.font = `900 ${Math.round(H * 0.14)}px Inter, system-ui, sans-serif`
        g.fillText('SAMEN STERK', W * 0.68, H * 0.3, W * 0.56)
        g.font = `900 ${Math.round(H * 0.24)}px Inter, system-ui, sans-serif`
        g.fillText(thema.naam.toUpperCase(), W * 0.68, H * 0.58, W * 0.6)
        g.font = `800 ${Math.round(H * 0.08)}px Inter, system-ui, sans-serif`
        g.fillText('ONS STADION · ONZE CLUB · ONS VOLK', W * 0.68, H * 0.8, W * 0.56)
        tex.needsUpdate = true
      })
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(lengte * 0.98, hoogte, 48, 16),
        golfMat(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), 'transformed.z += sin(uTijd * 1.4 + position.x * 0.45 + position.y * 0.7) * 0.09 + sin(uTijd * 0.6 + position.x * 0.12) * 0.12;'),
      )
      mesh.rotation.x = -(Math.PI / 2 - helling)
      mesh.position.set(0, voet + stijging / 2 + 1.0, -diepte / 2)
      groep.add(mesh)
    }
    // Spandoeken over de voormuur, zoals supporters ze aan de reling hangen.
    const doeken = extra.spandoeken ?? []
    doeken.forEach((tekst, i) => {
      const c = document.createElement('canvas')
      c.width = 1024
      c.height = 160
      const omgekeerd = i % 2 === 1
      const g = c.getContext('2d')!
      g.fillStyle = omgekeerd ? thema.secundair : thema.primair
      g.fillRect(0, 0, 1024, 160)
      g.fillStyle = omgekeerd ? thema.primair : thema.secundair
      g.fillRect(0, 0, 1024, 12)
      g.fillRect(0, 148, 1024, 12)
      g.fillStyle = omgekeerd ? thema.primair : thema.tekstOpPrimair
      g.font = '900 92px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(tekst, 512, 84, 980)
      const breed = Math.min(10, lengte / (doeken.length + 1))
      const doek = new THREE.Mesh(new THREE.PlaneGeometry(breed, breed * 0.16, 12, 1), golfMat(new THREE.MeshLambertMaterial({ map: canvasTex(c) }), 'transformed.z += sin(uTijd * 2.0 + position.x * 0.8) * 0.03;'))
      doek.position.set(-lengte / 2 + ((i + 1) * lengte) / (doeken.length + 1), voet + 0.15, 0.32)
      doek.rotation.x = -0.12
      groep.add(doek)
    })
    scene.add(groep)
    groep.updateMatrixWorld(true)
    // De voetafdruk van de tribune (voormuur tot achterwand) als obstakel voor wie rondloopt.
    const hoeken = [
      [-lengte / 2, 0.35],
      [lengte / 2, 0.35],
      [-lengte / 2, -rijen * RIJ_DIEP - 0.9],
      [lengte / 2, -rijen * RIJ_DIEP - 0.9],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(groep.matrixWorld))
    obstakels.push({
      x0: Math.min(...hoeken.map((v) => v.x)),
      x1: Math.max(...hoeken.map((v) => v.x)),
      z0: Math.min(...hoeken.map((v) => v.z)),
      z1: Math.max(...hoeken.map((v) => v.z)),
    })

    // Stoeltjes en mensen: posities in wereldcoördinaten verzamelen voor de InstancedMeshes.
    const perRij = Math.floor((lengte - 1.4) / STOEL_BREED)
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))
    const een = new THREE.Vector3(1, 1, 1)
    const vrij = extra.tifo ? [] : gangpaden(lengte)
    for (let r = 0; r < rijen; r++) {
      for (let i = 0; i < perRij; i++) {
        const lx = -lengte / 2 + 0.7 + i * STOEL_BREED + STOEL_BREED / 2
        if (vrij.some((gx) => Math.abs(lx - gx) < 0.75)) continue
        p.set(lx, voet + r * RIJ_HOOG, -r * RIJ_DIEP - RIJ_DIEP * 0.45).applyMatrix4(groep.matrixWorld)
        stoelen.push(new THREE.Matrix4().compose(p.clone(), q, een))
        // Stoeltjes in clubkleur, met brede banen in de tweede kleur.
        stoelKleur.push(Math.floor(i / 6) % 4 === 1 ? secundair : primair)
        // Onder de tifo zit wel volk, maar je ziet het niet: niemand neerzetten.
        if (!extra.tifo && willekeur() < bezetting) {
          const m = new THREE.Matrix4().compose(
            p.clone().add(new THREE.Vector3((willekeur() - 0.5) * 0.08, 0.05, 0)),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry + (willekeur() - 0.5) * 0.5, 0)),
            new THREE.Vector3(1, 0.9 + willekeur() * 0.2, 1),
          )
          mensen.push(m)
          const k = willekeur()
          shirt.push(k < 0.55 ? primair : k < 0.75 ? secundair : neutraal[Math.floor(willekeur() * neutraal.length)])
          huid.push(huidtinten[Math.floor(willekeur() * huidtinten.length)])
          const w = willekeur()
          if (w < kansVlag) vlagDragers.push(mensen.length - 1)
          else if (w < kansVlag + kansSjaal) sjaalDragers.push(mensen.length - 1)
        }
      }
    }
  }

  const voor = 1.4
  tribune(2 * hx + 4, licht ? 12 : 16, new THREE.Vector3(0, 0, -hz - voor), 0, true, { spandoeken: ['ALLEZ ALLEZ!', thema.naam.toUpperCase(), 'TROTS OP ONZE CLUB'] })
  tribune(2 * hx + 4, licht ? 8 : 11, new THREE.Vector3(0, 0, hz + voor), Math.PI, false, { spandoeken: ['WIJ ZIJN ER ALTIJD', '♥ ONZE CLUB ♥', 'NOOIT OPGEVEN'] })
  // Achter het oostelijke doelgebied: de tifo.
  tribune(2 * hz - 3, licht ? 6 : 8, new THREE.Vector3(hx + voor, 0, 0), -Math.PI / 2, false, { tifo: true })
  // De eindtribunes zijn iets korter: zo blijft er in elke hoek een doorgang van het veld naar de
  // gangen achter de tribunes. Achter de westkant staat het grote ledscherm: daar een lagere tribune.
  tribune(2 * hz - 3, licht ? 4 : 5, new THREE.Vector3(-hx - voor, 0, 0), Math.PI / 2, false)

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

  // Publiek: juichen + een wave die rond het stadion trekt, helemaal in de shader. `extra` komt
  // erbij voor wat de supporters vasthouden (een vlag wappert).
  const juich = (mat: THREE.Material, extra = '') => {
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
        transformed.y += sprong + golf * 0.25;
        ${extra}`,
      )
    }
    return mat
  }
  const lijfGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 6).translate(0, 0.72, 0)
  // Op de tribune zie je het publiek van ver: een hoofd met zes zijden volstaat (de helft van de driehoeken).
  const hoofdGeo = new THREE.SphereGeometry(0.11, 6, 4).translate(0, 1.16, 0)
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

  // Vlaggen en sjaals in het publiek: ze bewegen mee met wie ze vasthoudt (zelfde shader), de
  // vlaggen wapperen bovendien.
  const vlagC = document.createElement('canvas')
  vlagC.width = 256
  vlagC.height = 168
  const vlagTex = canvasTex(vlagC)
  doekTeken.push((logo) => {
    const g = vlagC.getContext('2d')!
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 256, 168)
    g.fillStyle = thema.secundair
    g.beginPath()
    g.moveTo(0, 120)
    g.lineTo(256, 30)
    g.lineTo(256, 70)
    g.lineTo(0, 160)
    g.fill()
    rondLogo(g, logo, thema, 128, 84, 46)
    vlagTex.needsUpdate = true
  })
  const vlagGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.02, 0.02, 1.9, 5).translate(0.22, 1.8, 0.1),
    new THREE.PlaneGeometry(1.45, 0.95, 10, 2).translate(0.22 + 0.725, 2.25, 0.1),
  ])
  const vlaggen = new THREE.InstancedMesh(
    vlagGeo,
    juich(
      new THREE.MeshLambertMaterial({ map: vlagTex, side: THREE.DoubleSide }),
      'float doek = max(0.0, position.x - 0.22); transformed.z += sin(uTijd * 6.0 + position.x * 4.0 + fase) * 0.16 * doek; transformed.x -= abs(sin(uTijd * 3.0 + fase)) * 0.05 * doek;',
    ),
    vlagDragers.length,
  )
  vlagDragers.forEach((mi, i) => vlaggen.setMatrixAt(i, mensen[mi]))
  // De stok heeft geen textuur nodig; het doek laat de vlag zien (de uv van de stok valt op de rand).
  vlaggen.frustumCulled = false
  const sjaals = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.95, 0.13, 0.03).translate(0, 1.5, 0.06),
    juich(new THREE.MeshLambertMaterial(), 'transformed.y += sin(uTijd * 4.0 + fase) * 0.05;'),
    sjaalDragers.length,
  )
  sjaalDragers.forEach((mi, i) => {
    sjaals.setMatrixAt(i, mensen[mi])
    sjaals.setColorAt(i, i % 3 === 0 ? secundair : primair)
  })
  sjaals.frustumCulled = false
  scene.add(vlaggen, sjaals)

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
  // Zichtbare lichtbundels van elke mast naar het veld (nep-licht, additief).
  const bundelC = document.createElement('canvas')
  bundelC.width = 8
  bundelC.height = 256
  const bg = bundelC.getContext('2d')!
  const bgr = bg.createLinearGradient(0, 0, 0, 256)
  bgr.addColorStop(0, 'rgba(255,248,225,0)')
  bgr.addColorStop(1, 'rgba(255,248,225,.35)')
  bg.fillStyle = bgr
  bg.fillRect(0, 0, 8, 256)
  const bundelMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bundelC), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const masten: { lamp: THREE.MeshBasicMaterial; halo: THREE.Sprite; spot: THREE.SpotLight; bundel: THREE.Mesh }[] = []
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
    // De bundel van de lampkop naar het midden van het veld.
    const naarVeld = new THREE.Vector3(mx * 0.35, 0, mz * 0.35).sub(kop.position)
    const lengte = naarVeld.length()
    const bundel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 9, lengte, 20, 1, true).translate(0, -lengte / 2, 0), bundelMat.clone())
    bundel.position.copy(kop.position)
    bundel.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), naarVeld.normalize())
    masten.push({ lamp, halo, spot, bundel })
    scene.add(paal, kop, halo, spot, spot.target, bundel)
  }

  // ---------- het veld: lichtplassen van de masten en dug-outs ----------
  const plasMat = new THREE.MeshBasicMaterial({ map: gloed, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const plassen = masten.map((m) => {
    const plas = new THREE.Mesh(new THREE.CircleGeometry(13, 32).rotateX(-Math.PI / 2), plasMat.clone())
    plas.position.set(m.halo.position.x * 0.35, 0.025, m.halo.position.z * 0.35)
    scene.add(plas)
    return plas
  })
  // Twee dug-outs langs de lange zijde: een bank met kuipstoeltjes onder een gebogen plexi kap.
  const plexi = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.22, metalness: 0.2, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
  for (const dx of [-7, 7]) {
    const g = new THREE.Group()
    g.position.set(dx, 0, -hz + 0.9)
    const vloer = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 1.5), donker)
    vloer.position.y = 0.04
    const rug = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 0.08), donker)
    rug.position.set(0, 0.8, -0.72)
    const kap = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 4.4, 20, 1, true, 0, Math.PI / 2).rotateZ(Math.PI / 2).rotateX(Math.PI), plexi)
    kap.position.set(0, 0.35, 0.73)
    const rand = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 0.08), clubMat)
    rand.position.set(0, 1.8, -0.72)
    g.add(vloer, rug, kap, rand)
    for (let i = 0; i < 7; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.45), clubMat)
      st.position.set(-1.8 + i * 0.6, 0.3, -0.42)
      g.add(st)
    }
    scene.add(g)
  }

  // ---------- sfeer: rookwaas, fotoflitsen en bengaals vuur ----------
  // Een zachte waas boven het veld en de tribunes, die traag drijft en in de lichtbundels oplicht.
  const rookC = document.createElement('canvas')
  rookC.width = rookC.height = 128
  {
    const g = rookC.getContext('2d')!
    const r = rnd(77)
    for (let i = 0; i < 26; i++) {
      const x = 30 + r() * 68
      const y = 30 + r() * 68
      const rr = 16 + r() * 30
      const gr = g.createRadialGradient(x, y, 0, x, y, rr)
      gr.addColorStop(0, 'rgba(255,255,255,.22)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 128, 128)
    }
  }
  const rookTex = new THREE.CanvasTexture(rookC)
  const waas: { sprite: THREE.Sprite; basis: THREE.Vector3; fase: number }[] = []
  const rw = rnd(31)
  for (let i = 0; i < (licht ? 4 : 11); i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: rookTex, color: '#e8eef8', transparent: true, opacity: 0.12 + rw() * 0.07, depthWrite: false }))
    const basis = new THREE.Vector3((rw() - 0.5) * 2 * (hx + 4), 5 + rw() * 9, (rw() - 0.5) * 2 * (hz + 6))
    sprite.scale.setScalar(18 + rw() * 14)
    sprite.position.copy(basis)
    waas.push({ sprite, basis, fase: rw() * 10 })
    scene.add(sprite)
  }
  // Fotoflitsen in het publiek: telkens een paar willekeurige supporters.
  const flitsMat = new THREE.SpriteMaterial({ map: gloed, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const flitsen = Array.from({ length: licht ? 4 : 10 }, () => {
    const sp = new THREE.Sprite(flitsMat)
    sp.scale.setScalar(1.1)
    sp.visible = false
    scene.add(sp)
    return { sp, tot: 0 }
  })
  const mensPos = (i: number) => new THREE.Vector3().setFromMatrixPosition(mensen[i]).add(new THREE.Vector3(0, 1.5, 0))
  // Bengaals vuur (tijdens de lichtshow) op de zuidtribune: een felle gloed en rook in de clubkleur
  // die opstijgt en uitwaaiert.
  const fakkels: { gloed: THREE.Sprite; rook: THREE.Sprite[]; pos: THREE.Vector3 }[] = []
  const fakkelGloed = new THREE.SpriteMaterial({ map: gloed, color: '#ff5a3c', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const rookKleur = primair.clone().lerp(new THREE.Color('#ffffff'), 0.25)
  // In de gangpaden van de zuidtribune, hoog boven de hoofden gehouden: zo zie je ze ook van ver.
  const fakkelX = gangpaden(2 * hx + 4).filter((_, k, alle) => !licht || k % 2 === 0 || alle.length < 3)
  for (const fx of fakkelX) {
    const pos = new THREE.Vector3(fx, 1.1 + 3 * RIJ_HOOG + 2.1, hz + voor + 3 * RIJ_DIEP)
    const g = new THREE.Sprite(fakkelGloed)
    g.position.copy(pos)
    g.visible = false
    const rook = Array.from({ length: 5 }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: rookTex, color: rookKleur, transparent: true, opacity: 0, depthWrite: false }))
      sp.position.copy(pos)
      scene.add(sp)
      return sp
    })
    scene.add(g)
    fakkels.push({ gloed: g, rook, pos })
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
  // Tifo en vlaggen meteen tekenen (met initialen); met het logo opnieuw zodra dat geladen is.
  for (const teken of doekTeken) teken(null)
  const logo = laadBeeld(thema.logoUrl)
  void Promise.all([logo, Promise.all(thema.reclames.slice(0, 8).map((r) => laadBeeld(r.url)))]).then(([logo, ads]) => {
    logoBeeld = logo
    tekenReclame(logo, ads)
    tekenScherm(logo)
    for (const teken of doekTeken) teken(logo)
  })

  let laatsteBord = -1
  const wit = new THREE.Color('#fff7e0')
  const showKleur = new THREE.Color(thema.primair)
  return {
    obstakels,
    logo,
    scherm: { x: schermX + 0.2, y: 11, z: 0, b: 19.2, h: 10.8 },
    update(seconden, info) {
      tijd.value = seconden
      const off = (seconden * 0.025) % 1
      reclameTex.offset.x = off
      reclameTexKort.offset.x = off
      // Het ledscherm "ademt" zacht.
      schermMat.color.setScalar(0.88 + 0.12 * Math.sin(seconden * 1.6))
      // Ledbanden in de voormuren van de tribunes: een lopende lichtpuls; tijdens de show flitsend.
      const showNu = lichtshow(seconden)
      for (const t of ledTexen) t.offset.x = (seconden * 0.6) % 1
      for (const m of ledMats) m.color.setScalar(showNu >= 0 ? (Math.floor(seconden * 8) % 2 ? 1.6 : 0.4) : 1)
      // De waas drijft traag over het stadion.
      for (const w of waas) {
        w.sprite.position.set(
          w.basis.x + Math.sin(seconden * 0.05 + w.fase) * 6,
          w.basis.y + Math.sin(seconden * 0.08 + w.fase * 2) * 1.2,
          w.basis.z + Math.cos(seconden * 0.04 + w.fase) * 4,
        )
        w.sprite.material.rotation = seconden * 0.01 + w.fase
      }
      // Fotoflitsen: af en toe ergens in het publiek, tijdens de show veel meer.
      if (mensen.length) {
        for (const f of flitsen) {
          if (f.sp.visible && seconden > f.tot) f.sp.visible = false
          if (!f.sp.visible && Math.random() < (showNu >= 0 ? 0.25 : 0.012)) {
            f.sp.position.copy(mensPos(Math.floor(Math.random() * mensen.length)))
            f.sp.visible = true
            f.tot = seconden + 0.07
          }
        }
      }
      // Bengaals vuur: brandt tijdens de show, de rook stijgt op en hangt nog even na.
      const fase = (((seconden - 12) % 30) + 30) % 30
      fakkels.forEach((f, k) => {
        const brandt = fase < 4.5
        f.gloed.visible = brandt
        if (brandt) f.gloed.scale.setScalar(2.2 + Math.sin(seconden * 40 + k) * 0.35 + Math.random() * 0.3)
        f.rook.forEach((sp, j) => {
          const t = fase - j * 0.5
          const zicht = t > 0 && t < 11 ? Math.min(1, t / 1.2) * Math.min(1, (11 - t) / 4) : 0
          sp.material.opacity = 0.32 * zicht
          sp.position.set(f.pos.x + Math.sin(t * 0.6 + k) * 0.8, f.pos.y + 0.4 + t * 1.1, f.pos.z + t * 0.35)
          sp.scale.setScalar(1.2 + t * 0.9)
        })
      })
      // De lichtmasten leven mee: een zachte gloed die ademt, en tijdens de lichtshow flitsen ze
      // om beurten, de bundels kleuren mee in de clubkleur.
      const show = lichtshow(seconden)
      masten.forEach((m, i) => {
        const bm = m.bundel.material as THREE.MeshBasicMaterial
        if (show >= 0) {
          // Om beurten, rond het veld.
          const aan = Math.floor(show * 14) % masten.length === i ? 1 : 0.25
          m.spot.intensity = 420 * aan + 80
          m.halo.scale.setScalar(10 + 12 * aan)
          m.lamp.color.copy(aan > 0.5 ? showKleur : wit)
          bm.color.copy(showKleur)
          bm.opacity = 0.2 + 0.4 * aan
          ;(plassen[i].material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.2 * aan
        } else {
          const adem = 0.5 + 0.5 * Math.sin(seconden * 0.8 + i * 1.6)
          m.spot.intensity = 400 + 40 * adem
          m.halo.scale.setScalar(13 + 2.5 * adem)
          m.lamp.color.copy(wit)
          bm.color.copy(wit)
          bm.opacity = 0.22 + 0.1 * adem
          ;(plassen[i].material as THREE.MeshBasicMaterial).opacity = 0.13 + 0.04 * adem
        }
      })
      if (seconden - laatsteBord > 0.25) {
        laatsteBord = seconden
        tekenScorebord(info)
      }
    },
  }
}
