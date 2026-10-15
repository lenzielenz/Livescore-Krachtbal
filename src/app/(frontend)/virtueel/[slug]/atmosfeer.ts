import * as THREE from 'three'

// Atmosfeer: wat de lucht zelf zichtbaar maakt. Damp die opstijgt (sauna, bubbelbad, douches),
// mist die over het water of over het plein hangt, lichtbundels waar je het licht door de lucht
// ziet gaan, en stofjes die in die bundels zweven.
//
// Alles draait op de grafische kaart: de deeltjes bewegen in de vertex-shader (geen JavaScript per
// deeltje), de bundels en de mist zijn additieve vlakken met een verloop. Eén tijd-uniform per
// bouwsel; `update(seconden)` zet die.

export type Atmosfeer = { groep: THREE.Group; update: (seconden: number) => void }

const zacht = (() => {
  let tex: THREE.CanvasTexture | null = null
  return () => {
    if (tex) return tex
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.45, 'rgba(255,255,255,.45)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
    tex = new THREE.CanvasTexture(c)
    return tex
  }
})()

export type DampBron = {
  x: number
  y: number
  z: number
  /** Hoe breed de bron is (straal, m) en hoe hoog de damp stijgt (m). */
  straal: number
  hoogte: number
  aantal: number
  kleur?: string
  /** Grootte van een wolkje (m) en hoe zichtbaar (0–1). */
  grootte?: number
  sterkte?: number
  /** Hoe lang een wolkje erover doet om op te stijgen (s). */
  duur?: number
}

/**
 * Opstijgende damp: zachte wolkjes die uit een bron opborrelen, uitdijen, wat wiegen en vervagen.
 * Normale (niet-additieve) menging, zodat damp ook voor een donkere muur wit-grijs blijft.
 */
export function bouwDamp(bronnen: DampBron[], opt: { schaal?: number } = {}): Atmosfeer {
  const groep = new THREE.Group()
  const tijd = { value: 0 }
  for (const b of bronnen) {
    const n = Math.max(4, Math.round(b.aantal * (opt.schaal ?? 1)))
    const pos = new Float32Array(n * 3)
    const fase = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * b.straal
      pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3)
      fase[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('fase', new THREE.BufferAttribute(fase, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTijd: tijd,
        uKaart: { value: zacht() },
        uKleur: { value: new THREE.Color(b.kleur ?? '#f1f5f9') },
        uHoogte: { value: b.hoogte },
        uDuur: { value: b.duur ?? 5 },
        uGrootte: { value: (b.grootte ?? 0.9) * 300 },
        uSterkte: { value: b.sterkte ?? 0.35 },
      },
      vertexShader: /* glsl */ `
        uniform float uTijd, uHoogte, uDuur, uGrootte;
        attribute float fase;
        varying float vT;
        void main() {
          float t = fract(uTijd / uDuur + fase);
          vT = t;
          vec3 p = position;
          p.y += t * uHoogte;
          // Wiegen en uitwaaieren terwijl het stijgt.
          p.x += sin(uTijd * 0.7 + fase * 31.0) * 0.25 * t + p.x * t * 0.8;
          p.z += cos(uTijd * 0.6 + fase * 17.0) * 0.25 * t + p.z * t * 0.8;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uGrootte * (0.45 + t * 1.1) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uKaart;
        uniform vec3 uKleur;
        uniform float uSterkte;
        varying float vT;
        void main() {
          float a = texture2D(uKaart, gl_PointCoord).a * uSterkte * smoothstep(0.0, 0.15, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
          if (a < 0.004) discard;
          gl_FragColor = vec4(uKleur, a);
        }`,
      transparent: true,
      depthWrite: false,
    })
    const pts = new THREE.Points(geo, mat)
    pts.position.set(b.x, b.y, b.z)
    pts.frustumCulled = false
    groep.add(pts)
  }
  return { groep, update: (s) => (tijd.value = s) }
}

