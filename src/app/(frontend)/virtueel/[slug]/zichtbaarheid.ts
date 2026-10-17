import * as THREE from 'three'

// Wat je niet kan zien, hoeft ook niet getekend te worden.
//
// three.js laat al weg wat buiten beeld valt, maar niet wat achter een muur staat: vanop het veld
// tekende hij de volledige gangen, de loges, de lift en het oefencomplex achter de noordtribune
// mee — honderden tekenopdrachten per beeld die je nooit te zien kreeg. Deze laag doet twee dingen:
//
//  • zones: hele delen van de wereld (de gangen, het oefencomplex, het fandorp, de heli…) krijgen
//    een regel "wanneer kan je dit zien", op basis van waar de camera staat;
//  • kleine dingen op afstand: een beker, een plantje of een bordje van een paar centimeter is op
//    vijftig meter geen pixel groot. Hoe kleiner het voorwerp, hoe sneller het wegvalt.
//
// Het verbergen loopt via de camera-laag (laag 0), niet via `visible`: de modules zetten zelf al
// `visible` aan en uit (de kelder, de goudjacht, de lift…) en die mogen elkaar niet in de weg zitten.
// Wat een eigen laag heeft (je eigen figuur, de spiegelbeelden) blijft buiten schot.

export type Zone = {
  /** De bovenste objecten van dit deel (hun hele boom doet mee). */
  objecten: THREE.Object3D[]
  /**
   * Kan de camera dit deel nu zien? Met `delen` is het antwoord een bitmasker: welke delen van de
   * zone zichtbaar zijn (bv. welke gangen).
   */
  zichtbaar: (camera: THREE.Vector3) => boolean | number
  /** Tot welke delen (bits) hoort een voorwerp met deze omhullende doos? Raakt het er meerdere, dan alle. */
  delen?: (doos: THREE.Box3) => number
}

type Item = { mesh: THREE.Object3D; zone: number; masker: number; klein: boolean; uit: boolean }

const ALLES = 0x7fffffff

/** Een voorwerp met straal r valt weg vanaf r × KLEIN_FACTOR meter (± 3 à 4 pixels op een gewoon
 *  scherm). Was 420; elke tekenopdracht minder telt in een browser. */
const KLEIN_FACTOR = 340
/** Groter dan dit: nooit wegens de grootte (muren, daken, het veld). */
const KLEIN_MAX = 2.5
/** Zoveel voorwerpen per beeld nakijken; de rest komt de volgende beelden aan de beurt. */
const PER_BEELD = 500

