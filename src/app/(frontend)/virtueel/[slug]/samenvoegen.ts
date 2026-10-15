import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Stilstaande onderdelen samenvoegen tot één tekenopdracht per materiaal.
//
// De wereld is opgebouwd uit duizenden losse stukjes (een paal, een plank, een bordje), elk een
// eigen mesh en dus een eigen tekenopdracht. Voor de GPU is niet het aantal driehoeken het
// probleem, maar het aantal opdrachten: op het plein waren dat er bijna 1500 per beeld. Wat niet
// beweegt, voegen we per materiaal samen tot één mesh — aan het beeld verandert niets.
//
// Veilig, zonder dat elke module moet aangeven wat beweegt:
//  1. we wachten tot de wereld een paar seconden gedraaid heeft, zodat wat voortdurend beweegt
//     (het reuzenrad, de rotor, de vissen) al verraden heeft dat het beweegt;
//  2. de originelen blijven bestaan, enkel onzichtbaar voor de camera (laag 0 uit);
//  3. elk beeld kijken we een deel van de originelen na: is er één verplaatst, verborgen, van
//     materiaal of geometrie gewisseld of zijn de hoekpunten aangepast (de lift die vertrekt, een
//     deur die opengaat, een bord dat verandert)? Dan gaat die hele samengevoegde groep meteen
//     terug uit elkaar en blijft hij voortaan los.
//
// Wat nooit samengaat: sprites, instanced meshes, lijnen en punten; spiegels en andere meshes met
// een eigen render-hook; materialen met eigen shadercode (die rekenen met de lokale vorm);
// gespiegelde meshes (negatieve schaal keert de voorkant om); meshes op een eigen laag.
// Materiaalwijzigingen (een kleur die ademt, een textuur die schuift) blijven gewoon werken: de
// samengevoegde mesh gebruikt hetzelfde materiaal-object.
//
// Per materiaal wordt bovendien per vak van CEL meter gegroepeerd, zodat three wat buiten beeld
// valt nog altijd kan overslaan.

const CEL = 28
/** Wachten (in beelden) voor we beginnen samenvoegen. */
const WACHT = 150
/** Zoveel originelen per beeld nakijken. */
const CONTROLE_PER_BEELD = 900
/** Tijd per beeld voor het samenvoegen zelf (ms): verspreid over beelden, geen hapering. */
const BUDGET_MS = 6

const basisHook = THREE.Object3D.prototype.onBeforeRender
const basisCompile = THREE.Material.prototype.onBeforeCompile

type Origineel = {
  mesh: THREE.Mesh
  top: THREE.Object3D
  /** matrixWorld van het origineel ten opzichte van zijn top, bij het samenvoegen. */
  rel: THREE.Matrix4
  materiaal: THREE.Material
  /** Hash van de instellingen van het eigen materiaal (als dat niet het gedeelde is). */
  hash: number
  geometrie: THREE.BufferGeometry
  versie: number
  pakket: Pakket
}
type Pakket = { mesh: THREE.Mesh; originelen: Origineel[]; los: boolean }

