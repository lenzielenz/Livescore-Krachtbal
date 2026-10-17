import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Voertuigen met een echte vorm in plaats van blokken: een zijprofiel met wielkasten, uitgesneden en
// afgerond, dat naar het dak en naar de neus toe smaller wordt; getinte ruiten met een dak erop,
// banden met velgen, koplampen en achterlichten, spiegels, een grille en een donkere onderkant.
// De lak is metallic en weerspiegelt een nachtelijke omgeving (straatlampen, een donkerblauwe
// lucht): dat geeft het "gelakte" gevoel zonder echte lampen.
//
// Vlot: elk onderdeel is één geometrie; op de parking is elk onderdeel één InstancedMesh voor alle
// auto's van dat model (de lakkleur per auto zit in de instance-kleur). De omgeving is één kleine
// textuur, gedeeld door alle voertuigen.
//
// Assenstelsel van een auto: de neus wijst naar +z, de breedte ligt langs x, de wielen staan op y = 0.

export type AutoModel = 'sedan' | 'suv'

/** De nachtelijke omgeving voor lak en ruiten: donkere lucht, een horizon met warme straatlampen. */
let nachtEnv: THREE.Texture | null = null
export function nachtOmgeving(): THREE.Texture {
  if (nachtEnv) return nachtEnv
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  const lucht = g.createLinearGradient(0, 0, 0, 128)
  lucht.addColorStop(0, '#0a1630')
  lucht.addColorStop(0.42, '#1d3768')
  lucht.addColorStop(0.5, '#3a4a66')
  lucht.addColorStop(0.53, '#141922')
  lucht.addColorStop(1, '#07090c')
  g.fillStyle = lucht
  g.fillRect(0, 0, 256, 128)
  // Straatlampen en verlichte gevels aan de horizon.
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * 256 + 6
    const r = g.createRadialGradient(x, 60, 0, x, 60, 12)
    r.addColorStop(0, 'rgba(255,236,196,1)')
    r.addColorStop(1, 'rgba(255,226,170,0)')
    g.fillStyle = r
    g.fillRect(x - 13, 47, 26, 26)
  }
  // Een brede lichtstrook boven (de stadionverlichting), voor een glanslijn over het dak.
  g.fillStyle = 'rgba(220,232,255,.55)'
  g.fillRect(0, 10, 256, 6)
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  nachtEnv = t
  return t
}

export type Materialen = {
  lak: THREE.MeshStandardMaterial
  glas: THREE.MeshStandardMaterial
  band: THREE.MeshLambertMaterial
  velg: THREE.MeshStandardMaterial
  zwart: THREE.MeshLambertMaterial
  chroom: THREE.MeshStandardMaterial
  koplamp: THREE.MeshBasicMaterial
  achterlicht: THREE.MeshBasicMaterial
}

export function voertuigMaterialen(lakKleur?: THREE.ColorRepresentation): Materialen {
  const env = nachtOmgeving()
  return {
    // Metallic lak met een blanke laklaag: weinig ruw, dus scherpe glanslijnen van de omgeving.
    lak: new THREE.MeshStandardMaterial({ color: lakKleur ?? '#ffffff', metalness: 0.5, roughness: 0.18, envMap: env, envMapIntensity: 1.7 }),
    // Getint glas dat de lucht en de lampen weerspiegelt, zodat je de ramen ziet tegen de lak.
    glas: new THREE.MeshStandardMaterial({ color: '#2a3648', metalness: 1, roughness: 0.04, envMap: env, envMapIntensity: 2.4 }),
    chroom: new THREE.MeshStandardMaterial({ color: '#e2e6ec', metalness: 1, roughness: 0.15, envMap: env, envMapIntensity: 1.6 }),
    band: new THREE.MeshLambertMaterial({ color: '#151618' }),
    velg: new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 1, roughness: 0.3, envMap: env, envMapIntensity: 1.2 }),
    zwart: new THREE.MeshLambertMaterial({ color: '#0d0f12' }),
    koplamp: new THREE.MeshBasicMaterial({ color: '#dfe7f2' }),
    achterlicht: new THREE.MeshBasicMaterial({ color: '#c0121d' }),
  }
}

