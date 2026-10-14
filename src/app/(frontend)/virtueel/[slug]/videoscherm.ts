import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'

import type { StadionThema } from '@/lib/virtueel'

// Het grote ledscherm speelt een echte krachtbalwedstrijd af, in een lus.
// Hoe: een YouTube-speler (privacyvriendelijke nocookie-variant, gedempt zodat hij vanzelf mag
// starten) staat in een CSS3D-laag ACHTER het WebGL-canvas, precies op de plek van het scherm. In
// het canvas "ponsen" we op die plek een gat (een vlak dat volledig doorzichtig schrijft), zodat je
// door het canvas heen de video ziet — en alles wat ervoor staat (publiek, spelers, rook) gewoon
// ervoor blijft staan. Lukt de video niet (geen netwerk, geblokkeerd), dan zie je het clubbeeld.

export const VIDEO_ID = 'MnA_u2gW4Zc'
const PX = 1280
const PY = 720

export type Videoscherm = {
  maat: (w: number, h: number) => void
  render: (camera: THREE.PerspectiveCamera) => void
  geluid: (aan: boolean) => void
  /** Hoe ver je van het scherm staat (voor het geluid op afstand). */
  afstand: (p: THREE.Vector3) => number
  dispose: () => void
}

export function bouwVideoscherm(
  scene: THREE.Scene,
  opt: { houder: HTMLElement; thema: StadionThema; scherm: { x: number; y: number; z: number; b: number; h: number } },
): Videoscherm {
  const { houder, thema, scherm } = opt
  const css = new CSS3DRenderer()
  css.domElement.className = 'vk-videolaag'
  houder.prepend(css.domElement)
  const cssScene = new THREE.Scene()

  const doos = document.createElement('div')
  doos.className = 'vk-video'
  doos.style.width = `${PX}px`
  doos.style.height = `${PY}px`
  doos.style.setProperty('--prim', thema.primair)
  doos.style.setProperty('--sec', thema.secundair)
  const reserve = document.createElement('div')
  reserve.className = 'vk-video-reserve'
  reserve.textContent = `${thema.naam} · KRACHTBAL TV`
  doos.appendChild(reserve)
  const iframe = document.createElement('iframe')
  iframe.src = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${VIDEO_ID}&controls=0&playsinline=1&modestbranding=1&rel=0&enablejsapi=1`
  iframe.title = 'Krachtbalwedstrijd op het grote scherm'
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.loading = 'lazy'
  iframe.tabIndex = -1
  doos.appendChild(iframe)
  const obj = new CSS3DObject(doos)
  obj.position.set(scherm.x + 0.02, scherm.y, scherm.z)
  obj.rotation.y = Math.PI / 2
  obj.scale.setScalar(scherm.b / PX)
  cssScene.add(obj)

  // Het gat in het canvas: schrijft (0,0,0,0) en diepte, zodat wat ervoor staat er wel over tekent.
  const gat = new THREE.Mesh(
    new THREE.PlaneGeometry(scherm.b, scherm.h),
    new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: false, blending: THREE.NoBlending, fog: false, toneMapped: false }),
  )
  gat.position.set(scherm.x + 0.02, scherm.y, scherm.z)
  gat.rotation.y = Math.PI / 2
  scene.add(gat)

  const midden = new THREE.Vector3(scherm.x, scherm.y, scherm.z)
  return {
    maat(w, h) {
      css.setSize(w, h)
    },
    render(camera) {
      // Achter het scherm (of heel ver weg) heeft de laag geen zin: dan tekenen we ze niet.
      const zichtbaar = camera.position.x > scherm.x + 0.3 && camera.position.distanceTo(midden) < 260
      doos.style.display = zichtbaar ? '' : 'none'
      gat.visible = zichtbaar
      if (zichtbaar) css.render(cssScene, camera)
    },
    geluid(aan) {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: aan ? 'unMute' : 'mute', args: [] }), 'https://www.youtube-nocookie.com')
      if (aan) iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), 'https://www.youtube-nocookie.com')
    },
    afstand: (p) => p.distanceTo(midden),
    dispose() {
      css.domElement.remove()
    },
  }
}