// Veel modules maken per onderdeel een eigen materiaal, ook als het precies hetzelfde is (dezelfde
// kleur, ruwheid…). Twee materialen met dezelfde instellingen mogen samen: we gebruiken dan dat van
// het eerste. Verandert een module later de kleur van één van die materialen (een lamp die
// oplicht), dan merkt de controle dat aan de hash en gaat het pakket weer uit elkaar.
const SLA_OVER = new Set(['uuid', 'id', 'name', 'version', 'userData', 'type'])
const eigenschappen = new Map<string, string[]>()
const sleutelsVan = (m: THREE.Material) => {
  let k = eigenschappen.get(m.type)
  if (!k) eigenschappen.set(m.type, (k = Object.keys(m).filter((x) => !SLA_OVER.has(x) && !x.startsWith('_'))))
  return k
}
const waarde = (v: unknown): string => {
  if (v == null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return String(v)
  if ((v as THREE.Color).isColor) return (v as THREE.Color).getHexString()
  if ((v as THREE.Texture).isTexture) return (v as THREE.Texture).uuid
  if ((v as THREE.Vector2).isVector2) return `${(v as THREE.Vector2).x},${(v as THREE.Vector2).y}`
  if ((v as THREE.Euler).isEuler) return `${(v as THREE.Euler).x},${(v as THREE.Euler).y},${(v as THREE.Euler).z}`
  if (Array.isArray(v)) return v.length ? '[?]' : '[]'
  return '?'
}
const materiaalSleutel = (m: THREE.Material) => m.type + '{' + sleutelsVan(m).map((k) => waarde((m as unknown as Record<string, unknown>)[k])).join(';') + '}'
const materiaalHash = (m: THREE.Material) => {
  let h = 0
  let f = 1
  for (const k of sleutelsVan(m)) {
    const v = (m as unknown as Record<string, unknown>)[k]
    f = (f * 31) % 9973
    if (typeof v === 'number') h += v * f
    else if (typeof v === 'boolean') h += (v ? 1 : 0) * f
    else if (v && (v as THREE.Color).isColor) h += ((v as THREE.Color).r * 3 + (v as THREE.Color).g * 5 + (v as THREE.Color).b * 7) * f
    else if (v && (v as THREE.Texture).isTexture) h += (v as THREE.Texture).id * f
  }
  return h
}

const versieVan = (g: THREE.BufferGeometry) => {
  let v = g.index?.version ?? 0
  for (const k in g.attributes) v += (g.attributes[k] as THREE.BufferAttribute).version ?? 0
  return v
}

const handtekening = (g: THREE.BufferGeometry) =>
  Object.keys(g.attributes)
    .sort()
    .map((k) => `${k}${g.attributes[k].itemSize}${(g.attributes[k] as THREE.BufferAttribute).normalized ? 'n' : ''}`)
    .join(',')

const geschikt = (m: THREE.Mesh) => {
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return false
  // Laag 0 mag uit staan (de zichtbaarheidslaag), maar een eigen laag (spiegels, je figuur) niet.
  if (Array.isArray(m.material) || m.onBeforeRender !== basisHook || (m.layers.mask & ~1) !== 0 || !m.visible) return false
  const mat = m.material
  if ((mat as THREE.ShaderMaterial).isShaderMaterial || mat.onBeforeCompile !== basisCompile) return false
  const g = m.geometry
  if (!g?.attributes.position || Object.keys(g.morphAttributes).length || (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return false
  if (Object.values(g.attributes).some((a) => (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || (a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute)) return false
  return m.matrixWorld.determinant() > 0
}

export type Samenvoeger = {
  update: () => void
  /** Hoeveel tekenopdrachten het samenvoegen nu uitspaart (voor de tests). */
  bespaard: () => number
  /** Is alles al samengevoegd? */
  klaar: () => boolean
  /** Alles weer uit elkaar (om te vergelijken of het beeld identiek is). */
  losAlles: () => void
}

/**
 * Voeg de stilstaande meshes onder de gegeven bovenste objecten samen. `nieuw` krijgt elke nieuwe
 * samengevoegde mesh (om bv. aan de zichtbaarheidslaag te geven).
 */
export function bouwSamenvoeger(scene: THREE.Scene, toppen: THREE.Object3D[], opt: { nieuw?: (mesh: THREE.Mesh, top: THREE.Object3D) => void } = {}): Samenvoeger {
  let beeld = 0
  const wachtrij = [...toppen]
  const originelen: Origineel[] = []
  const pakketten: Pakket[] = []
  let controle = 0
  const verwacht = new THREE.Matrix4()
  const centrum = new THREE.Vector3()

  const voegSamenOnder = (top: THREE.Object3D) => {
    top.updateMatrixWorld(true)
    const topInv = new THREE.Matrix4().copy(top.matrixWorld).invert()
    const groepen = new Map<string, THREE.Mesh[]>()
    const bezoek = (o: THREE.Object3D, zichtbaar: boolean) => {
      if (o.userData.los) return
      const m = o as THREE.Mesh
      if (zichtbaar && geschikt(m)) {
        const geo = m.geometry
        if (!geo.boundingSphere) geo.computeBoundingSphere()
        centrum.copy(geo.boundingSphere!.center).applyMatrix4(m.matrixWorld)
        const cel = `${Math.floor(centrum.x / CEL)},${Math.floor(centrum.y / CEL)},${Math.floor(centrum.z / CEL)}`
        const sleutel = [materiaalSleutel(m.material as THREE.Material), handtekening(geo), m.castShadow, m.receiveShadow, m.renderOrder, m.frustumCulled, cel].join('|')
        let lijst = groepen.get(sleutel)
        if (!lijst) groepen.set(sleutel, (lijst = []))
        lijst.push(m)
      }
      for (const c of o.children) bezoek(c, zichtbaar && c.visible)
    }
    bezoek(top, true)

    for (const lijst of groepen.values()) {
      if (lijst.length < 2) continue
      const geos = lijst.map((m) => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(topInv, m.matrixWorld))
        g.clearGroups()
        return g
      })
      let samen: THREE.BufferGeometry | null = null
      try {
        samen = mergeGeometries(geos, false)
      } catch {
        samen = null
      }
      geos.forEach((g) => g.dispose())
      if (!samen) continue
      samen.computeBoundingSphere()
      const eerste = lijst[0]
      const mesh = new THREE.Mesh(samen, eerste.material)
      mesh.castShadow = eerste.castShadow
      mesh.receiveShadow = eerste.receiveShadow
      mesh.renderOrder = eerste.renderOrder
      mesh.frustumCulled = eerste.frustumCulled
      mesh.userData.samengevoegd = true
      top.add(mesh)
      mesh.updateMatrixWorld(true)
      const pakket: Pakket = { mesh, originelen: [], los: false }
      for (const m of lijst) {
        const o: Origineel = {
          mesh: m,
          top,
          rel: new THREE.Matrix4().multiplyMatrices(topInv, m.matrixWorld),
          materiaal: m.material as THREE.Material,
          hash: materiaalHash(m.material as THREE.Material),
          geometrie: m.geometry,
          versie: versieVan(m.geometry),
          pakket,
        }
        m.userData.inPakket = true
        m.layers.disable(0)
        pakket.originelen.push(o)
        originelen.push(o)
      }
      pakketten.push(pakket)
      opt.nieuw?.(mesh, top)
    }
  }

  const uitElkaar = (p: Pakket) => {
    if (p.los) return
    p.los = true
    p.mesh.removeFromParent()
    p.mesh.geometry.dispose()
    for (const o of p.originelen) {
      o.mesh.userData.inPakket = false
      // Wat ooit bewoog, voegen we niet opnieuw samen.
      o.mesh.userData.los = true
      o.mesh.layers.enable(0)
    }
  }

  // Zichtbaar ten opzichte van de top (de top zelf mag aan en uit: de kelder doet dat).
  const zichtbaarTotTop = (m: THREE.Object3D, top: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = m; p && p !== top; p = p.parent) if (!p.visible) return false
    return true
  }
  const nogDaar = (m: THREE.Object3D, top: THREE.Object3D) => {
    for (let p = m.parent; p; p = p.parent) if (p === top) return true
    return false
  }

  return {
    update() {
      beeld++
      if (beeld < WACHT) return
      // 1. Samenvoegen, verspreid over beelden.
      if (wachtrij.length) {
        const start = performance.now()
        while (wachtrij.length && performance.now() - start < BUDGET_MS) voegSamenOnder(wachtrij.shift()!)
      }
      // 2. Nakijken of een origineel toch veranderde.
      const n = Math.min(CONTROLE_PER_BEELD, originelen.length)
      for (let k = 0; k < n; k++) {
        const o = originelen[controle]
        controle = (controle + 1) % originelen.length
        if (o.pakket.los) continue
        const m = o.mesh
        let veranderd = m.material !== o.materiaal || m.geometry !== o.geometrie || !nogDaar(m, o.top) || !zichtbaarTotTop(m, o.top)
        if (!veranderd && versieVan(m.geometry) !== o.versie) veranderd = true
        if (!veranderd && o.materiaal !== o.pakket.mesh.material && materiaalHash(o.materiaal) !== o.hash) veranderd = true
        if (!veranderd) {
          verwacht.multiplyMatrices(o.top.matrixWorld, o.rel)
          const a = verwacht.elements
          const b = m.matrixWorld.elements
          for (let i = 0; i < 16; i++)
            if (Math.abs(a[i] - b[i]) > 1e-4) {
              veranderd = true
              break
            }
        }
        if (veranderd) uitElkaar(o.pakket)
      }
    },
    klaar: () => beeld >= WACHT && wachtrij.length === 0,
    losAlles: () => pakketten.forEach(uitElkaar),
    bespaard: () => pakketten.reduce((s, p) => s + (p.los ? 0 : p.originelen.length - 1), 0),
  }
}