/** Een zijprofiel (u = lengte, v = hoogte) uitrekken over de breedte, met afgeronde randen. */
function profiel(punten: (s: THREE.Shape) => void, breedte: number, rond: number, segmenten = 6): THREE.BufferGeometry {
  const s = new THREE.Shape()
  punten(s)
  const g = new THREE.ExtrudeGeometry(s, { depth: breedte - 2 * rond, bevelEnabled: rond > 0, bevelThickness: rond, bevelSize: rond * 0.8, bevelSegments: 2, curveSegments: segmenten })
  // Uitgerekt langs z: draai zodat de lengte langs z ligt en de breedte langs x, gecentreerd.
  g.translate(0, 0, -(breedte - 2 * rond) / 2)
  g.rotateY(-Math.PI / 2)
  return g
}

/** Naar boven en aan de uiteinden smaller (de zijkanten hellen in, de neus is rond in bovenaanzicht). */
function boetseer(g: THREE.BufferGeometry, o: { lengte: number; gordel: number; dak: number; inloop: number; neus: number }) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const hoog = THREE.MathUtils.smoothstep(y, o.gordel - 0.25, o.dak)
    const eind = Math.pow(Math.min(1, Math.abs(z) / (o.lengte / 2)), 6)
    p.setX(i, x * (1 - o.inloop * hoog) * (1 - o.neus * eind))
  }
  g.computeVertexNormals()
}

export type AutoDelen = { lak: THREE.BufferGeometry; glas: THREE.BufferGeometry; chroom: THREE.BufferGeometry; band: THREE.BufferGeometry; velg: THREE.BufferGeometry; zwart: THREE.BufferGeometry; koplamp: THREE.BufferGeometry; achterlicht: THREE.BufferGeometry }

const cache = new Map<AutoModel, AutoDelen>()