/** Zwevende stofjes in een doos (bv. in een lichtbundel): traag dwarrelend, licht oplichtend. */
export function bouwStof(dozen: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; aantal: number; kleur?: string }[]): Atmosfeer {
  const groep = new THREE.Group()
  const tijd = { value: 0 }
  for (const d of dozen) {
    const pos = new Float32Array(d.aantal * 3)
    for (let i = 0; i < d.aantal; i++) pos.set([d.x0 + Math.random() * (d.x1 - d.x0), d.y0 + Math.random() * (d.y1 - d.y0), d.z0 + Math.random() * (d.z1 - d.z0)], i * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTijd: tijd, uKaart: { value: zacht() }, uKleur: { value: new THREE.Color(d.kleur ?? '#fff6dc') } },
      vertexShader: /* glsl */ `
        uniform float uTijd;
        varying float vFlik;
        void main() {
          vec3 p = position;
          float s = p.x * 1.7 + p.z * 2.3;
          p.x += sin(uTijd * 0.21 + s) * 0.35;
          p.y += sin(uTijd * 0.17 + s * 1.3) * 0.25;
          p.z += cos(uTijd * 0.19 + s * 0.7) * 0.35;
          vFlik = 0.5 + 0.5 * sin(uTijd * 1.3 + s * 5.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 9.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uKaart;
        uniform vec3 uKleur;
        varying float vFlik;
        void main() {
          float a = texture2D(uKaart, gl_PointCoord).a * (0.25 + 0.55 * vFlik);
          gl_FragColor = vec4(uKleur * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    groep.add(pts)
  }
  return { groep, update: (s) => (tijd.value = s) }
}

/**
 * Een lichtbundel door de lucht: een kegel van `van` naar `naar`, helder bij de bron en uitdovend,
 * zacht aan de randen (hoe schuiner je erdoor kijkt, hoe minder je ziet — zoals echte volumetrie),
 * met trage strepen erin (stof en damp die door het licht bewegen).
 */
export function bouwBundels(
  bundels: { van: THREE.Vector3; naar: THREE.Vector3; straalVan: number; straalNaar: number; kleur: string; sterkte?: number }[],
): Atmosfeer {
  const groep = new THREE.Group()
  const tijd = { value: 0 }
  for (const b of bundels) {
    const lengte = b.van.distanceTo(b.naar)
    const geo = new THREE.CylinderGeometry(b.straalVan, b.straalNaar, lengte, 32, 1, true).translate(0, -lengte / 2, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTijd: tijd, uKleur: { value: new THREE.Color(b.kleur) }, uSterkte: { value: b.sterkte ?? 0.35 } },
      vertexShader: /* glsl */ `
        varying float vV;
        varying vec3 vN;
        varying vec3 vZicht;
        varying float vHoek;
        void main() {
          vV = uv.y;
          vHoek = uv.x;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vZicht = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTijd, uSterkte;
        uniform vec3 uKleur;
        varying float vV;
        varying vec3 vN;
        varying vec3 vZicht;
        varying float vHoek;
        void main() {
          float rand = pow(abs(dot(vN, vZicht)), 1.6);
          float lengte = pow(vV, 1.4);
          float strepen = 0.75 + 0.25 * sin(vHoek * 40.0 + uTijd * 0.6) * sin(vV * 9.0 - uTijd * 0.8);
          float a = rand * lengte * strepen * uSterkte;
          gl_FragColor = vec4(uKleur * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(b.van)
    // De kegel wijst van `van` naar `naar` (de cilinder hangt langs -y).
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.naar.clone().sub(b.van).normalize())
    groep.add(m)
  }
  return { groep, update: (s) => (tijd.value = s) }
}

/**
 * Mist die laag over een vlak hangt (water, plein): een paar lagen zachte, traag schuivende
 * slierten boven elkaar.
 */
export function bouwMist(vlakken: { x: number; y: number; z: number; b: number; d: number; kleur?: string; sterkte?: number; lagen?: number }[]): Atmosfeer {
  const groep = new THREE.Group()
  const tijd = { value: 0 }
  for (const v of vlakken) {
    const lagen = v.lagen ?? 3
    for (let k = 0; k < lagen; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTijd: tijd, uKleur: { value: new THREE.Color(v.kleur ?? '#e2e8f0') }, uSterkte: { value: (v.sterkte ?? 0.18) * (1 - k * 0.25) }, uZaad: { value: k * 7.3 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTijd, uSterkte, uZaad;
          uniform vec3 uKleur;
          varying vec2 vUv;
          float ruis(vec2 p) { return sin(p.x) * sin(p.y * 1.3 + uZaad) * 0.5 + 0.5; }
          void main() {
            vec2 p = vUv * vec2(6.0, 6.0);
            float n = ruis(p + vec2(uTijd * 0.05 + uZaad, uTijd * 0.03)) * 0.6 + ruis(p * 2.1 - vec2(uTijd * 0.04, uZaad)) * 0.4;
            vec2 r = min(vUv, 1.0 - vUv);
            float rand = smoothstep(0.0, 0.18, min(r.x, r.y));
            float a = smoothstep(0.35, 0.95, n) * rand * uSterkte;
            gl_FragColor = vec4(uKleur, a);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const m = new THREE.Mesh(new THREE.PlaneGeometry(v.b, v.d).rotateX(-Math.PI / 2), mat)
      m.position.set(v.x, v.y + k * 0.22, v.z)
      groep.add(m)
    }
  }
  return { groep, update: (s) => (tijd.value = s) }
}

/** Meerdere atmosferen samen in één groep. */
export function samen(...lijst: Atmosfeer[]): Atmosfeer {
  const groep = new THREE.Group()
  for (const a of lijst) groep.add(a.groep)
  return { groep, update: (s) => lijst.forEach((a) => a.update(s)) }
}
