import * as THREE from 'three'

// 's Avonds hoort er schaduw en gradatie in: niet één egaal rood of blauw op elke pilaar, balk en
// banier, en geen pad dat zelf licht lijkt te geven. Twee hulpjes, beide zonder echte lampen:
//  • kleurTrap: een clubkleur in vier trappen (licht, midden, donker, diep), voor wisselend gebruik
//    op lamellen, pilaren, balken en banieren;
//  • hoogteVerloop: een materiaal wordt donkerder naar de grond toe (gebakken schaduw van de grond
//    en het gebouw), zodat een pilaar of lamel niet van boven tot onder even fel is.

export type KleurTrap = { licht: THREE.Color; midden: THREE.Color; donker: THREE.Color; diep: THREE.Color }

/** Een kleur in vier trappen; de tint blijft, de helderheid (en een beetje de verzadiging) verschilt. */
export function kleurTrap(kleur: THREE.ColorRepresentation): KleurTrap {
  const c = new THREE.Color(kleur)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  const trap = (lf: number, sf: number) => new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * sf), Math.min(0.92, hsl.l * lf))
  return { licht: c.clone().lerp(new THREE.Color('#ffffff'), 0.16), midden: c, donker: trap(0.62, 1.04), diep: trap(0.4, 1.1) }
}

/**
 * Maakt een materiaal donkerder naar de grond toe: op hoogte `van` (m) is de kleur `min` keer zo
 * fel, op hoogte `tot` volledig. Werkt ook met InstancedMesh en samengevoegde meshes (hoogte in de
 * wereld).
 */
export function hoogteVerloop<T extends THREE.Material>(mat: T, o: { van?: number; tot?: number; min?: number } = {}): T {
  const van = (o.van ?? 0).toFixed(2)
  const tot = (o.tot ?? 4).toFixed(2)
  const min = (o.min ?? 0.55).toFixed(2)
  const vorige = mat.onBeforeCompile
  const vorigeSleutel = mat.customProgramCacheKey()
  // Rekent enkel met de wereldhoogte: veilig om samen te voegen (zie samenvoegen.ts).
  if (vorige === THREE.Material.prototype.onBeforeCompile || mat.userData.wereldPatch === true) mat.userData.wereldPatch = true
  mat.onBeforeCompile = (shader, renderer) => {
    vorige.call(mat, shader, renderer)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHoogteN;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 wpN = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        wpN = instanceMatrix * wpN;
        #endif
        vHoogteN = (modelMatrix * wpN).y;
      }`,
    )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHoogteN;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(${min}, 1.0, smoothstep(${van}, ${tot}, vHoogteN));`)
  }
  mat.customProgramCacheKey = () => `${vorigeSleutel}|hv${van},${tot},${min}`
  mat.needsUpdate = true
  return mat
}