/** De onderdelen van een auto, per materiaal samengevoegd. */
export function autoDelen(model: AutoModel): AutoDelen {
  const bestaand = cache.get(model)
  if (bestaand) return bestaand
  const suv = model === 'suv'
  const L = suv ? 4.6 : 4.5
  const W = suv ? 1.86 : 1.8
  const wielR = suv ? 0.36 : 0.33
  const bodem = suv ? 0.3 : 0.2
  const gordel = suv ? 1.12 : 0.95
  const dakH = suv ? 1.72 : 1.44
  const voorAs = L / 2 - 0.85
  const achterAs = -L / 2 + 0.9
  const kast = wielR + 0.07

  // Het lijf: bumper, motorkap, kofferdeksel, met de twee wielkasten uit de onderrand gesneden.
  const lijf = profiel(
    (s) => {
      const h = L / 2
      s.moveTo(-h + 0.12, bodem)
      s.lineTo(achterAs - kast, bodem)
      s.absarc(achterAs, wielR, kast, Math.PI, 0, true)
      s.lineTo(voorAs - kast, bodem)
      s.absarc(voorAs, wielR, kast, Math.PI, 0, true)
      s.lineTo(h - 0.1, bodem)
      s.quadraticCurveTo(h + 0.02, bodem + 0.05, h, bodem + 0.32)
      s.quadraticCurveTo(h - 0.02, gordel - 0.12, h - 0.35, gordel - 0.1)
      // Motorkap, licht oplopend naar de voorruit.
      s.lineTo(suv ? 1.15 : 1.2, gordel)
      s.lineTo(suv ? -1.75 : -1.3, gordel + 0.02)
      // Kofferdeksel (sedan) of de achterklep (suv), en de achterbumper.
      if (suv) s.quadraticCurveTo(-h + 0.05, gordel, -h, gordel - 0.25)
      else s.quadraticCurveTo(-h + 0.12, gordel + 0.02, -h + 0.02, gordel - 0.15)
      s.quadraticCurveTo(-h - 0.03, bodem + 0.3, -h + 0.12, bodem)
    },
    W,
    0.09,
  )
  boetseer(lijf, { lengte: L, gordel, dak: dakH, inloop: 0.05, neus: 0.12 })

  // De cabine: getint glas, iets smaller dan het lijf, met het dak in lakkleur erop.
  const cabine = (dikte: number, krimp: number) =>
    profiel(
      (s) => {
        const achter = suv ? -L / 2 + 0.25 : -1.3
        const voor = suv ? 1.15 : 1.2
        s.moveTo(achter + krimp, gordel - 0.01)
        if (suv) {
          s.lineTo(achter + 0.1 + krimp, dakH - krimp)
          s.lineTo(0.35 - krimp, dakH - krimp)
        } else {
          s.quadraticCurveTo(-1.0, dakH - 0.02 - krimp, -0.55, dakH - krimp)
          s.lineTo(0.3 - krimp, dakH - krimp)
        }
        s.quadraticCurveTo(0.75, dakH - 0.04 - krimp, voor - krimp, gordel - 0.01)
        s.lineTo(achter + krimp, gordel - 0.01)
      },
      dikte,
      0.06,
      5,
    )
  const glas = cabine(W - 0.2, 0)
  boetseer(glas, { lengte: L, gordel: gordel + 0.2, dak: dakH, inloop: 0.14, neus: 0 })
  // Het dak: dezelfde vorm, net breder, enkel het bovenste stuk (alles onder de raamlijn weg).
  const dak = cabine(W - 0.17, -0.02)
  boetseer(dak, { lengte: L, gordel: gordel + 0.2, dak: dakH, inloop: 0.14, neus: 0 })
  {
    const p = dak.attributes.position
    for (let i = 0; i < p.count; i++) if (p.getY(i) < dakH - 0.1) p.setY(i, dakH - 0.1)
    dak.computeVertexNormals()
  }
  // De stijlen tussen de ramen (B- en C-stijl) en de spiegels, in lakkleur.
  const stijlen = [
    new THREE.BoxGeometry(W - 0.16, dakH - gordel, 0.12).translate(0, (gordel + dakH) / 2, suv ? -0.35 : -0.15),
    new THREE.BoxGeometry(0.14, 0.11, 0.24).translate(W / 2 + 0.03, gordel + 0.08, suv ? 1.0 : 1.05),
    new THREE.BoxGeometry(0.14, 0.11, 0.24).translate(-W / 2 - 0.03, gordel + 0.08, suv ? 1.0 : 1.05),
  ].map((g) => {
    if (g.index) return g.toNonIndexed()
    return g
  })
  // De stijl zit binnen de taps toelopende cabine: smaller maken.
  stijlen[0].scale(0.9, 1, 1)

  const metUv = (g: THREE.BufferGeometry) => {
    const n = g.index ? g.toNonIndexed() : g
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2))
    return n
  }
  const lak = mergeGeometries([lijf, dak, ...stijlen].map(metUv))

  // Een chromen lijst langs de onderkant van de zijruiten, en de grille-rand.
  const lijstZ0 = suv ? -L / 2 + 0.35 : -1.25
  const lijstZ1 = suv ? 1.1 : 1.15
  const chroom = [-1, 1].map((k) =>
    new THREE.BoxGeometry(0.025, 0.025, lijstZ1 - lijstZ0)
      .translate(k * ((W - 0.2) / 2 - 0.005) * (1 - 0.14 * 0.2), gordel + 0.035, (lijstZ0 + lijstZ1) / 2),
  )
  chroom.push(new THREE.BoxGeometry(W * 0.52, 0.025, 0.03).translate(0, bodem + 0.46, L / 2 - 0.0))

  // Wielen: band (torus) en een velg met vijf spaken.
  const band: THREE.BufferGeometry[] = []
  const velg: THREE.BufferGeometry[] = []
  for (const az of [voorAs, achterAs])
    for (const kant of [-1, 1]) {
      const x = kant * (W / 2 - 0.16)
      band.push(new THREE.TorusGeometry(wielR - 0.09, 0.1, 6, 14).rotateY(Math.PI / 2).translate(x, wielR, az))
      velg.push(new THREE.CylinderGeometry(wielR - 0.11, wielR - 0.11, 0.05, 12).rotateZ(Math.PI / 2).translate(x + kant * 0.07, wielR, az))
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        velg.push(
          new THREE.BoxGeometry(0.04, wielR * 1.2, 0.06)
            .translate(0, wielR * 0.35, 0)
            .rotateX(a)
            .translate(x + kant * 0.1, wielR, az),
        )
      }
    }

  // Onderkant, grille, zijskirts: donker, zodat je niet onder de auto door kijkt.
  const h = L / 2
  const zwart = [
    new THREE.BoxGeometry(W - 0.3, 0.16, L - 0.6).translate(0, bodem + 0.06, 0),
    new THREE.BoxGeometry(W * 0.5, 0.14, 0.06).translate(0, bodem + 0.38, h - 0.02),
    new THREE.BoxGeometry(W * 0.62, 0.08, 0.06).translate(0, bodem + 0.12, h - 0.05),
    new THREE.BoxGeometry(W * 0.62, 0.08, 0.06).translate(0, bodem + 0.12, -h + 0.08),
  ]
  // Koplampen (gedoofd: geparkeerd) en een achterlichtstrook.
  const koplamp = [-1, 1].map((k) => new THREE.SphereGeometry(0.11, 10, 6).scale(1.9, 0.6, 0.5).translate(k * (W / 2 - 0.32), gordel - 0.2, h - 0.12))
  const achterlicht = [
    ...[-1, 1].map((k) => new THREE.BoxGeometry(0.42, 0.1, 0.05).translate(k * (W / 2 - 0.3), gordel - 0.12, -h + 0.04)),
    new THREE.BoxGeometry(W - 0.9, 0.035, 0.04).translate(0, gordel - 0.1, -h + 0.03),
  ]
  const delen: AutoDelen = {
    lak,
    glas: metUv(glas),
    chroom: mergeGeometries(chroom.map(metUv)),
    band: mergeGeometries(band.map(metUv)),
    velg: mergeGeometries(velg.map(metUv)),
    zwart: mergeGeometries(zwart.map(metUv)),
    koplamp: mergeGeometries(koplamp.map(metUv)),
    achterlicht: mergeGeometries(achterlicht.map(metUv)),
  }
  cache.set(model, delen)
  return delen
}

