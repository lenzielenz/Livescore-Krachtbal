import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Divers volk: de mensen die rond (en in) het stadion rondlopen, aanschuiven en juichen. Geen
// blokjes die allemaal even groot zijn, maar mannen, vrouwen (met een rok of een broek, kort of
// lang haar), kinderen (soms met een ballon), ouders met een kinderwagen, ouderen met een
// wandelstok, en juichende supporters met een sjaal. Elk figuur krijgt zijn eigen lengte en
// postuur (dik, dun), huidskleur, haarkleur, kleren en schoenen.
//
// Vlot: per soort één InstancedMesh met afgeronde onderdelen (capsules, bollen, een draaivorm
// voor de rok). De kleuren en de vorm per persoon staan in instance-attributen; de shader kleurt
// elk onderdeel (huid, haar, shirt, broek, schoenen, extra), past het postuur toe en laat benen
// en armen zwaaien bij het stappen. Geen extra tekenopdrachten per persoon.

export type Soort = 'man' | 'vrouwBroek' | 'vrouwRok' | 'kind' | 'kindBallon' | 'wagen' | 'oudere' | 'juicher'
export type Pose = 'staan' | 'stappen' | 'juichen'

/** Hoe vaak elke soort voorkomt (als je niets kiest). */
const MIX: [Soort, number][] = [
  ['man', 0.3],
  ['vrouwBroek', 0.17],
  ['vrouwRok', 0.13],
  ['kind', 0.15],
  ['kindBallon', 0.04],
  ['wagen', 0.07],
  ['oudere', 0.07],
  ['juicher', 0.07],
]

// Onderdelen: welke kleur (code) en welke beweging (groep).
const HUID = 0
const HAAR = 1
const SHIRT = 2
const BROEK = 3
const SCHOEN = 4
const EXTRA = 5
const DONKER = 6
const GEEN = 0
const BEEN_L = 1
const BEEN_R = 2
const ARM_L = 3
const ARM_R = 4

type Sjabloon = { geo: THREE.BufferGeometry; heup: number; schouder: number }

/** Kleur een onderdeel: het kleur-attribuut draagt de code (r) en de beweeggroep (g). */
const deel = (geo: THREE.BufferGeometry, code: number, groep = GEEN) => {
  const g = geo
  const n = g.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    c[i * 3] = code / 10
    c[i * 3 + 1] = groep / 10
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  return g.index ? g.toNonIndexed() : g
}
const capsule = (r: number, lengte: number, segs = 10) => new THREE.CapsuleGeometry(r, lengte, 4, segs)
const bol = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h)

type Maat = { lengte: number; benen: number; romp: number; schouders: number; heupen: number; hoofd: number }
const VOLWASSEN: Maat = { lengte: 1.75, benen: 0.86, romp: 0.52, schouders: 0.2, heupen: 0.17, hoofd: 0.115 }
const KIND: Maat = { lengte: 1.18, benen: 0.52, romp: 0.36, schouders: 0.14, heupen: 0.12, hoofd: 0.105 }

