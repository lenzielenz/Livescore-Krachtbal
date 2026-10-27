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
// gespiegelde meshes (negatieve schaal keert de voorkant om); meshes op een eigen laag. Patches
// die enkel met de wereldpositie rekenen (lichtkaart.ts, nacht.ts) zetten userData.wereldPatch en
// gaan wél mee.
// Materiaalwijzigingen (een kleur die ademt, een textuur die schuift) blijven gewoon werken: de
// samengevoegde mesh gebruikt hetzelfde materiaal-object.
//
// Per materiaal wordt bovendien per vak van CEL meter gegroepeerd, zodat three wat buiten beeld
// valt nog altijd kan overslaan.

const CEL = 28
/** Wachten voor we beginnen samenvoegen: zoveel beelden én zoveel seconden (een traag toestel haalt
 *  de beelden niet, maar wat beweegt, verraadt zich in die tijd evengoed). */
const WACHT = 30
const WACHT_S = 2.5
/** Zoveel originelen per beeld nakijken. */
const CONTROLE_PER_BEELD = 900
/** Tijd per beeld voor het samenvoegen zelf (ms): verspreid over beelden, geen hapering. */
const BUDGET_MS = 4
/** Zoveel meshes hoogstens in één samengevoegde mesh (één stuk werk). */
const MAX_PER_PAKKET = 48

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
  // Eigen shadercode rekent meestal met de lokale vorm (een vlag die wappert): niet samenvoegen.
  // Enkel patches die met de wereldpositie werken (de lichtkaart, het hoogteverloop) zeggen dat
  // zelf (userData.wereldPatch) en mogen wel.
  if ((mat as THREE.ShaderMaterial).isShaderMaterial || (mat.onBeforeCompile !== basisCompile && mat.userData.wereldPatch !== true)) return false
  const g = m.geometry
  if (!g?.attributes.position || Object.keys(g.morphAttributes).length || (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return false
  if (Object.values(g.attributes).some((a) => (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || (a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute)) return false
  return m.matrixWorld.determinant() > 0
}

/** Enkel voor het ontwikkelen: waarom gaan de meshes onder `top` (niet) samen? */
export function ontleedSamenvoegen(top: THREE.Object3D): Record<string, number> {
  const uit: Record<string, number> = {}
  const tel = (k: string) => (uit[k] = (uit[k] ?? 0) + 1)
  const bezoek = (o: THREE.Object3D, zichtbaar: boolean) => {
    if (o.userData.los) return tel('los')
    const m = o as THREE.Mesh
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) {
      if (!zichtbaar) tel('ouderOnzichtbaar')
      else if (m.userData.inPakket) tel('inPakket')
      else if (m.userData.samengevoegd) tel('samengevoegd')
      else if (geschikt(m)) tel('geschikt')
      else {
        const mat = m.material
        tel(
          Array.isArray(mat) ? 'array' : m.onBeforeRender !== basisHook ? 'onBeforeRender' : (m.layers.mask & ~1) !== 0 ? 'laag' : !m.visible ? 'onzichtbaar' : (mat as THREE.ShaderMaterial).isShaderMaterial ? 'shader' : mat.onBeforeCompile !== basisCompile && mat.userData.wereldPatch !== true ? 'compile' : m.matrixWorld.determinant() <= 0 ? 'spiegel' : 'geometrie',
        )
      }
    }
    for (const c of o.children) bezoek(c, zichtbaar && c.visible)
  }
  bezoek(top, top.visible)
  // Dezelfde groepering als zoekGroepen, met een proefsamenvoeging van de grootste groep.
  const groepen = new Map<string, THREE.Mesh[]>()
  const centrum = new THREE.Vector3()
  top.traverse((o) => {
    const m = o as THREE.Mesh
    if (!geschikt(m) || m.userData.inPakket || m.userData.los) return
    const geo = m.geometry
    if (!geo.boundingSphere) geo.computeBoundingSphere()
    centrum.copy(geo.boundingSphere!.center).applyMatrix4(m.matrixWorld)
    const cel = `${Math.floor(centrum.x / CEL)},${Math.floor(centrum.y / CEL)},${Math.floor(centrum.z / CEL)}`
    const sleutel = [materiaalSleutel(m.material as THREE.Material), handtekening(geo), m.castShadow, m.receiveShadow, m.renderOrder, m.frustumCulled, cel].join('|')
    groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), m])
  })
  const lijsten = [...groepen.values()].sort((a, b) => b.length - a.length)
  uit.groepen = lijsten.length
  uit.groepen2plus = lijsten.filter((l) => l.length >= 2).length
  uit.grootste = lijsten[0]?.length ?? 0
  if (lijsten[0] && lijsten[0].length >= 2) {
    try {
      const geos = lijsten[0].map((m) => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()))
      const samen = mergeGeometries(geos, false)
      uit.proef = samen ? 1 : 0
      samen?.dispose()
      geos.forEach((g) => g.dispose())
    } catch (e) {
      uit.proefFout = 1
      ;(uit as unknown as Record<string, string>).fout = String((e as Error).message).slice(0, 120)
    }
  }
  return uit
}