/**
 * Een rij auto's: per model en per onderdeel één InstancedMesh. `plaatsen` zijn de matrices (de
 * auto staat met de wielen op y = 0, de neus naar +z), `kleuren` de lak per auto.
 */
export function bouwAutos(plaatsen: { matrix: THREE.Matrix4; kleur: THREE.Color; model: AutoModel }[]): THREE.Group {
  const groep = new THREE.Group()
  const mat = voertuigMaterialen()
  for (const model of ['sedan', 'suv'] as AutoModel[]) {
    const lijst = plaatsen.filter((p) => p.model === model)
    if (!lijst.length) continue
    const d = autoDelen(model)
    const deel = (geo: THREE.BufferGeometry, m: THREE.Material, kleur: boolean) => {
      const mesh = new THREE.InstancedMesh(geo, m, lijst.length)
      lijst.forEach((p, i) => {
        mesh.setMatrixAt(i, p.matrix)
        if (kleur) mesh.setColorAt(i, p.kleur)
      })
      groep.add(mesh)
    }
    deel(d.lak, mat.lak, true)
    deel(d.glas, mat.glas, false)
    deel(d.chroom, mat.chroom, false)
    deel(d.band, mat.band, false)
    deel(d.velg, mat.velg, false)
    deel(d.zwart, mat.zwart, false)
    deel(d.koplamp, mat.koplamp, false)
    deel(d.achterlicht, mat.achterlicht, false)
  }
  return groep
}