/** Een mens: benen, heup, romp, armen, nek, hoofd met neus, haar; met varianten. */
function lichaam(m: Maat, opt: { rok?: boolean; langHaar?: boolean; staart?: boolean; vrouw?: boolean; armen?: 'zwaai' | 'vooruit' | 'omhoog'; stok?: boolean }): { delen: THREE.BufferGeometry[]; heup: number; schouder: number } {
  const delen: THREE.BufferGeometry[] = []
  const heup = m.benen
  const been = 0.075 * (m.benen / 0.86) + 0.012
  const bx = m.heupen * 0.55
  // Benen en schoenen.
  for (const [sx, gr] of [
    [-1, BEEN_L],
    [1, BEEN_R],
  ] as const) {
    const beenL = m.benen - 0.1
    delen.push(deel(capsule(been, beenL - been * 2).translate(sx * bx, 0.1 + beenL / 2, 0), opt.rok ? HUID : BROEK, gr))
    delen.push(deel(capsule(been * 0.85, been * 2.2, 8).rotateX(Math.PI / 2).scale(1.05, 0.75, 1).translate(sx * bx, 0.055, 0.045), SCHOEN, gr))
  }
  // Heup / rok.
  if (opt.rok) {
    const punten = [new THREE.Vector2(m.heupen * 1.05, heup + 0.06), new THREE.Vector2(m.heupen * 1.25, heup - 0.12), new THREE.Vector2(m.heupen * 1.55, heup - 0.38)]
    const rok = new THREE.LatheGeometry([new THREE.Vector2(0.001, heup + 0.07), ...punten, new THREE.Vector2(0.001, heup - 0.38)], 20)
    delen.push(deel(rok, EXTRA))
  } else delen.push(deel(bol(m.heupen, 16, 10).scale(1, 0.62, 0.72).translate(0, heup, 0), BROEK))
  // Romp: een capsule, bij een vrouw met een smallere taille.
  const rompY = heup + m.romp / 2 + 0.02
  const rompR = m.schouders * (opt.vrouw ? 0.86 : 1)
  delen.push(deel(capsule(rompR, m.romp - rompR, 14).scale(1, 1, 0.66).translate(0, rompY, 0), SHIRT))
  const schouder = heup + m.romp - 0.02
  // Armen (mouw + hand).
  const armL = m.romp * 0.98
  const armR = rompR * 0.3
  for (const [sx, gr] of [
    [-1, ARM_L],
    [1, ARM_R],
  ] as const) {
    const x = sx * (rompR + armR * 0.9)
    if (opt.armen === 'omhoog') {
      const mouw = capsule(armR, armL - armR * 2).translate(0, armL / 2, 0).rotateZ(-sx * 0.35).translate(x, schouder, 0)
      delen.push(deel(mouw, SHIRT))
      delen.push(deel(bol(armR * 1.05, 10, 8).translate(x + sx * Math.sin(0.35) * armL, schouder + Math.cos(0.35) * armL + 0.02, 0), HUID))
    } else if (opt.armen === 'vooruit') {
      const mouw = capsule(armR, armL - armR * 2).translate(0, -armL / 2, 0).rotateX(-1.05).translate(x * 0.92, schouder, 0)
      delen.push(deel(mouw, SHIRT))
      delen.push(deel(bol(armR * 1.05, 10, 8).translate(x * 0.92, schouder - Math.cos(1.05) * armL, Math.sin(1.05) * armL), HUID))
    } else {
      delen.push(deel(capsule(armR, armL - armR * 2).translate(x, schouder - armL / 2, 0), SHIRT, gr))
      delen.push(deel(bol(armR * 1.05, 10, 8).translate(x, schouder - armL - 0.01, 0), HUID, gr))
      if (opt.stok && sx === 1) delen.push(deel(new THREE.CylinderGeometry(0.014, 0.014, schouder - armL, 6).translate(x, (schouder - armL) / 2, 0.06), DONKER, gr))
    }
  }
  // Nek, hoofd, neus en haar.
  const h = m.hoofd
  const hoofdY = schouder + 0.06 + h
  delen.push(deel(new THREE.CylinderGeometry(h * 0.42, h * 0.48, 0.1, 10).translate(0, schouder + 0.04, 0), HUID))
  delen.push(deel(bol(h, 18, 14).scale(0.95, 1.1, 1.02).translate(0, hoofdY, 0), HUID))
  delen.push(deel(bol(h * 0.17, 8, 6).scale(1, 1.2, 1).translate(0, hoofdY - h * 0.05, h * 0.98), HUID))
  delen.push(deel(new THREE.SphereGeometry(h * 1.07, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(0.97, 1.08, 1.04).rotateX(-0.25).translate(0, hoofdY + h * 0.06, -h * 0.06), HAAR))
  if (opt.langHaar) delen.push(deel(capsule(h * 0.85, h * 1.6, 12).scale(1.05, 1, 0.55).translate(0, hoofdY - h * 0.9, -h * 0.55), HAAR))
  if (opt.staart) delen.push(deel(capsule(h * 0.32, h * 1.3, 8).rotateX(0.5).translate(0, hoofdY - h * 0.35, -h * 1.2), HAAR))
  return { delen, heup, schouder }
}

function sjabloon(soort: Soort): Sjabloon {
  const maak = (r: ReturnType<typeof lichaam>, extra: THREE.BufferGeometry[] = []) => {
    const geo = mergeGeometries([...r.delen, ...extra])
    r.delen.forEach((g) => g.dispose())
    extra.forEach((g) => g.dispose())
    return { geo, heup: r.heup, schouder: r.schouder }
  }
  switch (soort) {
    case 'man':
      return maak(lichaam(VOLWASSEN, {}))
    case 'oudere':
      return maak(lichaam({ ...VOLWASSEN, lengte: 1.68, benen: 0.82 }, { stok: true }))
    case 'vrouwBroek':
      return maak(lichaam({ ...VOLWASSEN, benen: 0.84, romp: 0.49, schouders: 0.18, heupen: 0.18, hoofd: 0.11 }, { vrouw: true, staart: true }))
    case 'vrouwRok':
      return maak(lichaam({ ...VOLWASSEN, benen: 0.84, romp: 0.49, schouders: 0.18, heupen: 0.18, hoofd: 0.11 }, { vrouw: true, rok: true, langHaar: true }))
    case 'kind':
      return maak(lichaam(KIND, {}))
    case 'kindBallon': {
      const r = lichaam(KIND, { staart: true })
      // Een ballon aan een touwtje, vast aan de rechterhand.
      const hand = new THREE.Vector3(KIND.schouders * 1.3, r.schouder - KIND.romp, 0)
      const touw = deel(new THREE.CylinderGeometry(0.004, 0.004, 0.95, 4).translate(hand.x + 0.05, hand.y + 0.47, 0.05), DONKER)
      const ballon = deel(bol(0.17, 14, 10).scale(1, 1.18, 1).translate(hand.x + 0.1, hand.y + 1.12, 0.08), EXTRA)
      return maak(r, [touw, ballon])
    }
    case 'juicher': {
      // Armen omhoog, met een sjaal in clubkleur tussen de handen.
      const r = lichaam(VOLWASSEN, { armen: 'omhoog' })
      const sjaal = deel(capsule(0.05, 0.56, 6).rotateZ(Math.PI / 2).scale(1, 1.4, 0.35).translate(0, r.schouder + 0.5, 0.04), EXTRA)
      return maak(r, [sjaal])
    }
    case 'wagen': {
      // Een ouder die een kinderwagen voor zich uit duwt.
      const r = lichaam({ ...VOLWASSEN, benen: 0.85, schouders: 0.19 }, { armen: 'vooruit', staart: true, vrouw: true })
      const z0 = 0.62
      const bak = deel(capsule(0.2, 0.42, 12).rotateX(Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.56, z0 + 0.3), EXTRA)
      const kap = deel(new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI, 0, Math.PI / 2).rotateY(-Math.PI / 2).rotateX(-0.3).translate(0, 0.66, z0 + 0.05), EXTRA)
      const stang = deel(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 6).rotateZ(Math.PI / 2).translate(0, 0.98, z0 - 0.08), DONKER)
      const stangen = [-1, 1].map((sx) => deel(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6).rotateX(-0.75).translate(sx * 0.2, 0.75, z0 + 0.07), DONKER))
      const wielen = [
        [-0.2, 0.0],
        [0.2, 0.0],
        [-0.2, 0.6],
        [0.2, 0.6],
      ].map(([x, dz]) => deel(new THREE.TorusGeometry(0.1, 0.022, 6, 14).rotateY(Math.PI / 2).translate(x, 0.12, z0 + dz), DONKER))
      const as = deel(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 5).rotateX(Math.PI / 2).translate(0, 0.22, z0 + 0.3), DONKER)
      return maak(r, [bak, kap, stang, ...stangen, ...wielen, as])
    }
  }
}

