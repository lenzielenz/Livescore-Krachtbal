import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SavePass } from 'three/examples/jsm/postprocessing/SavePass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

// De nabewerking van het beeld, zoals een camera het zou zien:
//  • gloed (bloom): fel licht (neon, ledborden, lampen, schermen) straalt zacht uit;
//  • de stemming van de plek: warm (sauna, bar, bus) of koel (zwembad, nacht, kleedkamer), met een
//    waas in vochtige ruimtes en een trillende hitte in de sauna;
//  • een zacht vignet en een fijne korrel, zodat het beeld niet "te digitaal" oogt.
// De stemming verschuift traag als je van de ene ruimte naar de andere loopt.
//
// Het grote scherm en het doek in de cinema zijn een gat in het canvas (zie videoscherm.ts): die
// doorzichtigheid bewaren we (SavePass) en zetten we op het einde terug.

export type Stemming = {
  /** -1 = koel en blauw, 0 = neutraal, 1 = warm en amber. */
  warmte: number
  /** Waas (damp, mist), 0–1. */
  waas: number
  /** Trillende hitte, 0–1. */
  hitte: number
  /** Hoe sterk fel licht uitstraalt (vermenigvuldiger). */
  gloed: number
}

export const NEUTRAAL: Stemming = { warmte: 0, waas: 0, hitte: 0, gloed: 1 }

const GradeerShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tAlfa: { value: null as THREE.Texture | null },
    uTijd: { value: 0 },
    uWarmte: { value: 0 },
    uWaas: { value: 0 },
    uHitte: { value: 0 },
    uResolutie: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tAlfa;
    uniform float uTijd, uWarmte, uWaas, uHitte;
    uniform vec2 uResolutie;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // Hitte: het beeld trilt licht, meer onderaan (daar is de lucht het heetst).
      if (uHitte > 0.001) {
        float s = uHitte * 0.0035 * (1.2 - uv.y);
        uv += vec2(sin(uv.y * 48.0 + uTijd * 3.1) * s, cos(uv.x * 40.0 + uTijd * 2.7) * s * 0.6);
      }
      // Een vleugje kleurschifting aan de randen (lenzen doen dat).
      vec2 vanMidden = uv - 0.5;
      float r2 = dot(vanMidden, vanMidden);
      vec2 ca = vanMidden * r2 * 0.006;
      vec3 c = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      // Warm of koel: een kleurtoon op de middentonen, en de schaduwen iets mee gekleurd.
      vec3 warm = vec3(1.08, 0.98, 0.84);
      vec3 koel = vec3(0.86, 0.96, 1.1);
      vec3 toon = uWarmte >= 0.0 ? mix(vec3(1.0), warm, uWarmte) : mix(vec3(1.0), koel, -uWarmte);
      c *= toon;
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 schaduwTint = uWarmte >= 0.0 ? vec3(0.025, 0.012, 0.0) : vec3(0.0, 0.01, 0.03);
      c += schaduwTint * abs(uWarmte) * (1.0 - smoothstep(0.0, 0.25, lum));
      // Waas: de schaduwen lichten op en het contrast zakt, in de kleur van de lucht.
      vec3 waasKleur = uWarmte >= 0.0 ? vec3(0.55, 0.47, 0.38) : vec3(0.42, 0.5, 0.58);
      c = mix(c, c * 0.85 + waasKleur * 0.22, uWaas);
      // Iets meer verzadiging (het oog vindt dat "echt").
      c = mix(vec3(lum), c, 1.08);
      // Vignet en korrel.
      float vig = smoothstep(0.85, 0.25, length(vanMidden * vec2(1.0, 0.85)));
      c *= mix(0.78, 1.0, vig);
      c += (hash(uv * uResolutie + uTijd) - 0.5) * 0.018;
      gl_FragColor = vec4(max(c, 0.0), texture2D(tAlfa, vUv).a);
    }`,
}

export type Nabewerking = {
  render: () => void
  maat: (w: number, h: number, pixels: number) => void
  /** Zet de stemming van de plek waar je bent (het beeld schuift er traag naartoe). */
  stemming: (s: Stemming) => void
  update: (seconden: number, dt: number) => void
  dispose: () => void
}

export function bouwNabewerking(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Nabewerking {
  const doel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat })
  const composer = new EffectComposer(renderer, doel)
  composer.addPass(new RenderPass(scene, camera))
  const bewaar = new SavePass(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }))
  composer.addPass(bewaar)
  const gloed = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82)
  composer.addPass(gloed)
  const gradeer = new ShaderPass(GradeerShader)
  gradeer.uniforms.tAlfa.value = bewaar.renderTarget.texture
  composer.addPass(gradeer)
  composer.addPass(new OutputPass())
  const nu: Stemming = { ...NEUTRAAL }
  let gewenst: Stemming = { ...NEUTRAAL }
  return {
    render: () => composer.render(),
    maat(w, h, pixels) {
      composer.setPixelRatio(pixels)
      composer.setSize(w, h)
      bewaar.renderTarget.setSize(Math.max(1, Math.round(w * pixels)), Math.max(1, Math.round(h * pixels)))
      gradeer.uniforms.uResolutie.value.set(w * pixels, h * pixels)
      // De gloed op halve resolutie: zacht genoeg, en een stuk lichter om te rekenen.
      gloed.resolution.set(Math.round((w * pixels) / 2), Math.round((h * pixels) / 2))
    },
    stemming(s) {
      gewenst = s
    },
    update(seconden, dt) {
      const k = Math.min(1, dt * 1.6)
      nu.warmte += (gewenst.warmte - nu.warmte) * k
      nu.waas += (gewenst.waas - nu.waas) * k
      nu.hitte += (gewenst.hitte - nu.hitte) * k
      nu.gloed += (gewenst.gloed - nu.gloed) * k
      gradeer.uniforms.uTijd.value = seconden
      gradeer.uniforms.uWarmte.value = nu.warmte
      gradeer.uniforms.uWaas.value = nu.waas
      gradeer.uniforms.uHitte.value = nu.hitte
      gloed.strength = 0.55 * nu.gloed
    },
    dispose() {
      composer.dispose()
      doel.dispose()
      bewaar.renderTarget.dispose()
      gloed.dispose()
    },
  }
}