/**
 * Een foodtruck of verkoopwagen: een afgerond lijf met een luik aan de +z-kant, wielen met velgen,
 * een bumper en (met `cabine`) een bestuurderscabine met voorruit aan de +x-kant. Lengte langs x.
 * Geeft een groep terug, met de voeten op y = 0.
 */
export function bouwVerkoopwagen(o: { lengte: number; breedte: number; hoogte: number; kleur: THREE.ColorRepresentation; cabine?: boolean; bodem?: number }): THREE.Group {
  const groep = new THREE.Group()
  const mat = voertuigMaterialen(o.kleur)
  const bodem = o.bodem ?? 0.55
  const L = o.lengte
  const B = o.breedte
  const H = o.hoogte
  const wielR = 0.42
  // Het lijf: een zijprofiel met afgeronde hoeken bovenaan en twee wielkasten.
  const assen = o.cabine ? [L / 2 - 1.0, -L / 2 + 1.3] : [L * 0.12, -L * 0.12]
  const lijf = profiel(
    (s) => {
      const h = L / 2
      const r = 0.35
      s.moveTo(-h, bodem)
      const kast = wielR + 0.08
      const gesorteerd = [...assen].sort((a, b) => a - b)
      for (const as of gesorteerd) {
        s.lineTo(as - kast, bodem)
        s.absarc(as, wielR, kast, Math.PI, 0, true)
      }
      s.lineTo(h, bodem)
      s.lineTo(h, bodem + H - r)
      s.quadraticCurveTo(h, bodem + H, h - r, bodem + H)
      s.lineTo(-h + r, bodem + H)
      s.quadraticCurveTo(-h, bodem + H, -h, bodem + H - r)
      s.lineTo(-h, bodem)
    },
    B,
    0.08,
  )
  // profiel() legt de lengte langs z; hier willen we ze langs x.
  lijf.rotateY(Math.PI / 2)
  groep.add(new THREE.Mesh(lijf, mat.lak))
  if (o.cabine) {
    // De voorruit en zijruiten van de cabine, schuin naar achter.
    const ruit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, B - 0.25), mat.glas)
    ruit.position.set(L / 2 + 0.02, bodem + H - 0.75, 0)
    ruit.rotation.z = -0.12
    const zij = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, B + 0.02), mat.glas)
    zij.position.set(L / 2 - 0.55, bodem + H - 0.72, 0)
    const koplampen = [-1, 1].map((k) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6).scale(0.4, 1, 1), new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false }))
      m.position.set(L / 2 + 0.05, bodem + 0.45, k * (B / 2 - 0.3))
      return m
    })
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, B * 0.5), mat.zwart)
    grille.position.set(L / 2 + 0.05, bodem + 0.42, 0)
    groep.add(ruit, zij, grille, ...koplampen)
  }
  // Bumpers en een donkere sokkel tussen de wielen.
  const chroom = mat.chroom
  for (const k of [-1, 1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, B - 0.1), chroom)
    bumper.position.set(k * (L / 2 + 0.06), bodem + 0.1, 0)
    groep.add(bumper)
  }
  const onder = new THREE.Mesh(new THREE.BoxGeometry(L - 0.4, bodem - 0.05, B - 0.3), mat.zwart)
  onder.position.y = (bodem + 0.05) / 2 + 0.02
  groep.add(onder)
  // Wielen.
  for (const as of assen)
    for (const kant of [-1, 1]) {
      const z = kant * (B / 2 - 0.12)
      const band = new THREE.Mesh(new THREE.TorusGeometry(wielR - 0.11, 0.12, 8, 20), mat.band)
      band.position.set(as, wielR, z)
      const velg = new THREE.Mesh(new THREE.CylinderGeometry(wielR - 0.15, wielR - 0.15, 0.06, 16).rotateX(Math.PI / 2), mat.velg)
      velg.position.set(as, wielR, z + kant * 0.07)
      groep.add(band, velg)
    }
  // Achterlichten.
  for (const k of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.14), mat.achterlicht)
    l.position.set(-L / 2 - 0.03, bodem + 0.45, k * (B / 2 - 0.2))
    groep.add(l)
  }
  return groep
}