const HUIDEN = ['#ffe3cc', '#f6d0b1', '#eac086', '#e0ac69', '#d8a47f', '#c68642', '#a86b3c', '#8d5524', '#6b3e26', '#4a2c1d', '#3a2219'].map((c) => new THREE.Color(c))
const HAREN = ['#0f0b08', '#1c120c', '#2b1a10', '#4a2f1b', '#6b4423', '#a0703c', '#d6b26e', '#e8d39a', '#b5462a', '#3d2b1f'].map((c) => new THREE.Color(c))
const GRIJS = ['#9ca3af', '#d1d5db', '#f3f4f6', '#6b7280'].map((c) => new THREE.Color(c))
const SHIRTS = ['#f8fafc', '#111827', '#374151', '#7f1d1d', '#065f46', '#1e3a8a', '#a16207', '#be185d', '#0e7490', '#4c1d95', '#e5e7eb'].map((c) => new THREE.Color(c))
const BROEKEN = ['#1e3a5f', '#27466e', '#2f4f7f', '#111827', '#374151', '#6b5b45', '#d6c7a1', '#1f2937', '#3f3f46'].map((c) => new THREE.Color(c))
const SCHOENEN = ['#111111', '#f5f5f5', '#7c2d12', '#1f2937', '#e11d48', '#9ca3af', '#f5f5f5'].map((c) => new THREE.Color(c))
const FEL = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316'].map((c) => new THREE.Color(c))