export function bouwZichtbaarheid(scene: THREE.Scene, zones: Zone[], opt: { licht: boolean }) {
  scene.updateMatrixWorld(true)
  const items: Item[] = []
  const doos = new THREE.Box3()
  const gezien = new Set<THREE.Object3D>()
  const zoneVanTop = new Map<THREE.Object3D, number>()
  const voeg = (root: THREE.Object3D, zone: number) => {
    root.traverse((o) => {
      if (gezien.has(o)) return
      const m = o as THREE.Mesh
      if (!(m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) return
      // Eigen lagen (je figuur, spiegelbeelden) laten we met rust.
      if (o.layers.mask !== 1) return
      gezien.add(o)
      const geo = m.geometry as THREE.BufferGeometry | undefined
      if (geo && !geo.boundingSphere) geo.computeBoundingSphere()
      const r = geo?.boundingSphere?.radius ?? Infinity
      const sprite = (o as unknown as THREE.Sprite).isSprite
      // Een sprite zonder perspectief (sizeAttenuation uit) is overal even groot: nooit "te klein".
      const vast = sprite && (o as unknown as THREE.Sprite).material.sizeAttenuation === false
      const klein = (sprite && !vast) || (!(o as THREE.InstancedMesh).isInstancedMesh && o.frustumCulled && r < KLEIN_MAX)
      let masker = ALLES
      const delen = zone >= 0 ? zones[zone].delen : undefined
      if (delen) {
        if (geo && !sprite && !(o as THREE.InstancedMesh).isInstancedMesh) {
          if (!geo.boundingBox) geo.computeBoundingBox()
          doos.copy(geo.boundingBox!).applyMatrix4(o.matrixWorld)
        } else {
          // Sprites en instanced meshes: geen betrouwbare doos, dus bij alle delen.
          doos.makeEmpty()
        }
        masker = doos.isEmpty() ? ALLES : delen(doos) || ALLES
      }
      items.push({ mesh: o, zone, masker, klein, uit: false })
    })
  }
  zones.forEach((z, i) =>
    z.objecten.forEach((o) => {
      zoneVanTop.set(o, i)
      voeg(o, i)
    }),
  )
  // Alles wat in geen enkele zone zit, doet wel mee voor de grootte.
  for (const o of scene.children) voeg(o, -1)

  const zoneAan = zones.map(() => ALLES)
  const bol = new THREE.Sphere()
  const factor = opt.licht ? KLEIN_FACTOR * 0.8 : KLEIN_FACTOR
  let volgende = 0
  let gepauzeerd = false

  const zet = (it: Item, uit: boolean) => {
    // De echte stand van de laag, niet wat we dachten: de samenvoeger zet ze ook.
    if (uit === !it.mesh.layers.isEnabled(0)) {
      it.uit = uit
      return
    }
    it.uit = uit
    if (uit) it.mesh.layers.disable(0)
    else it.mesh.layers.enable(0)
  }

  return {
    /** Elk beeld: de zones opnieuw beoordelen en een deel van de kleine voorwerpen nakijken. */
    update(camera: THREE.Vector3) {
      if (gepauzeerd) return
      let zoneWissel = false
      zones.forEach((z, i) => {
        const z0 = z.zichtbaar(camera)
        const aan = z0 === true ? ALLES : z0 === false ? 0 : z0
        if (aan !== zoneAan[i]) {
          zoneAan[i] = aan
          zoneWissel = true
        }
      })
      // Bij een zonewissel alles meteen, anders een schijfje per beeld.
      const n = zoneWissel ? items.length : Math.min(PER_BEELD, items.length)
      for (let k = 0; k < n; k++) {
        const it = items[volgende]
        volgende = (volgende + 1) % items.length
        // Opgenomen in een samengevoegde mesh (samenvoegen.ts): die laat het origineel verborgen.
        if (it.mesh.userData.inPakket) continue
        if (it.zone >= 0 && (zoneAan[it.zone] & it.masker) === 0) {
          zet(it, true)
          continue
        }
        if (!it.klein) {
          zet(it, false)
          continue
        }
        if ((it.mesh as unknown as THREE.Sprite).isSprite) {
          // Een sprite is zo groot als zijn schaal (gloed, lampjes, rook).
          bol.center.setFromMatrixPosition(it.mesh.matrixWorld)
          bol.radius = it.mesh.matrixWorld.getMaxScaleOnAxis() * 0.5
        } else {
          const geo = (it.mesh as THREE.Mesh).geometry
          if (!geo.boundingSphere) geo.computeBoundingSphere()
          bol.copy(geo.boundingSphere!).applyMatrix4(it.mesh.matrixWorld)
        }
        zet(it, camera.distanceTo(bol.center) - bol.radius > bol.radius * factor)
      }
    },
    /** Een mesh die later bijkomt (bv. een samengevoegde) onder het bovenste object `top`. */
    voegToe(mesh: THREE.Object3D, top: THREE.Object3D) {
      voeg(mesh, zoneVanTop.get(top) ?? -1)
    },
    /** Alles tonen en niets meer verbergen (om te vergelijken of het beeld identiek is). */
    pauzeer() {
      gepauzeerd = true
      for (const it of items) if (!it.mesh.userData.inPakket) zet(it, false)
    },
    /** Hoeveel er nu verborgen is (voor de tests). */
    verborgen: () => items.reduce((s, it) => s + (it.mesh.layers.isEnabled(0) ? 0 : 1), 0),
  }
}