export type Samenvoeger = {
  update: () => void
  /** Hoeveel tekenopdrachten het samenvoegen nu uitspaart (voor de tests). */
  bespaard: () => number
  /** Is alles al samengevoegd? */
  klaar: () => boolean
  /** Alles weer uit elkaar (om te vergelijken of het beeld identiek is). */
  losAlles: () => void
  /** Tellers, voor het ontwikkelen. */
  debug: () => Record<string, number>
}

/**
 * Voeg de stilstaande meshes onder de gegeven bovenste objecten samen. `nieuw` krijgt elke nieuwe
 * samengevoegde mesh (om bv. aan de zichtbaarheidslaag te geven).
 */
export function bouwSamenvoeger(scene: THREE.Scene, toppen: THREE.Object3D[], opt: { nieuw?: (mesh: THREE.Mesh, top: THREE.Object3D) => void } = {}): Samenvoeger {
  let beeld = 0
  const begin = performance.now()
  // Het werk in kleine stukjes: eerst per top de groepen zoeken, daarna elke groep apart samenvoegen.
  // Vroeger ging een hele top (bv. het volledige fandorp) in één keer, en dat gaf een schok van een
  // tiende van een seconde, ongeacht het budget per beeld.
  type Taak = { top: THREE.Object3D; topInv?: THREE.Matrix4; lijst?: THREE.Mesh[] }
  const wachtrij: Taak[] = toppen.map((top) => ({ top }))
  const originelen: Origineel[] = []
  const pakketten: Pakket[] = []
  let controle = 0
  /** Tellers voor het ontwikkelen (zie debug()). */
  const tellers = { tops: 0, taken: 0, samengevoegd: 0, teKlein: 0, mislukt: 0, uitElkaar: 0, overgeslagenTop: 0 }
  const verwacht = new THREE.Matrix4()
  const centrum = new THREE.Vector3()

  const zoekGroepen = (top: THREE.Object3D) => {
    tellers.tops++
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
    const taken: Taak[] = []
    for (const lijst of groepen.values()) {
      if (lijst.length < 2) continue
      // Grote groepen in stukken, zodat ook één groep het beeld niet ophoudt.
      for (let i = 0; i < lijst.length; i += MAX_PER_PAKKET) {
        const stuk = lijst.slice(i, i + MAX_PER_PAKKET)
        if (stuk.length >= 2) taken.push({ top, topInv, lijst: stuk })
      }
    }
    tellers.taken += taken.length
    wachtrij.unshift(...taken)
  }

  const voegGroepSamen = (top: THREE.Object3D, topInv: THREE.Matrix4, groep: THREE.Mesh[]) => {
    // Sinds het zoeken kan er al iets bewogen of verdwenen zijn (de controle hieronder markeert dat).
    const lijst = groep.filter((m) => !m.userData.los && !m.userData.inPakket && m.parent)
    if (lijst.length < 2) {
      tellers.teKlein++
      return
    }
    {
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
      if (!samen) {
        tellers.mislukt++
        return
      }
      tellers.samengevoegd++
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
    tellers.uitElkaar++
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
      if (beeld < WACHT || performance.now() - begin < WACHT_S * 1000) return
      // 1. Samenvoegen, verspreid over beelden.
      if (wachtrij.length) {
        const start = performance.now()
        while (wachtrij.length && performance.now() - start < BUDGET_MS) {
          const t = wachtrij.shift()!
          if (t.lijst && t.topInv) voegGroepSamen(t.top, t.topInv, t.lijst)
          else zoekGroepen(t.top)
        }
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
    debug: () => ({ ...tellers, wachtrij: wachtrij.length, pakketten: pakketten.length, toppen: toppen.length }),
    klaar: () => beeld >= WACHT && performance.now() - begin >= WACHT_S * 1000 && wachtrij.length === 0,
    losAlles: () => pakketten.forEach(uitElkaar),
    bespaard: () => pakketten.reduce((s, p) => s + (p.los ? 0 : p.originelen.length - 1), 0),
  }
}
