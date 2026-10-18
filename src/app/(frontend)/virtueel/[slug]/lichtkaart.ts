import * as THREE from 'three'

import { GEVEL, gevelAfstand } from '@/lib/virtueel'

// Slim licht, zoals in Minecraft: een donkere nacht met rond elke lichtbron een warme plas die in
// trappen wegvalt, in plaats van overal even veel licht. Echte lampen rekenen elk voorwerp door en
// zijn te duur voor een browser, dus de lichtkaart doet het met één kaart van het terrein:
//  • elke module meldt haar lichtbronnen aan (lichtBron: plaats, bereik, kleur, sterkte);
//  • bij het opstarten tekenen we ze één keer in een kaart (een textuur van het hele terrein, van
//    boven gezien); het licht valt in ± 8 trappen weg, met een zachte rand;
//  • pas() laat elk gewoon materiaal (Lambert, Standard) in de scène die kaart lezen: licht dat
//    erbij komt, in de kleur van de bron, naar gelang de kleur van het voorwerp zelf. Eén
//    textuuropzoeking per pixel, hoeveel bronnen er ook zijn;
//  • het licht vlamt een beetje, zoals een fakkel, en verdwijnt boven de lampen en onder de grond.
// Binnen het stadion (de gangen, de loges) staat de kaart uit: daar zorgen de eigen lampen voor.

/** Hoeveel meter van het terrein de kaart beslaat: x en z van -KAART/2 tot +KAART/2. */
const KAART = 320
const PIXELS = 1024
const TRAPPEN = 8

type Bron = { x: number; z: number; r: number; kleur: THREE.Color; sterkte: number }
let bronnen: Bron[] = []

/** Een nieuwe opbouw begint: vergeet de bronnen van de vorige. */
export function wisLichtbronnen() {
  bronnen = []
}

/** Meld een lichtbron aan: op (x, z), tot `r` meter ver, in `kleur`; `sterkte` rond 0,5 tot 1,2. */
export function lichtBron(x: number, z: number, r: number, kleur: THREE.ColorRepresentation, sterkte = 0.8) {
  bronnen.push({ x, z, r, kleur: new THREE.Color(kleur), sterkte })
}

export type Lichtkaart = {
  /** Bak de kaart (na het aanmelden van alle bronnen) en laat de materialen in de scène ze lezen. */
  pas: (scene: THREE.Scene) => void
  update: (seconden: number) => void
  dispose: () => void
}