export type VolkOpties = {
  toeval: () => number
  primair: THREE.Color | string
  secundair: THREE.Color | string
  /** Hoeveel procent clubkleuren draagt (standaard 0.6). */
  clubAandeel?: number
  /** Kies de soort zelf (anders willekeurig volgens de mix). */
  soort?: (i: number) => Soort | undefined
  /** Soorten die hier niet voorkomen (bij willekeurig kiezen). */
  zonder?: Soort[]
  /** Gedeelde tijd-uniform (anders zet `update` hem). */
  tijd?: { value: number }
  /** Extra shadercode na de vorm (bv. wandelen langs +z), met `transformed` en `uTijd`. */
  code?: string
}

export type Volk = {
  groep: THREE.Group
  aantal: number
  soort: (i: number) => Soort
  /** Plaats persoon i (voeten op y), kijkend naar ry. */
  zet: (i: number, x: number, y: number, z: number, ry: number) => void
  /** Stappen (tempo ~1 = wandelen), staan of juichen. */
  houding: (i: number, pose: Pose, tempo?: number) => void
  /** Na een reeks `zet`/`houding`: naar de GPU. */
  klaar: () => void
  update: (seconden: number) => void
  dispose: () => void
}

export function bouwVolk(n: number, opt: VolkOpties): Volk {
  const { toeval } = opt
  const P = new THREE.Color(opt.primair)
  const S = new THREE.Color(opt.secundair)
  const club = opt.clubAandeel ?? 0.6
  const tijd = opt.tijd ?? { value: 0 }
  const kies = <T,>(l: T[]) => l[Math.floor(toeval() * l.length)]
  const mix = MIX.filter(([s]) => !opt.zonder?.includes(s))
  const totaal = mix.reduce((s, [, w]) => s + w, 0)
  const willekeurig = (): Soort => {
    let r = toeval() * totaal
    for (const [s, w] of mix) if ((r -= w) <= 0) return s
    return 'man'
  }
  const soorten = Array.from({ length: n }, (_, i) => opt.soort?.(i) ?? willekeurig())
  const groep = new THREE.Group()
  const plek: { mesh: number; j: number }[] = []
  type Laag = { mesh: THREE.InstancedMesh; attrs: Record<string, THREE.InstancedBufferAttribute> }
  const lagen: Laag[] = []
  const perSoort = new Map<Soort, number[]>()
  soorten.forEach((s, i) => {
    if (!perSoort.has(s)) perSoort.set(s, [])
    perSoort.get(s)!.push(i)
  })
  for (const [s, leden] of perSoort) {
    const sj = sjabloon(s)
    const m = leden.length
    const attrs = {
      iHuid: new THREE.InstancedBufferAttribute(new Float32Array(m * 3), 3),
      iHaar: new THREE.InstancedBufferAttribute(new Float32Array(m * 3), 3),
      iShirt: new THREE.InstancedBufferAttribute(new Float32Array(m * 3), 3),
      iBroek: new THREE.InstancedBufferAttribute(new Float32Array(m * 3), 3),
      iSchoen: new THREE.InstancedBufferAttribute(new Float32Array(m * 3), 3),
      iExtra: new THREE.InstancedBufferAttribute(new Float32Array(m * 3), 3),
      iVorm: new THREE.InstancedBufferAttribute(new Float32Array(m * 2), 2),
      iLoop: new THREE.InstancedBufferAttribute(new Float32Array(m * 3), 3),
    }
    for (const [k, a] of Object.entries(attrs)) sj.geo.setAttribute(k, a)
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTijd = tijd
      sh.uniforms.uHeup = { value: sj.heup }
      sh.uniforms.uSchouder = { value: sj.schouder }
      sh.vertexShader =
        `uniform float uTijd;
        uniform float uHeup;
        uniform float uSchouder;
        attribute vec3 iHuid;
        attribute vec3 iHaar;
        attribute vec3 iShirt;
        attribute vec3 iBroek;
        attribute vec3 iSchoen;
        attribute vec3 iExtra;
        attribute vec2 iVorm;
        attribute vec3 iLoop;
        vec2 draai(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
        ` +
        sh.vertexShader
          .replace(
            '#include <color_vertex>',
            `#include <color_vertex>
            float code = floor(color.r * 10.0 + 0.5);
            float groepB = floor(color.g * 10.0 + 0.5);
            vColor = code < 0.5 ? iHuid : code < 1.5 ? iHaar : code < 2.5 ? iShirt : code < 3.5 ? iBroek : code < 4.5 ? iSchoen : code < 5.5 ? iExtra : vec3(0.05, 0.06, 0.08);`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float tempo = iLoop.y;
            float zwaai = sin(uTijd * (2.0 + tempo * 3.6) + iLoop.x) * clamp(tempo, 0.0, 1.3) * 0.42;
            if (groepB > 0.5 && groepB < 2.5) {
              float a = groepB < 1.5 ? zwaai : -zwaai;
              transformed.yz = draai(transformed.yz - vec2(uHeup, 0.0), a) + vec2(uHeup, 0.0);
            } else if (groepB > 2.5) {
              float a = (groepB < 3.5 ? -zwaai : zwaai) * 0.85 + sin(uTijd * 0.9 + iLoop.x) * 0.04;
              transformed.yz = draai(transformed.yz - vec2(uSchouder, 0.0), a) + vec2(uSchouder, 0.0);
            }
            // Het postuur: dik of dun (de romp het meest), groot of klein.
            float br = iVorm.x;
            float romp = (code > 1.5 && code < 3.5) || (code > 4.5 && code < 5.5 && transformed.y < uSchouder) ? 1.0 : 0.45;
            transformed.xz *= mix(1.0, br, romp);
            transformed.y *= iVorm.y;
            // Juichen: huppelen op de maat. Staan: zacht wiegen.
            transformed.y += iLoop.z > 1.5 ? max(0.0, sin(uTijd * 6.0 + iLoop.x)) * 0.16 : 0.0;
            transformed.x += tempo < 0.05 ? sin(uTijd * 1.1 + iLoop.x) * 0.012 * transformed.y : 0.0;
            ${opt.code ?? ''}`,
          )
    }
    // Aparte sleutel per soort: anders deelt three het programma (met andere uniforms).
    mat.customProgramCacheKey = () => `volk-${s}-${opt.code ? opt.code.length : 0}`
    const mesh = new THREE.InstancedMesh(sj.geo, mat, m)
    mesh.frustumCulled = false
    groep.add(mesh)
    const li = lagen.length
    lagen.push({ mesh, attrs })
    leden.forEach((i, j) => {
      plek[i] = { mesh: li, j }
      // De kenmerken van deze persoon.
      const kind = s === 'kind' || s === 'kindBallon'
      const zet3 = (a: THREE.InstancedBufferAttribute, c: THREE.Color) => a.setXYZ(j, c.r, c.g, c.b)
      zet3(attrs.iHuid, kies(HUIDEN))
      zet3(attrs.iHaar, s === 'oudere' || (!kind && toeval() < 0.08) ? kies(GRIJS) : kies(HAREN))
      const k = toeval()
      zet3(attrs.iShirt, k < club * 0.7 ? P : k < club ? S : kies(SHIRTS))
      zet3(attrs.iBroek, toeval() < 0.15 ? (toeval() < 0.5 ? P : S) : kies(BROEKEN))
      zet3(attrs.iSchoen, kies(SCHOENEN))
      zet3(attrs.iExtra, s === 'juicher' ? (toeval() < 0.6 ? P : S) : s === 'vrouwRok' ? (toeval() < 0.4 ? P : kies([...BROEKEN, ...FEL])) : toeval() < 0.3 ? P : kies(FEL))
      // Postuur: een kwart is stevig, een vijfde slank; lengte volgens leeftijd.
      const p = toeval()
      const breedte = p < 0.25 ? 1.18 + toeval() * 0.24 : p < 0.45 ? 0.84 + toeval() * 0.08 : 0.94 + toeval() * 0.14
      const lengte = kind ? 0.82 + toeval() * 0.3 : s === 'vrouwBroek' || s === 'vrouwRok' ? 0.9 + toeval() * 0.14 : 0.93 + toeval() * 0.16
      attrs.iVorm.setXY(j, breedte, lengte)
      attrs.iLoop.setXYZ(j, toeval() * 6.28, 0, 0)
    })
  }
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const een = new THREE.Vector3(1, 1, 1)
  const v = new THREE.Vector3()
  return {
    groep,
    aantal: n,
    soort: (i) => soorten[i],
    zet(i, x, y, z, ry) {
      const p = plek[i]
      m4.compose(v.set(x, y, z), q.setFromAxisAngle(Y, ry), een)
      lagen[p.mesh].mesh.setMatrixAt(p.j, m4)
    },
    houding(i, pose, tempo = 1) {
      const p = plek[i]
      const a = lagen[p.mesh].attrs.iLoop
      a.setY(p.j, pose === 'stappen' ? tempo : 0)
      a.setZ(p.j, pose === 'juichen' ? 2 : 0)
      a.needsUpdate = true
    },
    klaar() {
      for (const l of lagen) l.mesh.instanceMatrix.needsUpdate = true
    },
    update(seconden) {
      tijd.value = seconden
    },
    dispose() {
      for (const l of lagen) {
        l.mesh.geometry.dispose()
        ;(l.mesh.material as THREE.Material).dispose()
      }
    },
  }
}