export function bouwLichtkaart(opt: { sterkte?: number } = {}): Lichtkaart {
  const uKaart = { value: null as THREE.Texture | null }
  const uTijd = { value: 0 }
  const uSterkte = { value: opt.sterkte ?? 1 }
  let tekstuur: THREE.DataTexture | null = null
  const gepatcht = new WeakSet<THREE.Material>()

  const bak = () => {
    // Eerst in kommagetallen optellen (meerdere bronnen), dan naar bytes: 8 bits per kleur volstaat
    // voor het licht, en bytes met een lineair filter werken op elk toestel.
    const data = new Float32Array(PIXELS * PIXELS * 3)
    const per = KAART / PIXELS
    const kleur = new THREE.Color()
    for (const b of bronnen) {
      const i0 = Math.max(0, Math.floor((b.x - b.r + KAART / 2) / per))
      const i1 = Math.min(PIXELS - 1, Math.ceil((b.x + b.r + KAART / 2) / per))
      const j0 = Math.max(0, Math.floor((b.z - b.r + KAART / 2) / per))
      const j1 = Math.min(PIXELS - 1, Math.ceil((b.z + b.r + KAART / 2) / per))
      kleur.copy(b.kleur)
      for (let j = j0; j <= j1; j++) {
        const z = j * per - KAART / 2
        for (let i = i0; i <= i1; i++) {
          const x = i * per - KAART / 2
          const d = Math.hypot(x - b.x, z - b.z) / b.r
          if (d >= 1) continue
          // Een heldere kern en een lange uitloop; daarna in trappen (het Minecraft-gevoel).
          const v = Math.pow(1 - d, 2.6) * b.sterkte
          const k = (Math.floor(v * TRAPPEN + 0.5) / TRAPPEN) * 0.6 + v * 0.4
          const o = (j * PIXELS + i) * 3
          data[o] += kleur.r * k
          data[o + 1] += kleur.g * k
          data[o + 2] += kleur.b * k
        }
      }
    }
    // Binnen het stadion en vlak ervoor geen licht van buiten: de muren houden het tegen.
    for (let j = 0; j < PIXELS; j++) {
      const z = j * per - KAART / 2
      for (let i = 0; i < PIXELS; i++) {
        const x = i * per - KAART / 2
        const g = gevelAfstand(GEVEL, x, z)
        if (g < 1.2) {
          const f = Math.max(0, Math.min(1, (g + 0.2) / 1.4))
          const o = (j * PIXELS + i) * 3
          data[o] *= f
          data[o + 1] *= f
          data[o + 2] *= f
        }
      }
    }
    const bytes = new Uint8Array(PIXELS * PIXELS * 4)
    for (let p = 0; p < PIXELS * PIXELS; p++) {
      bytes[p * 4] = Math.min(255, Math.round(data[p * 3] * 255))
      bytes[p * 4 + 1] = Math.min(255, Math.round(data[p * 3 + 1] * 255))
      bytes[p * 4 + 2] = Math.min(255, Math.round(data[p * 3 + 2] * 255))
      bytes[p * 4 + 3] = 255
    }
    const t = new THREE.DataTexture(bytes, PIXELS, PIXELS, THREE.RGBAFormat, THREE.UnsignedByteType)
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    t.needsUpdate = true
    return t
  }

  const patch = (mat: THREE.Material) => {
    if (gepatcht.has(mat)) return
    const m = mat as THREE.MeshLambertMaterial
    if (!(m.isMeshLambertMaterial || (m as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial)) return
    // Doorschijnende gloeivlakken (additief) tellen zelf als licht: niet nog eens belichten.
    if (m.blending !== THREE.NormalBlending) return
    gepatcht.add(mat)
    const vorige = m.onBeforeCompile
    const vorigeSleutel = m.customProgramCacheKey()
    m.onBeforeCompile = (shader, renderer) => {
      vorige.call(m, shader, renderer)
      shader.uniforms.uLichtkaart = uKaart
      shader.uniforms.uLichtTijd = uTijd
      shader.uniforms.uLichtSterkte = uSterkte
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLkW;').replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 lkP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          lkP = instanceMatrix * lkP;
          #endif
          vLkW = (modelMatrix * lkP).xyz;
        }`,
      )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vLkW;\nuniform sampler2D uLichtkaart;\nuniform float uLichtTijd;\nuniform float uLichtSterkte;`)
        .replace(
          '#include <opaque_fragment>',
          `{
            vec2 lkUv = vec2(vLkW.x, vLkW.z) / ${KAART.toFixed(1)} + 0.5;
            vec3 lk = texture2D(uLichtkaart, lkUv).rgb;
            // Een zachte flikkering, per plek anders, als een fakkel.
            lk *= 0.93 + 0.07 * sin(uLichtTijd * 6.0 + vLkW.x * 1.7 + vLkW.z * 1.3) * sin(uLichtTijd * 2.3 + vLkW.x * 0.9);
            // Niet boven de lampen (hoger dan 6 m wordt het steeds minder) en niet onder de grond.
            lk *= (1.0 - smoothstep(3.2, 8.5, vLkW.y)) * smoothstep(-0.6, 0.0, vLkW.y);
            outgoingLight += diffuseColor.rgb * lk * uLichtSterkte * 1.45;
          }
          #include <opaque_fragment>`,
        )
    }
    m.customProgramCacheKey = () => `${vorigeSleutel}|lk`
    m.needsUpdate = true
  }

  return {
    pas(scene) {
      tekstuur?.dispose()
      tekstuur = bak()
      uKaart.value = tekstuur
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patch(mat)
      })
    },
    update(seconden) {
      uTijd.value = seconden
    },
    dispose() {
      tekstuur?.dispose()
    },
  }
}
